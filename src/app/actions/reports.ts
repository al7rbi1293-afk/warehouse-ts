"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface MasterReportData {
    morning: Record<string, any[]>;
    night: Record<string, any[]>;
    dates: {
        morning: string;
        night: string;
    };
}

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
        const [morningAttendance, nightAttendance] = await Promise.all([
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
            })
        ]);

        // Helper to Group by Zone (Region)
        const groupByZone = (records: any[]) => {
            return records.reduce((acc, record) => {
                // Use worker's assigned zone (region) or shift name if region is missing
                // In this system, A1/B1 seems to be the "Zone" concept effectively for shifts
                // But user asked for "Zone grouping" inside shifts. 
                // Let's use 'region' field from worker.
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
                    shift: record.worker.shift?.name
                });
                return acc;
            }, {} as Record<string, any[]>);
        };

        return {
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
