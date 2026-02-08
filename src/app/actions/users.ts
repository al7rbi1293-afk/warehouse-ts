"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword, authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

export async function getUsers() {
    try {
        const users = await prisma.user.findMany({
            include: {
                shift: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        return { success: true, data: users };
    } catch (error) {
        console.error("Get users error:", error);
        return { success: false, error: "Failed to fetch users" };
    }
}

// Define types for user actions
interface CreateUserParams {
    username: string;
    password: string;
    name: string | null;
    role: string | null;
    region: string | null;
    regions?: string | null; // Multi-zone: comma-separated list
    shiftId?: string | number | null;
    attendanceShiftId?: string | number | null; // Attendance shift if different
    allowedShifts?: string | null;
    empId?: string | null;
}

interface UpdateUserParams {
    name?: string | null;
    role?: string | null;
    region?: string | null;
    regions?: string | null; // Multi-zone: comma-separated list
    shiftId?: string | number | null;
    attendanceShiftId?: string | number | null; // Attendance shift if different
    password?: string | null;
    allowedShifts?: string | null;
    empId?: string | null;
}

export async function createUser(data: CreateUserParams) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can create users" };
    }

    try {
        // Check existing
        const existing = await prisma.user.findUnique({
            where: { username: data.username },
        });

        if (existing) {
            return { success: false, message: "Username already exists" };
        }

        const hashedPassword = await hashPassword(data.password);

        await prisma.user.create({
            data: {
                username: data.username,
                password: hashedPassword,
                name: data.name || "",
                role: data.role || "staff",
                region: data.region,
                regions: data.regions || null,
                shiftId: data.shiftId ? parseInt(data.shiftId as string) : null,
                attendanceShiftId: data.attendanceShiftId ? parseInt(data.attendanceShiftId as string) : null,
                allowedShifts: data.allowedShifts || null,
                empId: data.empId || null,
            },
        });

        revalidatePath("/manpower");
        return { success: true, message: "User created successfully" };
    } catch (error) {
        console.error("Create user error:", error);
        return { success: false, message: "Failed to create user" };
    }
}

export async function updateUser(username: string, data: UpdateUserParams) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can update users" };
    }

    try {
        const updateData: Prisma.UserUncheckedUpdateInput = {};
        if (data.name) updateData.name = data.name;
        if (data.role) updateData.role = data.role;
        // Region and shiftId can be null
        if (data.region !== undefined) updateData.region = data.region;
        if (data.regions !== undefined) updateData.regions = data.regions;
        if (data.shiftId !== undefined) updateData.shiftId = data.shiftId ? Number(data.shiftId) : null;
        if (data.attendanceShiftId !== undefined) updateData.attendanceShiftId = data.attendanceShiftId ? Number(data.attendanceShiftId) : null;
        if (data.allowedShifts !== undefined) updateData.allowedShifts = data.allowedShifts;
        if (data.empId !== undefined) updateData.empId = data.empId;

        if (data.password && data.password.trim() !== "") {
            updateData.password = await hashPassword(data.password);
        }

        await prisma.user.update({
            where: { username },
            data: updateData,
        });

        revalidatePath("/manpower");
        return { success: true, message: "User updated successfully" };
    } catch (error) {
        console.error("Update user error:", error);
        return { success: false, message: "Failed to update user" };
    }
}

export async function deleteUser(username: string) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can delete users" };
    }

    try {
        await prisma.user.delete({
            where: { username },
        });

        revalidatePath("/manpower");
        return { success: true, message: "User deleted successfully" };
    } catch (error) {
        console.error("Delete user error:", error);
        return { success: false, message: "Failed to delete user" };
    }
}
