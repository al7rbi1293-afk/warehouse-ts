
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const userCount = await prisma.user.count();
        const workerCount = await prisma.worker.count();
        const activeWorkers = await prisma.worker.count({ where: { status: "Active" } });

        // Check if we can fetch one worker to see fields
        const firstWorker = await prisma.worker.findFirst();

        return NextResponse.json({
            status: 'ok',
            counts: {
                users: userCount,
                workers: workerCount,
                activeWorkers: activeWorkers
            },
            firstWorker,
            env: {
                hasDbUrl: !!process.env.DATABASE_URL
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            message: error.message,
            stack: error.stack,
            meta: error.meta
        }, { status: 500 });
    }
}
