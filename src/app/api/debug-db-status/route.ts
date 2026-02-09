
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const results: any = {};
    const errors: any = {};

    try {
        // 1. Workers
        try {
            results.activeWorkers = await prisma.worker.count({ where: { status: "Active" } });
        } catch (e: any) {
            errors.activeWorkers = e.message;
        }

        // 2. Attendance
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            results.attendanceCount = await prisma.attendance.count({
                where: { date: { gte: today } }
            });
        } catch (e: any) {
            errors.attendance = e.message;
        }

        // 3. Requests
        try {
            results.pendingRequests = await prisma.request.count({ where: { status: "Pending" } });
        } catch (e: any) {
            errors.requests = e.message;
        }

        // 4. Inventory
        try {
            results.inventoryCount = await prisma.inventory.count();
            results.lowStock = await prisma.inventory.findMany({
                where: { qty: { lt: 10 } },
                take: 1
            });
        } catch (e: any) {
            errors.inventory = e.message;
        }

        // 5. Worker groupBy
        try {
            results.workerGroups = await prisma.worker.groupBy({
                by: ["region"],
                where: { status: "Active" },
                _count: { id: true },
            });
        } catch (e: any) {
            errors.workerGroups = e.message;
        }

        return NextResponse.json({
            status: Object.keys(errors).length > 0 ? 'partial_failure' : 'ok',
            results,
            errors
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'critical_failure',
            message: error.message
        }, { status: 500 });
    }
}
