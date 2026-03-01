"use server";

import { prisma } from "@/lib/prisma";
import { authOptions, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

interface RegisterResult {
    success: boolean;
    message: string;
}

const PROFILE_ADMIN_ROLES = new Set(["manager", "admin"]);

export async function registerUser(formData: FormData): Promise<RegisterResult> {
    const session = await getServerSession(authOptions);
    const isDev = process.env.NODE_ENV !== "production";

    if (!isDev && (!session || !PROFILE_ADMIN_ROLES.has(session.user.role))) {
        return { success: false, message: "Unauthorized" };
    }

    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const regions = formData.getAll("regions") as string[];

    if (!username || !password || !name) {
        return { success: false, message: "All fields are required" };
    }

    try {
        // Check if username exists
        const existing = await prisma.user.findUnique({
            where: { username },
        });

        if (existing) {
            return { success: false, message: "Username already exists" };
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                name,
                role: "supervisor",
                region: regions.join(","),
            },
        });

        revalidatePath("/login");
        return { success: true, message: "Registration successful" };
    } catch (error) {
        console.error("Registration error:", error);
        return { success: false, message: "Registration failed" };
    }
}

export async function updateUserProfile(
    oldUsername: string,
    formData: FormData
): Promise<RegisterResult> {
    const session = await getServerSession(authOptions);
    if (!session) {
        return { success: false, message: "Unauthorized" };
    }

    const canEditOthers =
        PROFILE_ADMIN_ROLES.has(session.user.role);

    if (!canEditOthers && session.user.username !== oldUsername) {
        return { success: false, message: "Unauthorized" };
    }

    const newUsername = formData.get("username") as string;
    const newName = formData.get("name") as string;
    const newPassword = formData.get("password") as string;

    try {
        // Check if new username is taken by someone else
        if (newUsername !== oldUsername) {
            const existing = await prisma.user.findUnique({
                where: { username: newUsername },
            });
            if (existing) {
                return { success: false, message: "Username already taken" };
            }
        }

        const updateData: { username?: string; name?: string; password?: string } = {};

        if (newUsername !== oldUsername) {
            updateData.username = newUsername;
        }

        if (newName) {
            updateData.name = newName;
        }

        if (newPassword) {
            updateData.password = await hashPassword(newPassword);
        }

        await prisma.user.update({
            where: { username: oldUsername },
            data: updateData,
        });

        return { success: true, message: "Profile updated successfully" };
    } catch (error) {
        console.error("Update error:", error);
        return { success: false, message: "Update failed" };
    }
}
