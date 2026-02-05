"use server";

import { prisma } from "@/lib/prisma";


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

export async function getWarehouses() {
    try {
        const warehouses = await prisma.warehouse.findMany({
            orderBy: { name: "asc" }
        });
        return { success: true, data: warehouses };
    } catch (error) {
        // Fallback for initial request or if table empty
        console.error("Error fetching warehouses:", error);
        return { success: false, data: [] };
    }
}

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
