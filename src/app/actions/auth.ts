"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

interface RegisterResult {
    success: boolean;
    message: string;
}

export async function registerUser(formData: FormData): Promise<RegisterResult> {
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
