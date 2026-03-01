"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface UserActionInput {
    username: string;
    password?: string;
    name: string;
    empId?: string | null;
    role: string;
    region?: string | null;
    regions?: string | null;
    shiftId?: string | number | null;
    attendanceShiftId?: string | number | null;
    allowedShifts?: string | null;
}

const USER_ADMIN_ROLES = new Set(["manager", "admin"]);

function parseOptionalInt(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unexpected error";
}

async function requireUserAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || !USER_ADMIN_ROLES.has(session.user.role)) {
        return null;
    }
    return session;
}

export async function createUser(data: UserActionInput) {
    try {
        const session = await requireUserAdmin();
        if (!session) {
            return { success: false, message: "Unauthorized" };
        }

        const { username, password, name, empId, role, region, regions, shiftId, attendanceShiftId, allowedShifts } = data;

        if (!password || password.trim().length < 6) {
            return { success: false, message: "Password must be at least 6 characters" };
        }

        const hashedPassword = await hash(password, 12);

        const createData: Prisma.UserUncheckedCreateInput = {
            username,
            password: hashedPassword,
            name,
            empId: empId || null,
            role,
            region: region || regions || null, // Legacy support
            regions: regions || region || null, // New field
            shiftId: parseOptionalInt(shiftId),
            attendanceShiftId: parseOptionalInt(attendanceShiftId),
            allowedShifts: allowedShifts || null,
        };

        await prisma.user.create({
            data: createData,
        });

        revalidatePath("/profile");
        revalidatePath("/settings"); // Assuming user management might be here
        return { success: true };
    } catch (error: unknown) {
        console.error("Create User Error:", error);
        return { success: false, message: getErrorMessage(error) };
    }
}

export async function updateUser(username: string, data: UserActionInput) {
    try {
        const session = await requireUserAdmin();
        if (!session) {
            return { success: false, message: "Unauthorized" };
        }

        const { password, name, empId, role, region, regions, shiftId, attendanceShiftId, allowedShifts } = data;

        const updateData: Prisma.UserUncheckedUpdateInput = {
            name,
            empId: empId || null,
            role,
            region: region || regions || null,
            regions: regions || region || null,
            shiftId: parseOptionalInt(shiftId),
            attendanceShiftId: parseOptionalInt(attendanceShiftId),
            allowedShifts: allowedShifts || null,
        };

        if (password && password.trim() !== "") {
            updateData.password = await hash(password, 12);
        }

        await prisma.user.update({
            where: { username },
            data: updateData
        });

        revalidatePath("/profile");
        return { success: true };
    } catch (error: unknown) {
        console.error("Update User Error:", error);
        return { success: false, message: getErrorMessage(error) };
    }
}

export async function deleteUser(username: string) {
    try {
        const session = await requireUserAdmin();
        if (!session) {
            return { success: false, message: "Unauthorized" };
        }

        await prisma.user.delete({
            where: { username }
        });
        revalidatePath("/profile");
        return { success: true };
    } catch (error: unknown) {
        console.error("Delete User Error:", error);
        return { success: false, message: getErrorMessage(error) };
    }
}
