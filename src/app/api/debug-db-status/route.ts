
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDatabaseHealth, sanitizeDatabaseError } from '@/lib/database-health';

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
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    const results: DebugResults = {};
    const errors: DebugErrors = {};
    const health = await getDatabaseHealth();

    try {
        // 1. Workers
        try {
            results.activeWorkers = await prisma.worker.count({ where: { status: "Active" } });
        } catch (e: unknown) {
            errors.activeWorkers = sanitizeDatabaseError(e).reason;
        }

        // 2. Attendance
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            results.attendanceCount = await prisma.attendance.count({
                where: { date: { gte: today } }
            });
        } catch (e: unknown) {
            errors.attendance = sanitizeDatabaseError(e).reason;
        }

        // 3. Requests
        try {
            results.pendingRequests = await prisma.request.count({ where: { status: "Pending" } });
        } catch (e: unknown) {
            errors.requests = sanitizeDatabaseError(e).reason;
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
            errors.inventory = sanitizeDatabaseError(e).reason;
        }

        // 5. Worker groupBy
        try {
            results.workerGroups = await prisma.worker.groupBy({
                by: ["region"],
                where: { status: "Active" },
                _count: { id: true },
            });
        } catch (e: unknown) {
            errors.workerGroups = sanitizeDatabaseError(e).reason;
        }

        return NextResponse.json({
            status: Object.keys(errors).length > 0 ? 'partial_failure' : 'ok',
            health,
            results,
            errors
        });
    } catch (error: unknown) {
        return NextResponse.json({
            status: 'critical_failure',
            health,
            reason: sanitizeDatabaseError(error).reason
        }, { status: 500 });
    }
}
