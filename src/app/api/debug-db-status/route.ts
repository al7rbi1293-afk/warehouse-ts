
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface DebugResults {
    activeWorkers?: number;
    attendanceCount?: number;
    pendingRequests?: number;
    inventoryCount?: number;
    lowStock?: { id: number; nameEn: string; qty: number }[];
    workerGroups?: { region: string | null; _count: { id: number } }[];
}

interface DebugErrors {
    activeWorkers?: string;
    attendance?: string;
    requests?: string;
    inventory?: string;
    workerGroups?: string;
}

export async function GET() {
    const results: DebugResults = {};
    const errors: DebugErrors = {};

    try {
        // 1. Workers
        try {
            results.activeWorkers = await prisma.worker.count({ where: { status: "Active" } });
        } catch (e: unknown) {
            errors.activeWorkers = e instanceof Error ? e.message : "Unknown error";
        }

        // 2. Attendance
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            results.attendanceCount = await prisma.attendance.count({
                where: { date: { gte: today } }
            });
        } catch (e: unknown) {
            errors.attendance = e instanceof Error ? e.message : "Unknown error";
        }

        // 3. Requests
        try {
            results.pendingRequests = await prisma.request.count({ where: { status: "Pending" } });
        } catch (e: unknown) {
            errors.requests = e instanceof Error ? e.message : "Unknown error";
        }

        // 4. Inventory
        try {
            results.inventoryCount = await prisma.inventory.count();
            results.lowStock = await prisma.inventory.findMany({
                where: { qty: { lt: 10 } },
                take: 1,
                select: { id: true, nameEn: true, qty: true }
            });
        } catch (e: unknown) {
            errors.inventory = e instanceof Error ? e.message : "Unknown error";
        }

        // 5. Worker groupBy
        try {
            results.workerGroups = await prisma.worker.groupBy({
                by: ["region"],
                where: { status: "Active" },
                _count: { id: true },
            });
        } catch (e: unknown) {
            errors.workerGroups = e instanceof Error ? e.message : "Unknown error";
        }

        return NextResponse.json({
            status: Object.keys(errors).length > 0 ? 'partial_failure' : 'ok',
            results,
            errors
        });
    } catch (error: unknown) {
        return NextResponse.json({
            status: 'critical_failure',
            message: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
