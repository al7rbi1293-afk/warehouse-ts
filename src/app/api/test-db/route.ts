import { prisma } from "@/lib/prisma";
import { getDatabaseHealth, logSanitizedDatabaseError } from "@/lib/database-health";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    try {
        const health = await getDatabaseHealth();

        // Test basic connection
        const userCount = await prisma.user.count();
        const workerCount = await prisma.worker.count();
        const inventoryCount = await prisma.inventory.count();
        const shiftCount = await prisma.shift.count();
        const requestCount = await prisma.request.count();

        // Get sample data
        const sampleUsers = await prisma.user.findMany({ take: 3, select: { username: true, name: true, role: true } });
        const sampleWorkers = await prisma.worker.findMany({ take: 3, select: { id: true, name: true, region: true } });
        const sampleInventory = await prisma.inventory.findMany({ take: 3, select: { id: true, nameEn: true, qty: true, location: true } });

        return NextResponse.json({
            status: "connected",
            health,
            counts: {
                users: userCount,
                workers: workerCount,
                inventory: inventoryCount,
                shifts: shiftCount,
                requests: requestCount,
            },
            samples: {
                users: sampleUsers,
                workers: sampleWorkers,
                inventory: sampleInventory,
            },
        });
    } catch (error: unknown) {
        const sanitized = logSanitizedDatabaseError("test-db route failed", error);
        return NextResponse.json(
            {
                status: "error",
                reason: sanitized.reason,
            },
            { status: 500 }
        );
    }
}
