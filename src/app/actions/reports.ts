"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface StaffReportRow {
    id: number;
    name: string;
    empId: string;
    status: string;
    notes: string;
    role: string;
    shift: string;
}

export interface WorkerReportRow {
    id: number;
    name: string;
    empId: string | null;
    status: string | null;
    notes: string | null;
    region: string;
    shift: string | null;
}

export interface MasterReportData {
    management: StaffReportRow[];
    supervisors: StaffReportRow[];
    morning: Record<string, WorkerReportRow[]>;
    night: Record<string, WorkerReportRow[]>;
    dates: {
        morning: string;
        night: string;
    };
}

type StaffAttendanceWithCover = Prisma.StaffAttendanceGetPayload<{
    include: { coverUser: true };
}>;

type UserWithAttendanceAndShift = Prisma.UserGetPayload<{
    include: {
        attendance: { include: { coverUser: true } };
        shift: true;
    };
}>;

type AttendanceWithWorkerShift = Prisma.AttendanceGetPayload<{
    include: {
        worker: {
            include: { shift: true };
        };
    };
}>;

export async function fetchMasterReportData(dateStr: string): Promise<MasterReportData | { error: string }> {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'admin'].includes(session.user.role)) {
        return { error: "Unauthorized" };
    }

    // Parse date (Morning Shift Date)
    const [year, month, day] = dateStr.split('-').map(Number);
    const morningDate = new Date(year, month - 1, day);
    morningDate.setHours(0, 0, 0, 0);

    const morningNextDay = new Date(morningDate);
    morningNextDay.setDate(morningDate.getDate() + 1);

    // Night Shift Date (Previous Day)
    const nightDate = new Date(morningDate);
    nightDate.setDate(morningDate.getDate() - 1);

    const nightNextDay = new Date(nightDate);
    nightNextDay.setDate(nightDate.getDate() + 1);

    try {
        const [morningAttendance, nightAttendance, managers, supervisors] = await Promise.all([
            // 1. Fetch Morning Shift Data (A1, etc.) for Selected Date
            prisma.attendance.findMany({
                where: {
                    date: { gte: morningDate, lt: morningNextDay },
                    worker: {
                        shift: {
                            name: { in: ['A1', 'A', 'A2', 'Morning'] } // Adjust based on exact shift names in DB
                        }
                    }
                },
                include: {
                    worker: {
                        include: { shift: true }
                    }
                },
                orderBy: {
                    worker: { region: 'asc' } // Grouping logic helper
                }
            }),

            // 2. Fetch Night Shift Data (B1, etc.) for Previous Date
            prisma.attendance.findMany({
                where: {
                    date: { gte: nightDate, lt: nightNextDay },
                    worker: {
                        shift: {
                            name: { in: ['B1', 'B', 'B2', 'Night'] } // Adjust based on exact shift names
                        }
                    }
                },
                include: {
                    worker: {
                        include: { shift: true }
                    }
                },
                orderBy: {
                    worker: { region: 'asc' }
                }
            }),

            // 3. Fetch Management Users
            prisma.user.findMany({
                where: { role: { in: ['manager', 'admin'] } },
                include: {
                    attendance: {
                        where: { date: { gte: morningDate, lt: morningNextDay } }, // Checking Morning Date
                        include: { coverUser: true }
                    },
                    shift: true
                }
            }),

            // 4. Fetch Supervisors
            prisma.user.findMany({
                where: { role: { in: ['supervisor', 'night_supervisor'] } },
                include: {
                    // We need to check attendance for proper date based on their shift
                    attendance: {
                        where: {
                            date: { gte: nightDate, lt: morningNextDay } // Broad fetch, filter in JS
                        },
                        include: { coverUser: true }
                    },
                    shift: true
                }
            })
        ]);

        // Helper to process Staff (Managers/Supervisors)
        const processStaff = (
            users: UserWithAttendanceAndShift[],
            defaultDate: Date
        ): StaffReportRow[] => {
            return users.map(user => {
                // Determine effective date for this user
                let targetDate = defaultDate;
                const shiftName = user.shift?.name || '';

                // If user is clearly Night Shift, use Night Date
                if (['B1', 'B', 'B2', 'Night'].includes(shiftName) || user.role === 'night_supervisor') {
                    targetDate = nightDate;
                } else {
                    targetDate = morningDate;
                }

                // Find attendance for this specific date
                const relevantAttendance = user.attendance.find((a: StaffAttendanceWithCover) => {
                    const aDate = new Date(a.date);
                    return aDate.getFullYear() === targetDate.getFullYear() &&
                        aDate.getMonth() === targetDate.getMonth() &&
                        aDate.getDate() === targetDate.getDate();
                });

                // Auto-Attendance Logic: If no record, default to Present
                // If record exists, use status.
                const status = relevantAttendance?.status || 'Present';

                // Substitution Logic
                let notes = relevantAttendance?.notes || '';
                if (relevantAttendance?.coverUser) {
                    const coverName = relevantAttendance.coverUser.name;
                    const prefix = "Covered by: ";
                    if (!notes.includes(prefix)) {
                        notes = notes ? `${notes}. ${prefix}${coverName}` : `${prefix}${coverName}`;
                    }
                }

                return {
                    id: user.id,
                    name: user.name,
                    empId: user.empId || user.username, // Prefer empId, fallback to username
                    status: status,
                    notes: notes,
                    role: user.role,
                    shift: shiftName
                };
            });
        };

        const managementList = processStaff(managers, morningDate);
        const supervisorList = processStaff(supervisors, morningDate); // Shift logic inside handles night supervisors

        // Helper to Group by Zone (Region)
        const groupByZone = (records: AttendanceWithWorkerShift[]): Record<string, WorkerReportRow[]> => {
            return records.reduce((acc, record) => {
                const zone = record.worker.region || 'Unassigned';
                if (!acc[zone]) {
                    acc[zone] = [];
                }

                acc[zone].push({
                    id: record.worker.id,
                    name: record.worker.name,
                    empId: record.worker.empId,
                    status: record.status,
                    notes: record.notes,
                    region: zone,
                    shift: record.worker.shift?.name || null,
                });
                return acc;
            }, {} as Record<string, WorkerReportRow[]>);
        };

        return {
            management: managementList,
            supervisors: supervisorList,
            morning: groupByZone(morningAttendance),
            night: groupByZone(nightAttendance),
            dates: {
                morning: morningDate.toLocaleDateString('en-US'),
                night: nightDate.toLocaleDateString('en-US')
            }
        };

    } catch (error) {
        console.error("Master Report Fetch Error:", error);
        return { error: "Failed to fetch report data" };
    }
}
