"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createWorker(formData: FormData) {
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
    }[],
    date: string,
    shiftId: number,
    supervisor: string
) {
    try {
        const dateObj = new Date(date);

        await prisma.$transaction(async (tx) => {
            for (const record of attendanceData) {
                // Delete existing
                await tx.attendance.deleteMany({
                    where: {
                        workerId: record.workerId,
                        date: dateObj,
                        shiftId,
                    },
                });

                // Create new
                await tx.attendance.create({
                    data: {
                        workerId: record.workerId,
                        date: dateObj,
                        status: record.status,
                        notes: record.notes || null,
                        shiftId,
                        supervisor,
                    },
                });
            }
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
