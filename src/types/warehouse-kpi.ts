export type WarehouseKpiWarehouseType =
  | "all"
  | "internal"
  | "external"
  | "central";

export interface WarehouseKpiRequestRecord {
  reqId: number;
  requestNo: string;
  requestOperationNo: string | null;
  dispatchOperationNo: string | null;
  supervisorName: string | null;
  region: string | null;
  warehouse: string;
  warehouseType: string;
  itemName: string | null;
  itemCode: string | null;
  category: string | null;
  qty: number | null;
  unit: string | null;
  status: string | null;
  requestDate: string | null;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  receivedAt: string | null;
}

export interface WarehouseKpiIssueDispatchRecord {
  transactionNo: string;
  requestNo: string;
  reqId: number | null;
  warehouse: string;
  warehouseType: string;
  itemName: string;
  itemCode: string | null;
  supervisorName: string | null;
  region: string | null;
  issuedBy: string | null;
  receivedBy: string | null;
  status: string;
  quantity: number;
  unit: string | null;
  date: string;
  notes: string | null;
}

export interface WarehouseKpiBorrowLendRecord {
  transactionNo: string;
  loanId: number;
  type: string;
  source: string;
  destination: string;
  warehouseType: string;
  itemName: string;
  itemCode: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  date: string;
  status: string;
  notes: string | null;
  expectedReturnDate: string | null;
  returnDate: string | null;
}

export interface WarehouseKpiMovementRecord {
  movementNo: string;
  movementType: string;
  sourceModule: string;
  status: string | null;
  itemName: string;
  itemCode: string | null;
  category: string | null;
  from: string;
  to: string;
  warehouseType: string;
  quantity: number;
  unit: string | null;
  date: string;
  relatedUser: string | null;
  supervisorName: string | null;
  region: string | null;
  notes: string | null;
}

export interface WarehouseKpiInventoryRecord {
  id: number;
  nameEn: string;
  itemCode: string | null;
  category: string | null;
  location: string;
  qty: number;
  unit: string | null;
  status: string | null;
  lastUpdated: string | null;
  minThreshold: number;
}

export interface WarehouseKpiSupervisorRecord {
  id: number;
  name: string | null;
  username: string;
  assignedRegions: string[];
}

export interface WarehouseKpiWarehouseRecord {
  id: number;
  name: string;
  type: string | null;
  location: string | null;
}

export interface WarehouseKpiRegionRecord {
  id: number;
  name: string;
}

export interface WarehouseKpiDataset {
  generatedAt: string;
  requests: WarehouseKpiRequestRecord[];
  issueDispatches: WarehouseKpiIssueDispatchRecord[];
  borrowLend: WarehouseKpiBorrowLendRecord[];
  movements: WarehouseKpiMovementRecord[];
  inventory: WarehouseKpiInventoryRecord[];
  supervisors: WarehouseKpiSupervisorRecord[];
  warehouses: WarehouseKpiWarehouseRecord[];
  regions: WarehouseKpiRegionRecord[];
}
