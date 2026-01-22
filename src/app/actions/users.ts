"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

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
    shiftId?: string | number | null;
}

interface UpdateUserParams {
    name?: string | null;
    role?: string | null;
    region?: string | null;
    shiftId?: string | number | null;
    password?: string | null;
}

export async function createUser(data: CreateUserParams) {
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
                shiftId: data.shiftId ? Number(data.shiftId) : null,
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
    try {
        const updateData: Prisma.UserUncheckedUpdateInput = {};
        if (data.name) updateData.name = data.name;
        if (data.role) updateData.role = data.role;
        // Region and shiftId can be null
        if (data.region !== undefined) updateData.region = data.region;
        if (data.shiftId !== undefined) updateData.shiftId = data.shiftId ? Number(data.shiftId) : null;

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
