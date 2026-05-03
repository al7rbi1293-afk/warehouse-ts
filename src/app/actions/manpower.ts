"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/app/actions/audit";
import { revalidateManpowerData } from "@/lib/cache-tags";
import { logSanitizedDatabaseError } from "@/lib/database-health";

function sanitizeRequiredText(value: FormDataEntryValue | null, fieldName: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
        throw new Error(`${fieldName} is required`);
    }
    return text;
}

function sanitizeOptionalText(value: FormDataEntryValue | null) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
}

function parseOptionalShiftId(value: FormDataEntryValue | null) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
        return null;
    }

    const parsed = Number.parseInt(text, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Shift is invalid");
    }

    return parsed;
}

async function ensureWorkerIdSequence() {
    await prisma.$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('workers', 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM workers), 0), 1),
            true
        )
    `);
}

function isWorkerIdConflict(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        code?: string;
        meta?: { target?: string[] | string };
    };

    if (candidate.code !== "P2002") {
        return false;
    }

    const target = candidate.meta?.target;
    if (Array.isArray(target)) {
        return target.includes("id");
    }

    return target === "id";
}

function getWorkerMutationErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return fallback;
}

async function createWorkerRecord(data: {
    name: string;
    empId: string | null;
    role: string | null;
    region: string | null;
    shiftId: number | null;
}) {
    await prisma.worker.create({
        data: {
            ...data,
            status: "Active",
        },
    });
}

export async function createWorker(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const name = sanitizeRequiredText(formData.get("name"), "Worker name");
        const empId = sanitizeOptionalText(formData.get("empId"));
        const role = sanitizeOptionalText(formData.get("role"));
        const region = sanitizeOptionalText(formData.get("region"));
        const shiftId = parseOptionalShiftId(formData.get("shiftId"));

        const createData = {
            name,
            empId,
            role,
            region,
            shiftId,
        };

        await ensureWorkerIdSequence();

        try {
            await createWorkerRecord(createData);
        } catch (error) {
            if (!isWorkerIdConflict(error)) {
                throw error;
            }

            await ensureWorkerIdSequence();
            await createWorkerRecord(createData);
        }

        await logAudit(session.user.name || session.user.username, "Create Worker", `Created worker ${name} (${role})`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Worker added successfully" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower create-worker", error);
        return {
            success: false,
            message: getWorkerMutationErrorMessage(error, "Failed to add worker"),
        };
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



        await logAudit(session.user.name || session.user.username, "Update Worker", `Updated worker ID ${id}`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Worker updated successfully" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower update-worker", error);
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



        await logAudit(session.user.name || session.user.username, "Delete Worker", `Deleted worker ID ${id}`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Worker deleted successfully" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower delete-worker", error);
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



        await logAudit(session.user.name || session.user.username, "Create Shift", `Created shift ${name}`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Shift added successfully" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower create-shift", error);
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
    if (!session || !['manager', 'supervisor', 'night_supervisor'].includes(session.user.role)) {
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

        await logAudit(session.user.name || session.user.username, "Submit Attendance", `Recorded attendance for worker ID ${workerId} (${status})`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Attendance recorded" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower submit-attendance", error);
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
    if (!session || !['manager', 'supervisor', 'night_supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const dateObj = new Date(date);
        const workerIds = attendanceData.map(r => r.workerId);

        await prisma.$transaction(async (tx) => {
            // Delete all existing attendance records for these workers on this date
            await tx.attendance.deleteMany({
                where: {
                    workerId: { in: workerIds },
                    date: dateObj,
                },
            });

            // Create all new records in one operation
            await tx.attendance.createMany({
                data: attendanceData.map(record => ({
                    workerId: record.workerId,
                    date: dateObj,
                    status: record.status,
                    notes: record.notes || null,
                    shiftId: record.shiftId ?? (shiftId || null),
                    supervisor,
                })),
            });
        });

        await logAudit(session.user.name || session.user.username, "Bulk Attendance", `Submitted attendance for ${attendanceData.length} workers`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: `Recorded attendance for ${attendanceData.length} workers` };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower bulk-attendance", error);
        return { success: false, message: "Failed to record attendance" };
    }
}

export async function updateSupervisorProfile(
    username: string,
    region: string,
    role: string,
    shiftId: number | null,
    allowedShifts?: string | null
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
                allowedShifts: allowedShifts || null
            },
        });



        await logAudit(session.user.name || session.user.username, "Update Profile", `Updated profile for ${username}`, "Manpower");

        revalidateManpowerData();
        return { success: true, message: "Profile updated successfully" };
    } catch (error: unknown) {
        logSanitizedDatabaseError("manpower update-supervisor", error);
        return { success: false, message: "Failed to update profile" };
    }
}
