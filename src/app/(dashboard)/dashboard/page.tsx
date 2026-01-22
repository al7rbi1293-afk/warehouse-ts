import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

async function getDashboardData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const [
            activeWorkers,
            todayAttendance,
            pendingRequests,
            lowStockItems,
            workersByRegion,
            topStockItems,
            absentCount,
            vacationCount,
            dayOffCount,
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

            // Absent Count (Today)
            prisma.attendance.count({
                where: {
                    date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
                    status: "Absent"
                }
            }),

            // Vacation Count (Today)
            prisma.attendance.count({
                where: {
                    date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
                    status: "Vacation"
                }
            }),

            // Day Off Count (Today)
            prisma.attendance.count({
                where: {
                    date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
                    status: "Day Off"
                }
            }),
        ]);

        // Get attendance trend (last 7 days) using Prisma instead of raw query
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const recentAttendance = await prisma.attendance.findMany({
            where: {
                status: "Present",
                date: { gte: sevenDaysAgo },
            },
            select: { date: true },
        });

        // Group by date manually
        const trendMap: Record<string, number> = {};
        recentAttendance.forEach((a) => {
            const dateStr = a.date.toISOString().split("T")[0];
            trendMap[dateStr] = (trendMap[dateStr] || 0) + 1;
        });

        const attendanceTrend = Object.entries(trendMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

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
                absentCount,
                vacationCount,
                dayOffCount,
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
            attendanceTrend,
        };
    } catch (error) {
        console.error("Dashboard data error:", error);
        // Return empty data on error
        return {
            metrics: {
                activeWorkers: 0,
                attendanceRate: 0,
                presentCount: 0,
                pendingRequests: 0,
                lowStockCount: 0,
                absentCount: 0,
                vacationCount: 0,
                dayOffCount: 0,
            },
            lowStockItems: [],
            workersByRegion: [],
            topStockItems: [],
            attendanceTrend: [],
        };
    }
}

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "manager") {
        redirect("/warehouse");
    }

    const data = await getDashboardData();

    return <DashboardClient data={data} />;
}
