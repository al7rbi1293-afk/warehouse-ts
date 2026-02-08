"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Staff attendance statuses
export const STAFF_ATTENDANCE_STATUSES = [
    "Present",
    "Absent",
    "Vacation",
    "Day Off",
    "Sick Leave"
] as const;

export async function getStaffList() {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'admin'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const staff = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                username: true,
                role: true,
                region: true,
                regions: true,
                shift: { select: { id: true, name: true } }
            }
        });
        return { success: true, data: staff };
    } catch (error) {
        console.error("Error fetching staff:", error);
        return { success: false, message: "Failed to fetch staff" };
    }
}

export async function getStaffAttendance(date: string) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'admin'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const attendance = await prisma.staffAttendance.findMany({
            where: {
                date: new Date(date)
            },
            include: {
                user: { select: { name: true, role: true, region: true } },
                coverUser: { select: { name: true, region: true } }
            }
        });
        return { success: true, data: attendance };
    } catch (error) {
        console.error("Error fetching staff attendance:", error);
        return { success: false, message: "Failed to fetch attendance" };
    }
}

export async function markStaffAttendance(
    userId: number,
    status: string,
    date: string,
    coveredBy?: number | null,
    notes?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'admin'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    const isAbsent = ["Absent", "Vacation", "Day Off", "Sick Leave"].includes(status);

    try {
        // Upsert attendance
        await prisma.staffAttendance.upsert({
            where: {
                userId_date: {
                    userId,
                    date: new Date(date)
                }
            },
            update: {
                status,
                coveredBy: isAbsent ? coveredBy : null,
                substituteActive: isAbsent && coveredBy ? true : false,
                notes
            },
            create: {
                userId,
                date: new Date(date),
                status,
                coveredBy: isAbsent ? coveredBy : null,
                substituteActive: isAbsent && coveredBy ? true : false,
                notes
            }
        });

        revalidatePath("/manpower");
        return { success: true, message: "Staff attendance updated" };
    } catch (error) {
        console.error("Error updating staff attendance:", error);
        return { success: false, message: "Failed to update attendance" };
    }
}

// =====================
// Substitute Supervisor Logic
// =====================

/**
 * Assign a substitute supervisor when a supervisor is absent.
 * The substitute temporarily inherits all zones and workers assigned to the original supervisor.
 */
export async function assignSubstitute(
    absentUserId: number,
    substituteUserId: number,
    date: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'admin'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        // Get the absent supervisor's details
        const absentUser = await prisma.user.findUnique({
            where: { id: absentUserId },
            select: { region: true, regions: true, shiftId: true }
        });

        if (!absentUser) {
            return { success: false, message: "Absent supervisor not found" };
        }

        // Update attendance record with substitute
        await prisma.staffAttendance.upsert({
            where: {
                userId_date: {
                    userId: absentUserId,
                    date: new Date(date)
                }
            },
            update: {
                coveredBy: substituteUserId,
                substituteActive: true
            },
            create: {
                userId: absentUserId,
                date: new Date(date),
                status: "Absent",
                coveredBy: substituteUserId,
                substituteActive: true
            }
        });

        revalidatePath("/manpower");
        return {
            success: true,
            message: "Substitute assigned successfully",
            inheritedZones: absentUser.regions || absentUser.region
        };
    } catch (error) {
        console.error("Assign substitute error:", error);
        return { success: false, message: "Failed to assign substitute" };
    }
}

/**
 * Get the zones a substitute should have access to (inherited from absent supervisor)
 */
export async function getSubstituteZones(substituteUserId: number, date: string) {
    try {
        // Find all active substitution records for this user
        const substitutions = await prisma.staffAttendance.findMany({
            where: {
                coveredBy: substituteUserId,
                date: new Date(date),
                substituteActive: true
            },
            include: {
                user: { select: { region: true } }
            }
        });

        // Collect all inherited zones
        const inheritedZones = new Set<string>();
        substitutions.forEach(sub => {
            if (sub.user.region) {
                inheritedZones.add(sub.user.region);
            }
        });

        return { success: true, data: Array.from(inheritedZones) };
    } catch (error) {
        console.error("Get substitute zones error:", error);
        return { success: false, data: [] };
    }
}

// =====================
// Worker Attendance Correction
// =====================

/**
 * Allow supervisors to edit previously submitted worker attendance records
 */
export async function updateWorkerAttendance(
    attendanceId: number,
    data: { status: string; notes?: string; returnDate?: string }
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.attendance.update({
            where: { id: attendanceId },
            data: {
                status: data.status,
                notes: data.notes || null,
                returnDate: data.returnDate ? new Date(data.returnDate) : null
            }
        });

        revalidatePath("/manpower");
        return { success: true, message: "Attendance updated successfully" };
    } catch (error) {
        console.error("Update worker attendance error:", error);
        return { success: false, message: "Failed to update attendance" };
    }
}
