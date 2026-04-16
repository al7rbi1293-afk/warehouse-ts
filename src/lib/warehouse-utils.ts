import { WarehouseBulkOperationType } from "@/types";

export const WAREHOUSE_OPERATION_LABELS: Record<WarehouseBulkOperationType, string> = {
  REQUEST: "Bulk Request",
  TRANSFER: "Bulk Transfer",
  LEND: "Bulk Lend",
  BORROW: "Bulk Borrow",
  ISSUE: "Bulk Dispatch",
};

export function normalizePositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildBulkOperationNo(operationType: WarehouseBulkOperationType, id: number) {
  const prefixMap: Record<WarehouseBulkOperationType, string> = {
    REQUEST: "BRQ",
    TRANSFER: "BTR",
    LEND: "BLN",
    BORROW: "BBR",
    ISSUE: "BSD",
  };

  return `${prefixMap[operationType]}-${String(id).padStart(6, "0")}`;
}

export function inferWarehouseType(warehouseName?: string | null, explicitType?: string | null) {
  if (explicitType?.trim()) {
    return explicitType.trim();
  }

  const normalized = (warehouseName || "").trim().toUpperCase();
  if (!normalized) {
    return "";
  }

  if (normalized === "NSTC") {
    return "Central";
  }

  if (normalized === "CWW" || normalized.includes("EXTERNAL")) {
    return "External";
  }

  return "Internal";
}

export function withinDateRange(value: Date | null | undefined, from?: Date | null, to?: Date | null) {
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function parseDateInput(value?: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}
