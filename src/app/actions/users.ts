"use server";

import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function createUser(data: any) {
    try {
        const { username, password, name, empId, role, region, regions, shiftId, attendanceShiftId, allowedShifts } = data;

        const hashedPassword = await hash(password, 12);

        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                name,
                empId: empId || null,
                role,
                region: region || regions, // Legacy support
                regions: regions || region, // New field
                shiftId: shiftId ? parseInt(shiftId) : null,
                attendanceShiftId: attendanceShiftId ? parseInt(attendanceShiftId) : null,
                allowedShifts
            }
        });

        revalidatePath("/profile");
        revalidatePath("/settings"); // Assuming user management might be here
        return { success: true };
    } catch (error: any) {
        console.error("Create User Error:", error);
        return { success: false, message: error.message };
    }
}

export async function updateUser(username: string, data: any) {
    try {
        const { password, name, empId, role, region, regions, shiftId, attendanceShiftId, allowedShifts } = data;

        const updateData: any = {
            name,
            empId: empId || null,
            role,
            region: region || regions,
            regions: regions || region,
            shiftId: shiftId ? parseInt(shiftId) : null,
            attendanceShiftId: attendanceShiftId ? parseInt(attendanceShiftId) : null,
            allowedShifts
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
    } catch (error: any) {
        console.error("Update User Error:", error);
        return { success: false, message: error.message };
    }
}

export async function deleteUser(username: string) {
    try {
        await prisma.user.delete({
            where: { username }
        });
        revalidatePath("/profile");
        return { success: true };
    } catch (error: any) {
        console.error("Delete User Error:", error);
        return { success: false, message: error.message };
    }
}
