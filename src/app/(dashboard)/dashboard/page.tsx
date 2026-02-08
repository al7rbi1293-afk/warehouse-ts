import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

async function getDashboardData(dateStr?: string) {
    let today: Date;
    if (dateStr) {
        // Parse "YYYY-MM-DD" in local time to avoid UTC shifting
        const [year, month, day] = dateStr.split('-').map(Number);
        today = new Date(year, month - 1, day);
    } else {
        today = new Date();
    }
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // Calculate yesterday for B1 (Night Shift) attendance
    // B1 attendance from Day N should appear in Day N+1's dashboard
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Format selectedDate as YYYY-MM-DD in local time
    const selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    try {
        const [
            activeWorkers,
            selectedDateAttendance,
            b1PreviousDayAttendance,
            pendingRequests,
            lowStockItems,
            workersByRegion,
            topStockItems,
        ] = await Promise.all([
            // Active workers count
            prisma.worker.count({ where: { status: "Active" } }),

            // Attendance for the selected date (for A1/day shifts)
            prisma.attendance.findMany({
                where: {
                    date: {
                        gte: today,
                        lt: tomorrow,
                    },
                },
                include: {
                    worker: {
                        include: { shift: true }
                    },
                },
            }),

            // B1 (Night Shift) attendance from PREVIOUS day
            // This makes night shift attendance from Day N appear in Day N+1's report
            prisma.attendance.findMany({
                where: {
                    date: {
                        gte: yesterday,
                        lt: today,
                    },
                },
                include: {
                    worker: {
                        include: { shift: true }
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
        ]);

        // Shift specific metrics
        // A1 (Day Shift) uses today's attendance
        const a1Attendance = selectedDateAttendance.filter(a => a.worker?.shift?.name === "A1");
        // B1 (Night Shift) uses PREVIOUS day's attendance (shifted for reporting)
        const b1Attendance = b1PreviousDayAttendance.filter(a => a.worker?.shift?.name === "B1");

        // Combine for "Effective Reporting Day" stats
        // This gives a complete picture: Morning Shift (Today) + Night Shift (started Yesterday)
        const combinedAttendance = [...a1Attendance, ...b1Attendance];

        const a1Present = a1Attendance.filter(a => a.status === "Present").length;
        const b1Present = b1Attendance.filter(a => a.status === "Present").length;

        // Count statuses from the COMBINED list
        const presentCount = combinedAttendance.filter(a => a.status === "Present").length;
        const absentCount = combinedAttendance.filter(a => a.status === "Absent").length;
        const vacationCount = combinedAttendance.filter(a => a.status === "Vacation").length;
        const dayOffCount = combinedAttendance.filter(a => a.status === "Day Off").length;
        const sickCount = combinedAttendance.filter(a => a.status === "Sick Leave").length;

        // Get attendance trend (last 7 days from selected date)
        const trendStart = new Date(today);
        trendStart.setDate(trendStart.getDate() - 7);

        const recentAttendance = await prisma.attendance.findMany({
            where: {
                status: "Present",
                date: { gte: trendStart, lt: tomorrow },
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
        const attendanceRate = activeWorkers > 0
            ? Math.round((presentCount / activeWorkers) * 100 * 10) / 10
            : 0;

        return {
            selectedDate,
            metrics: {
                activeWorkers,
                attendanceRate,
                presentCount,
                pendingRequests,
                lowStockCount: lowStockItems.length,
                absentCount,
                vacationCount,
                dayOffCount,
                sickCount,
                a1Present,
                b1Present,
                a1Total: a1Attendance.length, // Approximation based on records found
                b1Total: b1Attendance.length,
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
            todayAttendance: combinedAttendance, // Pass the full detailed list
        };
    } catch (error) {
        console.error("Dashboard data error:", error);
        return {
            selectedDate,
            metrics: {
                activeWorkers: 0,
                attendanceRate: 0,
                presentCount: 0,
                pendingRequests: 0,
                lowStockCount: 0,
                absentCount: 0,
                vacationCount: 0,
                dayOffCount: 0,
                sickCount: 0,
                a1Present: 0,
                b1Present: 0,
                a1Total: 0,
                b1Total: 0,
            },
            lowStockItems: [],
            workersByRegion: [],
            topStockItems: [],
            attendanceTrend: [],
            todayAttendance: [],
        };
    }
}

export default async function DashboardPage(props: { searchParams: Promise<{ date?: string }> }) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "manager") {
        redirect("/warehouse");
    }

    const data = await getDashboardData(searchParams.date);

    return <DashboardClient data={data} />;
}
