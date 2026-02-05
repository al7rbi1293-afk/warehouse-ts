"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
                shift: { select: { name: true } }
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
                user: { select: { name: true, role: true } },
                coverUser: { select: { name: true } }
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
                coveredBy: status === "Absent" ? coveredBy : null, // Only clear coveredBy if Present, or update if Absent
                notes
            },
            create: {
                userId,
                date: new Date(date),
                status,
                coveredBy: status === "Absent" ? coveredBy : null,
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
