import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { WarehouseKpiDataset } from "@/types/warehouse-kpi";

const getWarehouseKpiSnapshot = unstable_cache(
  async (): Promise<WarehouseKpiDataset> => {
    const [
      requests,
      inventory,
      localInventory,
      loans,
      stockLogs,
      supervisors,
      warehouses,
      regions,
    ] = await Promise.all([
      prisma.request.findMany({
        orderBy: { requestDate: "desc" },
      }),
      prisma.inventory.findMany({
        orderBy: [{ location: "asc" }, { nameEn: "asc" }],
      }),
      prisma.localInventory.findMany({
        orderBy: [{ region: "asc" }, { itemName: "asc" }],
      }),
      prisma.loan.findMany({
        orderBy: { id: "desc" },
      }),
      prisma.stockLog.findMany({
        orderBy: { logDate: "desc" },
        take: 1000,
      }),
      prisma.user.findMany({
        where: { role: "supervisor" },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          region: true,
          regions: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.warehouse.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.region.findMany({
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      requests: requests.map((request) => ({
        reqId: request.reqId,
        supervisorName: request.supervisorName,
        region: request.region,
        itemName: request.itemName,
        category: request.category,
        qty: request.qty,
        unit: request.unit,
        status: request.status,
        requestDate: request.requestDate?.toISOString() ?? null,
        notes: request.notes,
        shiftName: request.shiftName,
        reviewedBy: request.reviewedBy,
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt?.toISOString() ?? null,
        issuedBy: request.issuedBy,
        issuedAt: request.issuedAt?.toISOString() ?? null,
        receivedAt: request.receivedAt?.toISOString() ?? null,
      })),
      inventory: inventory.map((item) => ({
        id: item.id,
        nameEn: item.nameEn,
        category: item.category,
        location: item.location,
        qty: item.qty,
        unit: item.unit,
        status: item.status,
        lastUpdated: item.lastUpdated?.toISOString() ?? null,
        minThreshold: item.minThreshold,
      })),
      localInventory: localInventory.map((item) => ({
        region: item.region,
        itemName: item.itemName,
        qty: item.qty,
        lastUpdated: item.lastUpdated?.toISOString() ?? null,
        updatedBy: item.updatedBy,
      })),
      loans: loans.map((loan) => ({
        id: loan.id,
        itemId: loan.itemId,
        itemName: loan.itemName,
        project: loan.project,
        quantity: loan.quantity,
        type: loan.type,
        sourceWarehouse: loan.sourceWarehouse ?? null,
        date: loan.date,
        status: loan.status,
      })),
      stockLogs: stockLogs.map((log) => ({
        id: log.id,
        itemName: log.itemName,
        changeAmount: log.changeAmount,
        location: log.location,
        actionBy: log.actionBy,
        actionType: log.actionType,
        unit: log.unit,
        newQty: log.newQty,
        logDate: log.logDate?.toISOString() ?? null,
      })),
      supervisors: supervisors.map((supervisor) => ({
        id: supervisor.id,
        name: supervisor.name,
        username: supervisor.username,
        role: supervisor.role,
        assignedRegions: (supervisor.regions || supervisor.region || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      })),
      warehouses,
      regions,
    };
  },
  ["warehouse-kpi-snapshot"],
  {
    revalidate: 60,
    tags: [CACHE_TAGS.warehouse, CACHE_TAGS.dashboard],
  }
);

export async function getWarehouseKpiDataset() {
  try {
    return await getWarehouseKpiSnapshot();
  } catch (error) {
    console.error("Warehouse KPI data error:", error);

    return {
      generatedAt: new Date().toISOString(),
      requests: [],
      inventory: [],
      localInventory: [],
      loans: [],
      stockLogs: [],
      supervisors: [],
      warehouses: [],
      regions: [],
    } satisfies WarehouseKpiDataset;
  }
}
