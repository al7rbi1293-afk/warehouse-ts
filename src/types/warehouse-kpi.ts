export type WarehouseKpiScope = "all" | "internal" | "external" | "central";

export type WarehouseKpiWarehouseType =
  | "all"
  | "main"
  | "regional"
  | "central";

export interface WarehouseKpiRequestRecord {
  reqId: number;
  supervisorName: string | null;
  region: string | null;
  itemName: string | null;
  category: string | null;
  qty: number | null;
  unit: string | null;
  status: string | null;
  requestDate: string | null;
  notes: string | null;
  shiftName: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  receivedAt: string | null;
}

export interface WarehouseKpiInventoryRecord {
  id: number;
  nameEn: string;
  category: string | null;
  location: string;
  qty: number;
  unit: string | null;
  status: string | null;
  lastUpdated: string | null;
  minThreshold: number;
}

export interface WarehouseKpiLocalInventoryRecord {
  region: string;
  itemName: string;
  qty: number | null;
  lastUpdated: string | null;
  updatedBy: string | null;
}

export interface WarehouseKpiLoanRecord {
  id: number;
  itemId: number;
  itemName: string;
  project: string;
  quantity: number;
  type: string;
  sourceWarehouse: string | null;
  date: string;
  status: string;
}

export interface WarehouseKpiStockLogRecord {
  id: number;
  itemName: string | null;
  changeAmount: number | null;
  location: string | null;
  actionBy: string | null;
  actionType: string | null;
  unit: string | null;
  newQty: number | null;
  logDate: string | null;
}

export interface WarehouseKpiSupervisorRecord {
  id: number;
  name: string | null;
  username: string;
  role: string | null;
  assignedRegions: string[];
}

export interface WarehouseKpiWarehouseRecord {
  id: number;
  name: string;
  location: string | null;
}

export interface WarehouseKpiRegionRecord {
  id: number;
  name: string;
}

export interface WarehouseKpiDataset {
  generatedAt: string;
  requests: WarehouseKpiRequestRecord[];
  inventory: WarehouseKpiInventoryRecord[];
  localInventory: WarehouseKpiLocalInventoryRecord[];
  loans: WarehouseKpiLoanRecord[];
  stockLogs: WarehouseKpiStockLogRecord[];
  supervisors: WarehouseKpiSupervisorRecord[];
  warehouses: WarehouseKpiWarehouseRecord[];
  regions: WarehouseKpiRegionRecord[];
}
