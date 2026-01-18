import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

async function getDashboardData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        activeWorkers,
        todayAttendance,
        pendingRequests,
        lowStockItems,
        workersByRegion,
        topStockItems,
        attendanceTrend,
    ] = await Promise.all([
        // Active workers count
        prisma.worker.count({ where: { status: "Active" } }),

        // Today's attendance
        prisma.attendance.findMany({
            where: {
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
                },
            },
        }),

        // Pending requests count
        prisma.request.count({ where: { status: "Pending" } }),

        // Low stock items (qty < 10)
        prisma.inventory.findMany({
            where: { qty: { lt: 10 } },
            orderBy: { qty: "asc" },
        }),

        // Workers by region
        prisma.worker.groupBy({
            by: ["region"],
            where: { status: "Active" },
            _count: { id: true },
        }),

        // Top 10 stock items in NSTC
        prisma.inventory.findMany({
            where: { location: "NSTC" },
            orderBy: { qty: "desc" },
            take: 10,
        }),

        // Attendance trend (last 7 days)
        prisma.$queryRaw`
      SELECT date::date, COUNT(*) as present_count 
      FROM attendance 
      WHERE status = 'Present' 
        AND date >= CURRENT_DATE - INTERVAL '7 days' 
      GROUP BY date::date 
      ORDER BY date
    ` as Promise<{ date: Date; present_count: bigint }[]>,
    ]);

    // Calculate attendance rate
    const presentCount = todayAttendance.filter((a) => a.status === "Present").length;
    const attendanceRate = activeWorkers > 0
        ? Math.round((presentCount / activeWorkers) * 100 * 10) / 10
        : 0;

    return {
        metrics: {
            activeWorkers,
            attendanceRate,
            presentCount,
            pendingRequests,
            lowStockCount: lowStockItems.length,
        },
        lowStockItems: lowStockItems.map((item) => ({
            nameEn: item.nameEn,
            qty: item.qty,
            location: item.location,
        })),
        workersByRegion: workersByRegion.map((w) => ({
            name: w.region || "Unknown",
            value: w._count.id,
        })),
        topStockItems: topStockItems.map((item) => ({
            name: item.nameEn,
            value: item.qty,
        })),
        attendanceTrend: attendanceTrend.map((t) => ({
            date: t.date.toISOString().split("T")[0],
            count: Number(t.present_count),
        })),
    };
}

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "manager") {
        redirect("/warehouse");
    }

    const data = await getDashboardData();

    return <DashboardClient data={data} />;
}
