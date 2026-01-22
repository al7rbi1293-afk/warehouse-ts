"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function createWorker(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    const name = formData.get("name") as string;
    const empId = formData.get("empId") as string;
    const role = formData.get("role") as string;
    const region = formData.get("region") as string;
    const shiftId = formData.get("shiftId") as string;

    try {
        await prisma.worker.create({
            data: {
                name,
                empId,
                role,
                region,
                shiftId: shiftId ? parseInt(shiftId) : null,
                status: "Active",
            },
        });

        revalidatePath("/manpower");
        return { success: true, message: "Worker added successfully" };
    } catch (error) {
        console.error("Create worker error:", error);
        return { success: false, message: "Failed to add worker" };
    }
}

export async function updateWorker(
    id: number,
    data: {
        name?: string;
        empId?: string;
        role?: string;
        region?: string;
        status?: string;
        shiftId?: number | null;
    }
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.worker.update({
            where: { id },
            data,
        });

        revalidatePath("/manpower");
        return { success: true, message: "Worker updated successfully" };
    } catch (error) {
        console.error("Update worker error:", error);
        return { success: false, message: "Failed to update worker" };
    }
}

export async function deleteWorker(id: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        // Delete related attendance records first
        await prisma.attendance.deleteMany({
            where: { workerId: id },
        });

        // Delete the worker
        await prisma.worker.delete({
            where: { id },
        });

        revalidatePath("/manpower");
        return { success: true, message: "Worker deleted successfully" };
    } catch (error) {
        console.error("Delete worker error:", error);
        return { success: false, message: "Failed to delete worker" };
    }
}

export async function createShift(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    const name = formData.get("name") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;

    try {
        await prisma.shift.create({
            data: {
                name,
                startTime,
                endTime,
            },
        });

        revalidatePath("/manpower");
        return { success: true, message: "Shift added successfully" };
    } catch (error) {
        console.error("Create shift error:", error);
        return { success: false, message: "Failed to add shift" };
    }
}

export async function submitAttendance(
    workerId: number,
    date: string,
    status: string,
    notes: string,
    shiftId: number,
    supervisor: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        // Delete existing attendance for this worker on this date and shift
        await prisma.attendance.deleteMany({
            where: {
                workerId,
                date: new Date(date),
                shiftId,
            },
        });

        // Create new attendance record
        await prisma.attendance.create({
            data: {
                workerId,
                date: new Date(date),
                status,
                notes: notes || null,
                shiftId,
                supervisor,
            },
        });

        revalidatePath("/manpower");
        return { success: true, message: "Attendance recorded" };
    } catch (error) {
        console.error("Submit attendance error:", error);
        return { success: false, message: "Failed to record attendance" };
    }
}

export async function submitBulkAttendance(
    attendanceData: {
        workerId: number;
        status: string;
        notes: string;
        shiftId?: number | null;
    }[],
    date: string,
    shiftId: number,
    supervisor: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const dateObj = new Date(date);
        const workerIds = attendanceData.map(r => r.workerId);

        // Delete all existing attendance records for these workers on this date
        // We do NOT filter by shiftId here, to avoid duplicates if a worker checks in different shifts on same day (unless that is desired, but usually it's one record per day)
        // OR if they changed shift. We want to overwrite the daily record.
        await prisma.attendance.deleteMany({
            where: {
                workerId: { in: workerIds },
                date: dateObj,
            },
        });

        // Create all new records in one operation
        await prisma.attendance.createMany({
            data: attendanceData.map(record => ({
                workerId: record.workerId,
                date: dateObj,
                status: record.status,
                notes: record.notes || null,
                shiftId: record.shiftId ?? (shiftId || null),
                supervisor,
            })),
        });

        revalidatePath("/manpower");
        return { success: true, message: `Recorded attendance for ${attendanceData.length} workers` };
    } catch (error) {
        console.error("Bulk attendance error:", error);
        return { success: false, message: "Failed to record attendance" };
    }
}

export async function updateSupervisorProfile(
    username: string,
    region: string,
    role: string,
    shiftId: number | null
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        await prisma.user.update({
            where: { username },
            data: {
                region,
                role,
                shiftId,
            },
        });

        revalidatePath("/manpower");
        return { success: true, message: "Profile updated successfully" };
    } catch (error) {
        console.error("Update supervisor error:", error);
        return { success: false, message: "Failed to update profile" };
    }
}
