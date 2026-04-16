import { WarehouseExportFilterState } from "@/types";

export type WarehouseExportModule =
  | "stock"
  | "requests"
  | "approved"
  | "tracking"
  | "dispatch"
  | "movements"
  | "transfers"
  | "borrow-lend"
  | "regional-stock"
  | "audit";

export const WAREHOUSE_EXPORT_TITLES: Record<WarehouseExportModule, string> = {
  stock: "Warehouse Stock",
  requests: "Pending Requests",
  approved: "Approved Requests",
  tracking: "Request Tracking",
  dispatch: "Issue Dispatch",
  movements: "Stock Movements",
  transfers: "Transfers",
  "borrow-lend": "Borrow Lend",
  "regional-stock": "Regional Stock",
  audit: "Audit Log",
};

export function buildWarehouseExportUrl(
  module: WarehouseExportModule,
  filters: WarehouseExportFilterState = {}
) {
  const params = new URLSearchParams({ module });

  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const normalized = `${value}`.trim();
    if (!normalized) return;
    params.set(key, normalized);
  });

  return `/api/warehouse/export?${params.toString()}`;
}
