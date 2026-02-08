"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// =====================
// Projects
// =====================
export async function getProjects() {
    try {
        const projects = await prisma.project.findMany({
            where: { status: "Active" },
            orderBy: { name: "asc" }
        });
        return { success: true, data: projects };
    } catch (error) {
        console.error("Error fetching projects:", error);
        return { success: false, data: [] };
    }
}

// =====================
// Warehouses
// =====================
export async function getWarehouses() {
    try {
        const warehouses = await prisma.warehouse.findMany({
            orderBy: { name: "asc" }
        });
        return { success: true, data: warehouses };
    } catch (error) {
        console.error("Error fetching warehouses:", error);
        return { success: false, data: [] };
    }
}

// =====================
// Regions - Full CRUD
// =====================
export async function getRegions() {
    try {
        const regions = await prisma.region.findMany({
            orderBy: { name: "asc" }
        });
        return { success: true, data: regions };
    } catch (error) {
        console.error("Error fetching regions:", error);
        return { success: false, data: [] };
    }
}

export async function createRegion(name: string) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can create regions" };
    }

    try {
        const existing = await prisma.region.findUnique({ where: { name } });
        if (existing) {
            return { success: false, message: "Region already exists" };
        }

        await prisma.region.create({ data: { name } });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Region created successfully" };
    } catch (error) {
        console.error("Create region error:", error);
        return { success: false, message: "Failed to create region" };
    }
}

export async function updateRegion(id: number, name: string) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can update regions" };
    }

    try {
        await prisma.region.update({
            where: { id },
            data: { name }
        });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Region updated successfully" };
    } catch (error) {
        console.error("Update region error:", error);
        return { success: false, message: "Failed to update region" };
    }
}

export async function deleteRegion(id: number) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can delete regions" };
    }

    try {
        await prisma.region.delete({ where: { id } });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Region deleted successfully" };
    } catch (error) {
        console.error("Delete region error:", error);
        return { success: false, message: "Failed to delete region" };
    }
}

// =====================
// Shifts - Full CRUD
// =====================
export async function getShifts() {
    try {
        const shifts = await prisma.shift.findMany({
            orderBy: { id: "asc" }
        });
        return { success: true, data: shifts };
    } catch (error) {
        console.error("Error fetching shifts:", error);
        return { success: false, data: [] };
    }
}

export async function createShift(data: { name: string; startTime?: string; endTime?: string }) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can create shifts" };
    }

    try {
        await prisma.shift.create({
            data: {
                name: data.name,
                startTime: data.startTime || null,
                endTime: data.endTime || null,
            }
        });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Shift created successfully" };
    } catch (error) {
        console.error("Create shift error:", error);
        return { success: false, message: "Failed to create shift" };
    }
}

export async function updateShift(id: number, data: { name?: string; startTime?: string; endTime?: string }) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can update shifts" };
    }

    try {
        await prisma.shift.update({
            where: { id },
            data
        });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Shift updated successfully" };
    } catch (error) {
        console.error("Update shift error:", error);
        return { success: false, message: "Failed to update shift" };
    }
}

export async function deleteShift(id: number) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== 'manager') {
        return { success: false, message: "Unauthorized: Only managers can delete shifts" };
    }

    try {
        // Check if any workers or users are using this shift
        const workerCount = await prisma.worker.count({ where: { shiftId: id } });
        const userCount = await prisma.user.count({ where: { shiftId: id } });

        if (workerCount > 0 || userCount > 0) {
            return { success: false, message: `Cannot delete: ${workerCount} workers and ${userCount} users are using this shift` };
        }

        await prisma.shift.delete({ where: { id } });
        revalidatePath("/manpower");
        revalidatePath("/settings");
        return { success: true, message: "Shift deleted successfully" };
    } catch (error) {
        console.error("Delete shift error:", error);
        return { success: false, message: "Failed to delete shift" };
    }
}
