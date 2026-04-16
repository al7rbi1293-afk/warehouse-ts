import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessWarehouse } from "@/lib/roles";
import { WarehouseExportModule, WAREHOUSE_EXPORT_TITLES } from "@/lib/warehouse-export";
import { inferWarehouseType, parseDateInput } from "@/lib/warehouse-utils";

export const runtime = "nodejs";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB");
}

function matchesSearch(value: Array<string | null | undefined>, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return value.some((candidate) => (candidate || "").toLowerCase().includes(term));
}

function getAllowedRegions(regionString?: string | null, regionsString?: string | null) {
  return (regionsString || regionString || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sanitizeSheetName(name: string) {
  return name.replace(/[\\/?*:[\]]/g, " ").slice(0, 31) || "Export";
}

function toWorkbookBuffer(rows: Record<string, string | number>[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.max(header.length + 2, 16),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function getOperationLabel(actionType?: string | null) {
  if (!actionType) return "";
  const normalized = actionType.toLowerCase();
  if (normalized.includes("transfer")) return "Transfer";
  if (normalized.includes("lent")) return "Lend";
  if (normalized.includes("returned")) return "Borrow Return";
  if (normalized.includes("issued")) return "Issue";
  if (normalized.includes("manual edit")) return "Manual Adjustment";
  if (normalized.includes("stock take")) return "Stock Take";
  return actionType;
}

async function buildRequestOperationMaps(requestIds: number[]) {
  if (requestIds.length === 0) {
    return {
      createdMap: new Map<number, string>(),
      dispatchMap: new Map<number, string>(),
    };
  }

  const lines = await prisma.warehouseBulkOperationLine.findMany({
    where: {
      entityType: "request",
      entityId: { in: requestIds },
    },
    include: {
      bulkOperation: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const createdMap = new Map<number, string>();
  const dispatchMap = new Map<number, string>();

  for (const line of lines) {
    if (!line.entityId) continue;
    if (line.bulkOperation.operationType === "REQUEST" && !createdMap.has(line.entityId)) {
      createdMap.set(line.entityId, line.bulkOperation.operationNo);
    }
    if (line.bulkOperation.operationType === "ISSUE") {
      dispatchMap.set(line.entityId, line.bulkOperation.operationNo);
    }
  }

  return { createdMap, dispatchMap };
}

async function buildLoanOperationMap(loanIds: number[]) {
  if (loanIds.length === 0) {
    return new Map<number, string>();
  }

  const lines = await prisma.warehouseBulkOperationLine.findMany({
    where: {
      entityType: { in: ["loan", "loan_return"] },
      entityId: { in: loanIds },
    },
    include: {
      bulkOperation: true,
    },
  });

  const result = new Map<number, string>();
  for (const line of lines) {
    if (!line.entityId) continue;
    result.set(line.entityId, line.bulkOperation.operationNo);
  }
  return result;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessWarehouse(session.user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const exportModule = (searchParams.get("module") || "stock") as WarehouseExportModule;
  const search = (searchParams.get("search") || "").trim();
  const status = (searchParams.get("status") || "").trim();
  const warehouse = (searchParams.get("warehouse") || "").trim();
  const region = (searchParams.get("region") || "").trim();
  const supervisor = (searchParams.get("supervisor") || "").trim();
  const category = (searchParams.get("category") || "").trim();
  const action = (searchParams.get("action") || "").trim();
  const dateFrom = parseDateInput(searchParams.get("dateFrom"));
  const dateTo = parseDateInput(searchParams.get("dateTo"), true);

  const actorName = session.user.name || session.user.username || "";
  const allowedRegions = getAllowedRegions(session.user.region, session.user.regions);
  const isSupervisor = session.user.role === "supervisor";

  try {
    if (exportModule === "stock") {
      if (isSupervisor) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const inventory = await prisma.inventory.findMany({
        where: {
          ...(warehouse ? { location: warehouse } : {}),
          ...(category ? { category } : {}),
        },
        orderBy: [{ location: "asc" }, { category: "asc" }, { nameEn: "asc" }],
      });

      const warehouseRows = await prisma.warehouse.findMany();
      const warehouseTypeMap = new Map(warehouseRows.map((row) => [row.name, row.type]));

      const rows = inventory
        .filter((item) => matchesSearch([item.nameEn, item.nameAr, item.itemCode, item.category], search))
        .map((item) => ({
          "Transaction Number": `INV-${item.id}`,
          "Movement Type": "Stock Snapshot",
          "Portal / Source Module": "Warehouse Stock",
          Status: item.status || "",
          "Item Name": item.nameEn,
          "Item Code": item.itemCode || "",
          Category: item.category || "",
          Quantity: item.qty,
          Unit: item.unit || "",
          "From Warehouse": item.location,
          "To Warehouse": "",
          "Warehouse Type": inferWarehouseType(item.location, warehouseTypeMap.get(item.location)),
          Supervisor: "",
          Region: "",
          "Requested By": "",
          "Approved By": "",
          "Issued By": "",
          "Received By": "",
          "Borrow / Lend Type": "",
          "Request Date": "",
          "Approval Date": "",
          "Issue Date": "",
          "Receive Date": "",
          "Return Due Date": "",
          "Return Date": "",
          Notes: "",
          "Created At": formatDateTime(item.lastUpdated),
          "Updated At": formatDateTime(item.lastUpdated),
        }));

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="warehouse-stock.xlsx"`,
        },
      });
    }

    if (["requests", "approved", "tracking", "dispatch"].includes(exportModule)) {
      const statusFilter =
        exportModule === "requests"
          ? session.user.role === "storekeeper"
            ? ["Approved"]
            : ["Pending"]
          : exportModule === "approved"
            ? ["Approved"]
            : exportModule === "dispatch"
              ? ["Issued", "Received"]
              : undefined;

      const requests = await prisma.request.findMany({
        where: {
          ...(statusFilter ? { status: { in: statusFilter } } : {}),
          ...(status && exportModule === "tracking" ? { status } : {}),
          ...(region ? { region } : {}),
          ...(supervisor ? { supervisorName: supervisor } : {}),
          ...(isSupervisor ? { supervisorName: actorName } : {}),
          ...(dateFrom || dateTo
            ? {
                requestDate: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ requestDate: "desc" }],
      });

      const visibleRequests = requests
        .filter((row) =>
          matchesSearch(
            [row.itemName, row.category, row.region, row.supervisorName, row.notes],
            search
          )
        )
        .filter((row) => !isSupervisor || allowedRegions.length === 0 || allowedRegions.includes(row.region || ""));

      const { createdMap, dispatchMap } = await buildRequestOperationMaps(
        visibleRequests.map((row) => row.reqId)
      );

      const inventoryRows = await prisma.inventory.findMany({
        where: {
          nameEn: { in: visibleRequests.map((row) => row.itemName || "").filter(Boolean) },
        },
        select: {
          id: true,
          nameEn: true,
          itemCode: true,
          category: true,
          unit: true,
        },
      });

      const inventoryLookup = new Map(inventoryRows.map((row) => [row.nameEn, row]));

      const rows = visibleRequests.map((row) => {
        const inventoryItem = inventoryLookup.get(row.itemName || "");
        return {
          "Transaction Number":
            exportModule === "dispatch"
              ? dispatchMap.get(row.reqId) || `REQ-${row.reqId}`
              : createdMap.get(row.reqId) || `REQ-${row.reqId}`,
          "Movement Type": exportModule === "dispatch" ? "Issue / Dispatch" : "Request",
          "Portal / Source Module": WAREHOUSE_EXPORT_TITLES[exportModule],
          Status: row.status || "",
          "Item Name": row.itemName || "",
          "Item Code": inventoryItem?.itemCode || "",
          Category: row.category || inventoryItem?.category || "",
          Quantity: row.qty || 0,
          Unit: row.unit || inventoryItem?.unit || "",
          "From Warehouse": "NSTC",
          "To Warehouse": row.region || "",
          "Warehouse Type": inferWarehouseType("NSTC"),
          Supervisor: row.supervisorName || "",
          Region: row.region || "",
          "Requested By": row.supervisorName || "",
          "Approved By": row.approvedBy || "",
          "Issued By": row.issuedBy || "",
          "Received By": row.status === "Received" ? row.supervisorName || "" : "",
          "Borrow / Lend Type": "",
          "Request Date": formatDateTime(row.requestDate),
          "Approval Date": formatDateTime(row.approvedAt || row.reviewedAt),
          "Issue Date": formatDateTime(row.issuedAt),
          "Receive Date": formatDateTime(row.receivedAt),
          "Return Due Date": "",
          "Return Date": "",
          Notes: row.notes || "",
          "Created At": formatDateTime(row.requestDate),
          "Updated At": formatDateTime(row.receivedAt || row.issuedAt || row.approvedAt || row.reviewedAt || row.requestDate),
        };
      });

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${exportModule}.xlsx"`,
        },
      });
    }

    if (exportModule === "movements") {
      if (isSupervisor) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const logs = await prisma.stockLog.findMany({
        where: {
          ...(warehouse ? { location: warehouse } : {}),
          ...(dateFrom || dateTo
            ? {
                logDate: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ logDate: "desc" }],
        take: 5000,
      });

      const inventoryRows = await prisma.inventory.findMany({
        where: {
          nameEn: { in: logs.map((row) => row.itemName || "").filter(Boolean) },
        },
        select: {
          nameEn: true,
          itemCode: true,
          category: true,
        },
      });
      const inventoryLookup = new Map(inventoryRows.map((row) => [row.nameEn, row]));

      const rows = logs
        .filter((row) => matchesSearch([row.itemName, row.actionType, row.location, row.actionBy], search))
        .filter((row) => (action ? (row.actionType || "").toLowerCase().includes(action.toLowerCase()) : true))
        .map((row) => {
          const inventoryItem = inventoryLookup.get(row.itemName || "");
          return {
            "Transaction Number": `MOV-${row.id}`,
            "Movement Type": getOperationLabel(row.actionType),
            "Portal / Source Module": "Stock Movements",
            Status: "",
            "Item Name": row.itemName || "",
            "Item Code": inventoryItem?.itemCode || "",
            Category: inventoryItem?.category || "",
            Quantity: row.changeAmount || 0,
            Unit: row.unit || "",
            "From Warehouse": row.changeAmount && row.changeAmount < 0 ? row.location || "" : "",
            "To Warehouse": row.changeAmount && row.changeAmount > 0 ? row.location || "" : "",
            "Warehouse Type": inferWarehouseType(row.location),
            Supervisor: "",
            Region: "",
            "Requested By": "",
            "Approved By": "",
            "Issued By": row.actionBy || "",
            "Received By": "",
            "Borrow / Lend Type": "",
            "Request Date": "",
            "Approval Date": "",
            "Issue Date": formatDateTime(row.logDate),
            "Receive Date": "",
            "Return Due Date": "",
            "Return Date": "",
            Notes: row.actionType || "",
            "Created At": formatDateTime(row.logDate),
            "Updated At": formatDateTime(row.logDate),
          };
        });

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="stock-movements.xlsx"`,
        },
      });
    }

    if (exportModule === "transfers") {
      const transferLines = await prisma.warehouseBulkOperationLine.findMany({
        where: {
          bulkOperation: { is: { operationType: "TRANSFER" } },
        },
        include: { bulkOperation: true },
        orderBy: [{ createdAt: "desc" }],
      });

      const rows = transferLines
        .filter((line) => matchesSearch([line.itemName, line.itemCode, line.fromWarehouse, line.toWarehouse], search))
        .filter((line) => (warehouse ? line.fromWarehouse === warehouse || line.toWarehouse === warehouse : true))
        .filter((line) => (dateFrom ? line.createdAt >= dateFrom : true))
        .filter((line) => (dateTo ? line.createdAt <= dateTo : true))
        .map((line) => ({
          "Transaction Number": line.bulkOperation.operationNo,
          "Movement Type": "Transfer",
          "Portal / Source Module": "Transfers",
          Status: line.status,
          "Item Name": line.itemName,
          "Item Code": line.itemCode || "",
          Category: line.category || "",
          Quantity: line.quantity,
          Unit: line.unit || "",
          "From Warehouse": line.fromWarehouse || "",
          "To Warehouse": line.toWarehouse || "",
          "Warehouse Type": inferWarehouseType(line.fromWarehouse),
          Supervisor: "",
          Region: line.region || "",
          "Requested By": line.bulkOperation.createdBy,
          "Approved By": "",
          "Issued By": line.bulkOperation.createdBy,
          "Received By": "",
          "Borrow / Lend Type": "",
          "Request Date": "",
          "Approval Date": "",
          "Issue Date": formatDateTime(line.createdAt),
          "Receive Date": "",
          "Return Due Date": "",
          "Return Date": "",
          Notes: line.notes || "",
          "Created At": formatDateTime(line.createdAt),
          "Updated At": formatDateTime(line.updatedAt),
        }));

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="transfers.xlsx"`,
        },
      });
    }

    if (exportModule === "borrow-lend") {
      const loans = await prisma.loan.findMany({
        where: {
          ...(warehouse ? { sourceWarehouse: warehouse } : {}),
        },
        orderBy: [{ id: "desc" }],
        take: 5000,
      });

      const inventoryRows = await prisma.inventory.findMany({
        where: {
          id: { in: loans.map((row) => row.itemId) },
        },
        select: {
          id: true,
          itemCode: true,
          category: true,
          unit: true,
        },
      });
      const inventoryLookup = new Map(inventoryRows.map((row) => [row.id, row]));
      const operationMap = await buildLoanOperationMap(loans.map((row) => row.id));

      const rows = loans
        .filter((loan) => matchesSearch([loan.itemName, loan.project, loan.reference, loan.notes], search))
        .filter((loan) => (status ? loan.status === status : true))
        .filter((loan) => (dateFrom ? new Date(loan.date) >= dateFrom : true))
        .filter((loan) => (dateTo ? new Date(loan.date) <= dateTo : true))
        .map((loan) => {
          const inventoryItem = inventoryLookup.get(loan.itemId);
          return {
            "Transaction Number": operationMap.get(loan.id) || `LON-${loan.id}`,
            "Movement Type": loan.type === "Borrow" ? "Borrow Return" : "Lend",
            "Portal / Source Module": "Borrow Lend",
            Status: loan.status,
            "Item Name": loan.itemName,
            "Item Code": inventoryItem?.itemCode || "",
            Category: inventoryItem?.category || "",
            Quantity: loan.originalQuantity || loan.quantity,
            Unit: inventoryItem?.unit || "",
            "From Warehouse": loan.type === "Borrow" ? loan.project : loan.sourceWarehouse || "",
            "To Warehouse": loan.type === "Borrow" ? loan.sourceWarehouse || "" : loan.project,
            "Warehouse Type": inferWarehouseType(loan.sourceWarehouse),
            Supervisor: "",
            Region: "",
            "Requested By": "",
            "Approved By": "",
            "Issued By": loan.type === "Lend" ? (loan.sourceWarehouse || "") : "",
            "Received By": loan.type === "Borrow" ? (loan.sourceWarehouse || "") : "",
            "Borrow / Lend Type": loan.type,
            "Request Date": formatDateTime(loan.date),
            "Approval Date": "",
            "Issue Date": loan.type === "Lend" ? formatDateTime(loan.date) : "",
            "Receive Date": loan.type === "Borrow" ? formatDateTime(loan.date) : "",
            "Return Due Date": formatDate(loan.expectedReturnDate),
            "Return Date": formatDate(loan.returnDate),
            Notes: loan.notes || loan.reference || "",
            "Created At": formatDateTime(loan.date),
            "Updated At": formatDateTime(loan.returnDate || loan.expectedReturnDate || loan.date),
          };
        });

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="borrow-lend.xlsx"`,
        },
      });
    }

    if (exportModule === "regional-stock") {
      const localInventory = await prisma.localInventory.findMany({
        where: {
          ...(region ? { region } : {}),
        },
        orderBy: [{ region: "asc" }, { itemName: "asc" }],
      });

      const inventoryRows = await prisma.inventory.findMany({
        where: {
          nameEn: { in: localInventory.map((row) => row.itemName) },
        },
        select: {
          nameEn: true,
          itemCode: true,
          category: true,
          unit: true,
        },
      });
      const inventoryLookup = new Map(inventoryRows.map((row) => [row.nameEn, row]));

      const rows = localInventory
        .filter((row) => !isSupervisor || allowedRegions.length === 0 || allowedRegions.includes(row.region))
        .filter((row) => matchesSearch([row.itemName, row.region, row.updatedBy], search))
        .map((row) => {
          const inventoryItem = inventoryLookup.get(row.itemName);
          return {
            "Transaction Number": `REG-${row.region}-${row.itemName}`,
            "Movement Type": "Regional Stock",
            "Portal / Source Module": "Regional Stock",
            Status: "",
            "Item Name": row.itemName,
            "Item Code": inventoryItem?.itemCode || "",
            Category: inventoryItem?.category || "",
            Quantity: row.qty || 0,
            Unit: inventoryItem?.unit || "",
            "From Warehouse": "",
            "To Warehouse": row.region,
            "Warehouse Type": "Regional",
            Supervisor: row.updatedBy || "",
            Region: row.region,
            "Requested By": "",
            "Approved By": "",
            "Issued By": "",
            "Received By": row.updatedBy || "",
            "Borrow / Lend Type": "",
            "Request Date": "",
            "Approval Date": "",
            "Issue Date": "",
            "Receive Date": formatDateTime(row.lastUpdated),
            "Return Due Date": "",
            "Return Date": "",
            Notes: "",
            "Created At": formatDateTime(row.lastUpdated),
            "Updated At": formatDateTime(row.lastUpdated),
          };
        });

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="regional-stock.xlsx"`,
        },
      });
    }

    if (exportModule === "audit") {
      if (session.user.role !== "manager") {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const logs = await prisma.auditLog.findMany({
        orderBy: [{ timestamp: "desc" }],
        take: 5000,
      });

      const rows = logs
        .filter((row) => matchesSearch([row.userName, row.action, row.module, row.details], search))
        .filter((row) => (dateFrom ? row.timestamp >= dateFrom : true))
        .filter((row) => (dateTo ? row.timestamp <= dateTo : true))
        .map((row) => ({
          "Transaction Number": `AUD-${row.id}`,
          "Movement Type": row.action,
          "Portal / Source Module": row.module || "Warehouse",
          Status: "",
          "Item Name": "",
          "Item Code": "",
          Category: "",
          Quantity: 0,
          Unit: "",
          "From Warehouse": "",
          "To Warehouse": "",
          "Warehouse Type": "",
          Supervisor: "",
          Region: "",
          "Requested By": row.userName,
          "Approved By": "",
          "Issued By": "",
          "Received By": "",
          "Borrow / Lend Type": "",
          "Request Date": "",
          "Approval Date": "",
          "Issue Date": "",
          "Receive Date": "",
          "Return Due Date": "",
          "Return Date": "",
          Notes: row.details || "",
          "Created At": formatDateTime(row.timestamp),
          "Updated At": formatDateTime(row.timestamp),
        }));

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="audit-log.xlsx"`,
        },
      });
    }

    return Response.json({ error: "Unsupported export module" }, { status: 400 });
  } catch (error) {
    console.error("Warehouse export error", error);
    return Response.json({ error: "Failed to generate export" }, { status: 500 });
  }
}
