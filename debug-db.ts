import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Testing DB Connection...');
    try {
        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);

        const workerCount = await prisma.worker.count();
        console.log(`Worker count: ${workerCount}`);

        const attendanceCount = await prisma.attendance.count();
        console.log(`Attendance count: ${attendanceCount}`);

        const activeWorkers = await prisma.worker.count({ where: { status: "Active" } });
        console.log(`Active workers: ${activeWorkers}`);

    } catch (e) {
        console.error('DB Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
