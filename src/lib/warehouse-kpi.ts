import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { logSanitizedDatabaseError } from "@/lib/database-health";
import { inferWarehouseType } from "@/lib/warehouse-utils";
import {
  WarehouseKpiBorrowLendRecord,
  WarehouseKpiDataset,
  WarehouseKpiIssueDispatchRecord,
  WarehouseKpiMovementRecord,
  WarehouseKpiRequestRecord,
} from "@/types/warehouse-kpi";

function buildReferenceNo(prefix: string, id: number) {
  return `${prefix}-${String(id).padStart(6, "0")}`;
}

function splitRegions(...values: Array<string | null | undefined>) {
  const seen = new Map<string, string>();

  for (const value of values) {
    if (!value) continue;

    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const key = entry.toUpperCase();
        if (!seen.has(key)) {
          seen.set(key, entry);
        }
      });
  }

  return Array.from(seen.values());
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseLoanDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeMovementType(actionType?: string | null) {
  if (!actionType) return "Stock Movement";

  const normalized = actionType.toLowerCase();
  if (normalized.includes("transfer")) return "Transfer";
  if (normalized.includes("lent")) return "Lend";
  if (normalized.includes("returned")) return "Borrow Return";
  if (normalized.includes("issued")) return "Issue / Dispatch";
  if (normalized.includes("stock take")) return "Stock Take";
  if (normalized.includes("manual")) return "Manual Adjustment";
  return actionType;
}

const getWarehouseKpiSnapshot = unstable_cache(
  async (): Promise<WarehouseKpiDataset> => {
    const [
      requests,
      inventory,
      loans,
      stockLogs,
      supervisors,
      warehouses,
      regions,
      operationLines,
    ] = await Promise.all([
      prisma.request.findMany({
        orderBy: { requestDate: "desc" },
      }),
      prisma.inventory.findMany({
        orderBy: [{ location: "asc" }, { category: "asc" }, { nameEn: "asc" }],
      }),
      prisma.loan.findMany({
        orderBy: { id: "desc" },
      }),
      prisma.stockLog.findMany({
        orderBy: { logDate: "desc" },
        take: 5000,
      }),
      prisma.user.findMany({
        where: { role: { in: ["supervisor", "night_supervisor"] } },
        select: {
          id: true,
          name: true,
          username: true,
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
      prisma.warehouseBulkOperationLine.findMany({
        where: {
          bulkOperation: {
            is: {
              operationType: {
                in: ["REQUEST", "ISSUE", "TRANSFER", "LEND", "BORROW"],
              },
            },
          },
        },
        include: {
          bulkOperation: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 5000,
      }),
    ]);

    const warehouseTypeMap = new Map(
      warehouses.map((warehouse) => [warehouse.name, warehouse.type])
    );
    const inventoryByName = new Map(
      inventory.map((item) => [item.nameEn, item])
    );
    const inventoryById = new Map(inventory.map((item) => [item.id, item]));
    const requestById = new Map(requests.map((request) => [request.reqId, request]));

    const requestContext = new Map<
      number,
      {
        requestOperationNo: string | null;
        dispatchOperationNo: string | null;
        warehouse: string | null;
        dispatchWarehouse: string | null;
      }
    >();

    const loanOperationNoById = new Map<number, string>();
    const issueDispatches: WarehouseKpiIssueDispatchRecord[] = [];
    const movements: WarehouseKpiMovementRecord[] = [];

    for (const line of operationLines) {
      const operationType = line.bulkOperation.operationType;

      if (operationType === "REQUEST" && line.entityId) {
        const current = requestContext.get(line.entityId) ?? {
          requestOperationNo: null,
          dispatchOperationNo: null,
          warehouse: null,
          dispatchWarehouse: null,
        };

        if (!current.requestOperationNo) {
          current.requestOperationNo = line.bulkOperation.operationNo;
        }

        if (!current.warehouse && line.fromWarehouse) {
          current.warehouse = line.fromWarehouse;
        }

        requestContext.set(line.entityId, current);
        continue;
      }

      if (
        line.entityId &&
        (line.entityType === "loan" || line.entityType === "loan_return")
      ) {
        loanOperationNoById.set(line.entityId, line.bulkOperation.operationNo);
      }

      const request =
        line.entityType === "request" && line.entityId
          ? requestById.get(line.entityId)
          : null;
      const relatedInventory = line.itemId
        ? inventoryById.get(line.itemId)
        : inventoryByName.get(line.itemName);

      if (operationType === "ISSUE") {
        const context =
          line.entityId !== null && line.entityId !== undefined
            ? requestContext.get(line.entityId)
            : null;
        const warehouse =
          line.fromWarehouse || context?.warehouse || context?.dispatchWarehouse || "NSTC";

        if (line.entityId) {
          const current = requestContext.get(line.entityId) ?? {
            requestOperationNo: null,
            dispatchOperationNo: null,
            warehouse: null,
            dispatchWarehouse: null,
          };
          current.dispatchOperationNo = line.bulkOperation.operationNo;
          current.dispatchWarehouse = warehouse;
          requestContext.set(line.entityId, current);
        }

        issueDispatches.push({
          transactionNo: line.bulkOperation.operationNo,
          requestNo: buildReferenceNo("REQ", line.entityId || 0),
          reqId: line.entityId,
          warehouse,
          warehouseType: inferWarehouseType(
            warehouse,
            warehouseTypeMap.get(warehouse)
          ),
          itemName: line.itemName,
          itemCode: line.itemCode || relatedInventory?.itemCode || null,
          supervisorName: request?.supervisorName || null,
          region: request?.region || line.region || null,
          issuedBy:
            request?.issuedBy ||
            line.bulkOperation.createdBy ||
            null,
          receivedBy:
            request?.status === "Received" ? request.supervisorName || null : null,
          status: request?.status || line.status,
          quantity: line.fulfilledQty || line.approvedQty || line.quantity,
          unit: line.unit || relatedInventory?.unit || null,
          date:
            request?.issuedAt?.toISOString() ||
            line.createdAt.toISOString(),
          notes: line.notes || request?.notes || null,
        });
      }

      const movementFrom =
        line.fromWarehouse ||
        (operationType === "BORROW" ? line.projectName || "" : "");
      const movementTo =
        line.toWarehouse ||
        (operationType === "ISSUE"
          ? request?.region || line.region || ""
          : operationType === "LEND"
            ? line.projectName || ""
            : "");

      movements.push({
        movementNo: line.bulkOperation.operationNo,
        movementType:
          operationType === "ISSUE"
            ? "Issue / Dispatch"
            : operationType === "TRANSFER"
              ? "Transfer"
              : operationType === "LEND"
                ? "Lend"
                : "Borrow Return",
        sourceModule: "Bulk Operations",
        status: line.status,
        itemName: line.itemName,
        itemCode: line.itemCode || relatedInventory?.itemCode || null,
        category: line.category || relatedInventory?.category || null,
        from: movementFrom,
        to: movementTo,
        warehouseType: inferWarehouseType(
          line.fromWarehouse || line.toWarehouse,
          warehouseTypeMap.get(line.fromWarehouse || line.toWarehouse || "")
        ),
        quantity: line.fulfilledQty || line.approvedQty || line.quantity,
        unit: line.unit || relatedInventory?.unit || null,
        date: line.createdAt.toISOString(),
        relatedUser: line.bulkOperation.createdBy || null,
        supervisorName: request?.supervisorName || null,
        region: request?.region || line.region || null,
        notes: line.notes || null,
      });
    }

    const requestRecords: WarehouseKpiRequestRecord[] = requests.map((request) => {
      const context = requestContext.get(request.reqId);
      const inventoryItem = inventoryByName.get(request.itemName || "");
      const warehouse =
        context?.warehouse || context?.dispatchWarehouse || "NSTC";

      return {
        reqId: request.reqId,
        requestNo: buildReferenceNo("REQ", request.reqId),
        requestOperationNo: context?.requestOperationNo || null,
        dispatchOperationNo: context?.dispatchOperationNo || null,
        supervisorName: request.supervisorName,
        region: request.region,
        warehouse,
        warehouseType: inferWarehouseType(
          warehouse,
          warehouseTypeMap.get(warehouse)
        ),
        itemName: request.itemName,
        itemCode: inventoryItem?.itemCode || null,
        category: request.category || inventoryItem?.category || null,
        qty: request.qty,
        unit: request.unit || inventoryItem?.unit || null,
        status: request.status,
        requestDate: toIsoString(request.requestDate),
        notes: request.notes,
        approvedBy: request.approvedBy,
        approvedAt: toIsoString(request.approvedAt || request.reviewedAt),
        issuedBy: request.issuedBy,
        issuedAt: toIsoString(request.issuedAt),
        receivedAt: toIsoString(request.receivedAt),
      };
    });

    const borrowLend: WarehouseKpiBorrowLendRecord[] = loans.map((loan) => {
      const inventoryItem = inventoryById.get(loan.itemId);
      const transactionNo =
        loanOperationNoById.get(loan.id) || buildReferenceNo("LON", loan.id);

      const source =
        loan.type === "Borrow"
          ? loan.project
          : loan.sourceWarehouse || "";
      const destination =
        loan.type === "Borrow"
          ? loan.sourceWarehouse || ""
          : loan.project;

      return {
        transactionNo,
        loanId: loan.id,
        type: loan.type,
        source,
        destination,
        warehouseType: inferWarehouseType(
          loan.sourceWarehouse,
          warehouseTypeMap.get(loan.sourceWarehouse || "")
        ),
        itemName: loan.itemName,
        itemCode: inventoryItem?.itemCode || null,
        category: inventoryItem?.category || null,
        quantity: loan.originalQuantity || loan.quantity,
        unit: inventoryItem?.unit || null,
        date: parseLoanDate(loan.date) || new Date().toISOString(),
        status: loan.status,
        notes: loan.notes || loan.reference || null,
        expectedReturnDate: toIsoString(loan.expectedReturnDate),
        returnDate: toIsoString(loan.returnDate),
      };
    });

    for (const log of stockLogs) {
      const inventoryItem = inventoryByName.get(log.itemName || "");
      const quantity = Math.abs(log.changeAmount || 0);

      movements.push({
        movementNo: buildReferenceNo("MOV", log.id),
        movementType: normalizeMovementType(log.actionType),
        sourceModule: "Stock Log",
        status: null,
        itemName: log.itemName || "Unknown Item",
        itemCode: inventoryItem?.itemCode || null,
        category: inventoryItem?.category || null,
        from: (log.changeAmount || 0) < 0 ? log.location || "" : "",
        to: (log.changeAmount || 0) > 0 ? log.location || "" : "",
        warehouseType: inferWarehouseType(
          log.location,
          warehouseTypeMap.get(log.location || "")
        ),
        quantity,
        unit: log.unit || inventoryItem?.unit || null,
        date: toIsoString(log.logDate) || new Date().toISOString(),
        relatedUser: log.actionBy || log.userName || null,
        supervisorName: null,
        region: null,
        notes: log.actionType || null,
      });
    }

    movements.sort((left, right) => right.date.localeCompare(left.date));
    issueDispatches.sort((left, right) => right.date.localeCompare(left.date));
    borrowLend.sort((left, right) => right.date.localeCompare(left.date));
    requestRecords.sort((left, right) =>
      (right.requestDate || "").localeCompare(left.requestDate || "")
    );

    return {
      generatedAt: new Date().toISOString(),
      requests: requestRecords,
      issueDispatches,
      borrowLend,
      movements,
      inventory: inventory.map((item) => ({
        id: item.id,
        nameEn: item.nameEn,
        itemCode: item.itemCode || null,
        category: item.category,
        location: item.location,
        qty: item.qty,
        unit: item.unit,
        status: item.status,
        lastUpdated: toIsoString(item.lastUpdated),
        minThreshold: item.minThreshold,
      })),
      supervisors: supervisors.map((supervisor) => ({
        id: supervisor.id,
        name: supervisor.name,
        username: supervisor.username,
        assignedRegions: splitRegions(supervisor.region, supervisor.regions),
      })),
      warehouses: warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type || null,
        location: warehouse.location || null,
      })),
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
    logSanitizedDatabaseError("warehouse-kpi snapshot", error);

    return {
      generatedAt: new Date().toISOString(),
      requests: [],
      issueDispatches: [],
      borrowLend: [],
      movements: [],
      inventory: [],
      supervisors: [],
      warehouses: [],
      regions: [],
    } satisfies WarehouseKpiDataset;
  }
}
