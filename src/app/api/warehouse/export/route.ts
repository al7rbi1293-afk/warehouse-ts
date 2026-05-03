import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getWarehouseKpiDataset } from "@/lib/warehouse-kpi";
import { prisma } from "@/lib/prisma";
import { logSanitizedDatabaseError } from "@/lib/database-health";
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

function normalizeValue(value?: string | number | null) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function matchesExactValue(value: string | null | undefined, filter: string) {
  const normalizedFilter = normalizeValue(filter);
  if (!normalizedFilter) return true;
  return normalizeValue(value) === normalizedFilter;
}

function matchesLooseValue(value: string | null | undefined, filter: string) {
  const normalizedFilter = normalizeValue(filter);
  if (!normalizedFilter) return true;

  const normalizedValue = normalizeValue(value);
  return (
    normalizedValue === normalizedFilter ||
    normalizedValue.includes(normalizedFilter) ||
    normalizedFilter.includes(normalizedValue)
  );
}

function matchesWarehouse(values: Array<string | null | undefined>, filter: string) {
  const normalizedFilter = normalizeValue(filter);
  if (!normalizedFilter) return true;

  return values.some((value) => normalizeValue(value) === normalizedFilter);
}

function matchesItem(
  itemName: string | null | undefined,
  itemCode: string | null | undefined,
  filter: string
) {
  const normalizedFilter = normalizeValue(filter);
  if (!normalizedFilter) return true;

  return [itemName, itemCode].some((value) =>
    normalizeValue(value).includes(normalizedFilter)
  );
}

function matchesDateRange(
  value: string | Date | null | undefined,
  dateFrom?: Date | null,
  dateTo?: Date | null
) {
  if (!dateFrom && !dateTo) return true;
  if (!value) return false;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;

  return true;
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
  const warehouseType = (searchParams.get("warehouseType") || "").trim();
  const item = (searchParams.get("item") || "").trim();
  const movementType = (searchParams.get("movementType") || "").trim();
  const loanType = (searchParams.get("loanType") || "").trim();
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

    if (["requests", "approved", "tracking"].includes(exportModule)) {
      const dataset = await getWarehouseKpiDataset();
      const requiredStatuses =
        exportModule === "requests"
          ? session.user.role === "storekeeper"
            ? ["Approved"]
            : ["Pending"]
          : exportModule === "approved"
            ? ["Approved"]
            : undefined;

      const supervisorFilter = isSupervisor ? actorName : supervisor;

      const rows = dataset.requests
        .filter((row) =>
          requiredStatuses
            ? requiredStatuses.some((requiredStatus) =>
                matchesExactValue(row.status, requiredStatus)
              )
            : true
        )
        .filter((row) =>
          exportModule === "tracking" && status ? matchesLooseValue(row.status, status) : true
        )
        .filter((row) => matchesDateRange(row.requestDate, dateFrom, dateTo))
        .filter((row) => matchesExactValue(row.region, region))
        .filter((row) => matchesExactValue(row.supervisorName, supervisorFilter))
        .filter((row) => matchesExactValue(row.warehouseType, warehouseType))
        .filter((row) => matchesWarehouse([row.warehouse], warehouse))
        .filter((row) => matchesItem(row.itemName, row.itemCode, item))
        .filter(() => !loanType)
        .filter(() => matchesLooseValue("Request", movementType))
        .filter((row) =>
          matchesSearch(
            [
              row.requestNo,
              row.requestOperationNo,
              row.dispatchOperationNo,
              row.itemName,
              row.itemCode,
              row.category,
              row.region,
              row.supervisorName,
              row.warehouse,
              row.notes,
              row.status,
            ],
            search
          )
        )
        .filter((row) => !isSupervisor || allowedRegions.length === 0 || allowedRegions.includes(row.region || ""))
        .map((row) => ({
          "Transaction Number": row.requestOperationNo || row.requestNo,
          "Movement Type": "Request",
          "Portal / Source Module": WAREHOUSE_EXPORT_TITLES[exportModule],
          Status: row.status || "",
          "Item Name": row.itemName || "",
          "Item Code": row.itemCode || "",
          Category: row.category || "",
          Quantity: row.qty || 0,
          Unit: row.unit || "",
          "From Warehouse": row.warehouse || "",
          "To Warehouse": row.region || "",
          "Warehouse Type": row.warehouseType || "",
          Supervisor: row.supervisorName || "",
          Region: row.region || "",
          "Requested By": row.supervisorName || "",
          "Approved By": row.approvedBy || "",
          "Issued By": row.issuedBy || "",
          "Received By": row.receivedAt ? row.supervisorName || "" : "",
          "Borrow / Lend Type": "",
          "Request Date": formatDateTime(row.requestDate),
          "Approval Date": formatDateTime(row.approvedAt),
          "Issue Date": formatDateTime(row.issuedAt),
          "Receive Date": formatDateTime(row.receivedAt),
          "Return Due Date": "",
          "Return Date": "",
          Notes: row.notes || "",
          "Created At": formatDateTime(row.requestDate),
          "Updated At": formatDateTime(row.receivedAt || row.issuedAt || row.approvedAt || row.requestDate),
        }));

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${exportModule}.xlsx"`,
        },
      });
    }

    if (exportModule === "dispatch") {
      const dataset = await getWarehouseKpiDataset();
      const supervisorFilter = isSupervisor ? actorName : supervisor;

      const rows = dataset.issueDispatches
        .filter((row) => matchesDateRange(row.date, dateFrom, dateTo))
        .filter((row) => matchesExactValue(row.region, region))
        .filter((row) => matchesExactValue(row.supervisorName, supervisorFilter))
        .filter((row) => matchesLooseValue(row.status, status))
        .filter((row) => matchesExactValue(row.warehouseType, warehouseType))
        .filter((row) => matchesWarehouse([row.warehouse], warehouse))
        .filter((row) => matchesItem(row.itemName, row.itemCode, item))
        .filter(() => !loanType)
        .filter(() => matchesLooseValue("Issue / Dispatch", movementType))
        .filter((row) =>
          matchesSearch(
            [
              row.transactionNo,
              row.requestNo,
              row.itemName,
              row.itemCode,
              row.warehouse,
              row.supervisorName,
              row.region,
              row.issuedBy,
              row.receivedBy,
              row.notes,
              row.status,
            ],
            search
          )
        )
        .filter((row) => !isSupervisor || allowedRegions.length === 0 || allowedRegions.includes(row.region || ""))
        .map((row) => ({
          "Transaction Number": row.transactionNo,
          "Movement Type": "Issue / Dispatch",
          "Portal / Source Module": WAREHOUSE_EXPORT_TITLES[exportModule],
          Status: row.status || "",
          "Item Name": row.itemName || "",
          "Item Code": row.itemCode || "",
          Category: "",
          Quantity: row.quantity,
          Unit: row.unit || "",
          "From Warehouse": row.warehouse || "",
          "To Warehouse": row.region || "",
          "Warehouse Type": row.warehouseType || "",
          Supervisor: row.supervisorName || "",
          Region: row.region || "",
          "Requested By": row.supervisorName || "",
          "Approved By": "",
          "Issued By": row.issuedBy || "",
          "Received By": row.receivedBy || "",
          "Borrow / Lend Type": "",
          "Request Date": "",
          "Approval Date": "",
          "Issue Date": formatDateTime(row.date),
          "Receive Date": "",
          "Return Due Date": "",
          "Return Date": "",
          Notes: row.notes || "",
          "Created At": formatDateTime(row.date),
          "Updated At": formatDateTime(row.date),
        }));

      const buffer = toWorkbookBuffer(rows, WAREHOUSE_EXPORT_TITLES[exportModule]);
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="dispatch.xlsx"`,
        },
      });
    }

    if (exportModule === "movements") {
      if (isSupervisor) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const dataset = await getWarehouseKpiDataset();
      const movementFilter = movementType || action;

      const rows = dataset.movements
        .filter((row) => matchesDateRange(row.date, dateFrom, dateTo))
        .filter((row) => matchesExactValue(row.region, region))
        .filter((row) => matchesLooseValue(row.status, status))
        .filter((row) => matchesExactValue(row.warehouseType, warehouseType))
        .filter((row) => matchesWarehouse([row.from, row.to], warehouse))
        .filter((row) => matchesItem(row.itemName, row.itemCode, item))
        .filter((row) => matchesLooseValue(row.movementType, movementFilter))
        .filter((row) => (loanType ? matchesLooseValue(row.movementType, loanType) : true))
        .filter((row) => matchesExactValue(row.supervisorName || row.relatedUser, supervisor))
        .filter((row) =>
          matchesSearch(
            [
              row.movementNo,
              row.movementType,
              row.sourceModule,
              row.itemName,
              row.itemCode,
              row.category,
              row.from,
              row.to,
              row.relatedUser,
              row.supervisorName,
              row.region,
              row.notes,
              row.status,
            ],
            search
          )
        )
        .map((row) => ({
          "Transaction Number": row.movementNo,
          "Movement Type": row.movementType,
          "Portal / Source Module": row.sourceModule,
          Status: row.status || "",
          "Item Name": row.itemName || "",
          "Item Code": row.itemCode || "",
          Category: row.category || "",
          Quantity: row.quantity,
          Unit: row.unit || "",
          "From Warehouse": row.from || "",
          "To Warehouse": row.to || "",
          "Warehouse Type": row.warehouseType || "",
          Supervisor: row.supervisorName || "",
          Region: row.region || "",
          "Requested By": "",
          "Approved By": "",
          "Issued By": row.relatedUser || "",
          "Received By": "",
          "Borrow / Lend Type":
            row.movementType.toLowerCase().includes("lend")
              ? "Lend"
              : row.movementType.toLowerCase().includes("borrow")
                ? "Borrow"
                : "",
          "Request Date": "",
          "Approval Date": "",
          "Issue Date": formatDateTime(row.date),
          "Receive Date": "",
          "Return Due Date": "",
          "Return Date": "",
          Notes: row.notes || "",
          "Created At": formatDateTime(row.date),
          "Updated At": formatDateTime(row.date),
        }));

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
        .filter((line) => matchesExactValue(inferWarehouseType(line.fromWarehouse), warehouseType))
        .filter((line) => (warehouse ? line.fromWarehouse === warehouse || line.toWarehouse === warehouse : true))
        .filter((line) => matchesItem(line.itemName, line.itemCode, item))
        .filter(() => (movementType ? matchesLooseValue("Transfer", movementType) : true))
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
      const dataset = await getWarehouseKpiDataset();

      const rows = dataset.borrowLend
        .filter((row) => matchesSearch([row.transactionNo, row.itemName, row.itemCode, row.source, row.destination, row.notes], search))
        .filter((row) => matchesLooseValue(row.status, status))
        .filter((row) => matchesDateRange(row.date, dateFrom, dateTo))
        .filter((row) => matchesExactValue(row.warehouseType, warehouseType))
        .filter((row) => matchesWarehouse([row.source, row.destination], warehouse))
        .filter((row) => matchesItem(row.itemName, row.itemCode, item))
        .filter((row) => matchesLooseValue(row.type, loanType))
        .filter((row) => matchesLooseValue(row.type, movementType))
        .filter((row) => {
          if (!region) return true;
          return matchesSearch([row.source, row.destination], region);
        })
        .filter(() => !supervisor)
        .map((row) => ({
          "Transaction Number": row.transactionNo,
          "Movement Type": row.type,
          "Portal / Source Module": "Borrow Lend",
          Status: row.status,
          "Item Name": row.itemName,
          "Item Code": row.itemCode || "",
          Category: row.category || "",
          Quantity: row.quantity,
          Unit: row.unit || "",
          "From Warehouse": row.source || "",
          "To Warehouse": row.destination || "",
          "Warehouse Type": row.warehouseType || "",
          Supervisor: "",
          Region: "",
          "Requested By": "",
          "Approved By": "",
          "Issued By": row.type === "Lend" ? row.source || "" : "",
          "Received By": row.type === "Borrow" ? row.destination || "" : "",
          "Borrow / Lend Type": row.type,
          "Request Date": formatDateTime(row.date),
          "Approval Date": "",
          "Issue Date": row.type === "Lend" ? formatDateTime(row.date) : "",
          "Receive Date": row.type === "Borrow" ? formatDateTime(row.date) : "",
          "Return Due Date": formatDate(row.expectedReturnDate),
          "Return Date": formatDate(row.returnDate),
          Notes: row.notes || "",
          "Created At": formatDateTime(row.date),
          "Updated At": formatDateTime(row.returnDate || row.expectedReturnDate || row.date),
        }));

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
    logSanitizedDatabaseError("api:warehouse-export", error);
    return Response.json({ error: "Failed to generate export" }, { status: 500 });
  }
}
