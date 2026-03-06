import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { UserRole } from "@/types";

function getLocalDateParts(dateStr?: string) {
  let today: Date;

  if (dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const isValidDate =
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      year > 1900 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31;

    today = isValidDate ? new Date(year, month - 1, day) : new Date();
  } else {
    today = new Date();
  }

  today.setHours(0, 0, 0, 0);

  return {
    today,
    selectedDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  };
}

const getDashboardSnapshot = unstable_cache(
  async (selectedDate: string) => {
    const { today } = getLocalDateParts(selectedDate);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 7);

    const [
      activeWorkers,
      selectedDateAttendance,
      b1PreviousDayAttendance,
      pendingRequests,
      lowStockItems,
      workersByRegion,
      topStockItems,
      recentAttendance,
    ] = await Promise.all([
      prisma.worker.count({ where: { status: "Active" } }),
      prisma.attendance.findMany({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          worker: {
            include: { shift: true },
          },
        },
      }),
      prisma.attendance.findMany({
        where: {
          date: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          worker: {
            include: { shift: true },
          },
        },
      }),
      prisma.request.count({ where: { status: "Pending" } }),
      prisma.inventory.findMany({
        where: { qty: { lt: 10 } },
        orderBy: { qty: "asc" },
      }),
      prisma.worker.groupBy({
        by: ["region"],
        where: { status: "Active" },
        _count: { id: true },
      }),
      prisma.inventory.findMany({
        where: { location: "NSTC" },
        orderBy: { qty: "desc" },
        take: 10,
      }),
      prisma.attendance.findMany({
        where: {
          status: "Present",
          date: { gte: trendStart, lt: tomorrow },
        },
        select: { date: true },
      }),
    ]);

    const a1Attendance = selectedDateAttendance.filter(
      (attendance) => attendance.worker?.shift?.name === "A1"
    );
    const b1Attendance = b1PreviousDayAttendance.filter(
      (attendance) => attendance.worker?.shift?.name === "B1"
    );
    const combinedAttendance = [...a1Attendance, ...b1Attendance];

    const trendMap: Record<string, number> = {};
    for (const attendance of recentAttendance) {
      const dateKey = attendance.date.toISOString().split("T")[0];
      trendMap[dateKey] = (trendMap[dateKey] || 0) + 1;
    }

    const presentCount = combinedAttendance.filter(
      (attendance) => attendance.status === "Present"
    ).length;

    return {
      selectedDate,
      metrics: {
        activeWorkers,
        attendanceRate:
          activeWorkers > 0
            ? Math.round((presentCount / activeWorkers) * 1000) / 10
            : 0,
        presentCount,
        pendingRequests,
        lowStockCount: lowStockItems.length,
        absentCount: combinedAttendance.filter(
          (attendance) => attendance.status === "Absent"
        ).length,
        vacationCount: combinedAttendance.filter(
          (attendance) => attendance.status === "Vacation"
        ).length,
        dayOffCount: combinedAttendance.filter(
          (attendance) => attendance.status === "Day Off"
        ).length,
        sickCount: combinedAttendance.filter(
          (attendance) => attendance.status === "Sick Leave"
        ).length,
        a1Present: a1Attendance.filter(
          (attendance) => attendance.status === "Present"
        ).length,
        b1Present: b1Attendance.filter(
          (attendance) => attendance.status === "Present"
        ).length,
        a1Total: a1Attendance.length,
        b1Total: b1Attendance.length,
      },
      lowStockItems: lowStockItems.map((item) => ({
        nameEn: item.nameEn,
        qty: item.qty,
        location: item.location,
      })),
      workersByRegion: workersByRegion.map((workerGroup) => ({
        name: workerGroup.region || "Unknown",
        value: workerGroup._count.id,
      })),
      topStockItems: topStockItems.map((item) => ({
        name: item.nameEn,
        value: item.qty,
      })),
      attendanceTrend: Object.entries(trendMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      todayAttendance: combinedAttendance,
    };
  },
  ["dashboard-snapshot"],
  {
    revalidate: 120,
    tags: [CACHE_TAGS.dashboard, CACHE_TAGS.manpower, CACHE_TAGS.warehouse],
  }
);

const getWarehouseSharedData = unstable_cache(
  async () => {
    const [
      inventory,
      pendingRequests,
      approvedRequests,
      stockLogs,
      localInventory,
      warehouses,
      regions,
    ] = await Promise.all([
      prisma.inventory.findMany({
        orderBy: { nameEn: "asc" },
      }),
      prisma.request.findMany({
        where: { status: "Pending" },
        orderBy: [{ region: "asc" }, { requestDate: "desc" }],
      }),
      prisma.request.findMany({
        where: { status: "Approved" },
        orderBy: { region: "asc" },
      }),
      prisma.stockLog.findMany({
        orderBy: { logDate: "desc" },
        take: 100,
      }),
      prisma.localInventory.findMany({
        orderBy: [{ region: "asc" }, { itemName: "asc" }],
      }),
      prisma.warehouse.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.region.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      inventory,
      pendingRequests,
      approvedRequests,
      stockLogs,
      localInventory,
      warehouses,
      regions,
    };
  },
  ["warehouse-shared-data"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.warehouse, CACHE_TAGS.references],
  }
);

const getWarehouseRoleData = unstable_cache(
  async (userRole: string, userName: string) => {
    const [allRequests, myPendingRequests, myRejectedRequests, readyForPickup, auditLogs] =
      await Promise.all([
        userRole === "manager"
          ? prisma.request.findMany({
              orderBy: { requestDate: "desc" },
              take: 200,
            })
          : Promise.resolve([]),
        userRole === "supervisor"
          ? prisma.request.findMany({
              where: { supervisorName: userName, status: "Pending" },
              orderBy: { requestDate: "desc" },
            })
          : Promise.resolve([]),
        userRole === "supervisor"
          ? prisma.request.findMany({
              where: { supervisorName: userName, status: "Rejected" },
              orderBy: { requestDate: "desc" },
            })
          : Promise.resolve([]),
        userRole === "supervisor"
          ? prisma.request.findMany({
              where: { supervisorName: userName, status: "Issued" },
              orderBy: { requestDate: "desc" },
            })
          : Promise.resolve([]),
        userRole === "manager"
          ? prisma.auditLog.findMany({
              orderBy: { timestamp: "desc" },
              take: 50,
            })
          : Promise.resolve([]),
      ]);

    return {
      allRequests,
      myPendingRequests,
      myRejectedRequests,
      readyForPickup,
      auditLogs,
    };
  },
  ["warehouse-role-data"],
  {
    revalidate: 30,
    tags: [CACHE_TAGS.warehouse],
  }
);

const getManpowerBaseData = unstable_cache(
  async () => {
    const attendanceWindowStart = new Date();
    attendanceWindowStart.setDate(attendanceWindowStart.getDate() - 14);

    const [workers, shifts, supervisors, allAttendance, regions] =
      await Promise.all([
        prisma.worker.findMany({
          include: { shift: true },
          orderBy: { id: "desc" },
        }),
        prisma.shift.findMany({
          orderBy: { id: "asc" },
        }),
        prisma.user.findMany({
          where: { role: { not: "manager" } },
          orderBy: { name: "asc" },
        }),
        prisma.attendance.findMany({
          where: {
            date: {
              gte: attendanceWindowStart,
            },
          },
          include: { worker: true },
          orderBy: { date: "desc" },
        }),
        prisma.region.findMany({
          orderBy: { name: "asc" },
        }),
      ]);

    return {
      workers: workers.map((worker) => ({
        ...worker,
        shiftName: worker.shift?.name || null,
      })),
      shifts,
      supervisors: supervisors.map((supervisor) => ({
        ...supervisor,
        role: supervisor.role as UserRole | null,
      })),
      allAttendance,
      regions,
    };
  },
  ["manpower-base-data"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.manpower, CACHE_TAGS.references],
  }
);

const getManagerUsers = unstable_cache(
  async () => {
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        region: true,
        regions: true,
        shiftId: true,
        attendanceShiftId: true,
        allowedShifts: true,
        empId: true,
      },
      orderBy: { name: "asc" },
    });

    return allUsers.map((user) => ({
      ...user,
      role: user.role as UserRole | null,
    }));
  },
  ["manpower-manager-users"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.manpower],
  }
);

export async function getCachedDashboardData(dateStr?: string) {
  const { selectedDate } = getLocalDateParts(dateStr);

  try {
    return await getDashboardSnapshot(selectedDate);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

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
      debugError: errorMessage,
    };
  }
}

export async function getCachedWarehouseData(userRole: string, userName: string) {
  try {
    const [sharedData, roleData] = await Promise.all([
      getWarehouseSharedData(),
      getWarehouseRoleData(userRole, userName),
    ]);

    return {
      ...sharedData,
      ...roleData,
    };
  } catch (error) {
    console.error("Warehouse data error:", error);
    return {
      inventory: [],
      pendingRequests: [],
      approvedRequests: [],
      stockLogs: [],
      localInventory: [],
      myPendingRequests: [],
      readyForPickup: [],
      warehouses: [],
      regions: [],
      allRequests: [],
      myRejectedRequests: [],
      auditLogs: [],
    };
  }
}

export async function getCachedManpowerData(isManager: boolean) {
  try {
    const [baseData, allUsers] = await Promise.all([
      getManpowerBaseData(),
      isManager ? getManagerUsers() : Promise.resolve([]),
    ]);

    return {
      ...baseData,
      allUsers,
    };
  } catch (error) {
    console.error("Manpower data error:", error);
    return {
      workers: [],
      shifts: [],
      supervisors: [],
      allAttendance: [],
      regions: [],
      allUsers: [],
    };
  }
}
