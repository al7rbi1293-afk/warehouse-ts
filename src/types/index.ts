// Type definitions for NSTC Management App

// =====================
// User Types
// =====================
export interface User {
  id: number;
  username: string;
  password?: string;
  name: string | null;
  role: UserRole | null;
  region: string | null;  // Legacy single region
  regions?: string | null; // Multi-zone: comma-separated list of assigned zones
  shiftId: number | null;
  attendanceShiftId?: number | null; // Attendance shift if different from primary
  createdAt?: Date;
  shiftName?: string | null;
  allowedShifts?: string | null;
  empId?: string | null;
}

export type SafeUser = Omit<User, 'password'>;

export type UserRole =
  | 'manager'
  | 'admin'
  | 'supervisor'
  | 'storekeeper'
  | 'night_supervisor'
  | 'senior';

export interface SessionUser {
  username: string;
  name: string;
  role: UserRole;
  region: string;
  regions: string | null; // Multi-zone support
  shiftId: number | null;
  attendanceShiftId: number | null;
  shiftName: string | null;
  allowedShifts: string | null;
}

// =====================
// Shift Types
// =====================
export interface Shift {
  id: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
}

// =====================
// Worker Types
// =====================
export interface Worker {
  id: number;
  name: string;
  empId: string | null;
  role: string | null;
  region: string | null;
  status: string | null;
  shiftId: number | null;
  createdAt: Date | null;
  shiftName?: string | null;
  shift?: Shift | null;
}

export interface WorkerFormData {
  name: string;
  empId: string;
  role: string;
  region: string;
  shiftId: number | null;
}

// =====================
// Attendance Types
// =====================
export interface Attendance {
  id: number;
  workerId: number;
  date: Date;
  status: AttendanceStatus | null;
  shiftId: number | null;
  returnDate: Date | null;
  notes: string | null;
  supervisor: string | null;
  createdAt: Date;
  workerName?: string;
  worker?: Worker;
}

export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Vacation'
  | 'Day Off'
  | 'Eid Holiday'
  | 'Sick Leave'
  | string; // Relaxed to allow string from DB

export interface AttendanceFormData {
  workerId: number;
  date: string;
  status: AttendanceStatus;
  notes: string;
}

// =====================
// Inventory Types
// =====================
export interface InventoryItem {
  id: number;
  nameEn: string;
  nameAr?: string | null;
  itemCode?: string | null;
  category: string | null;
  unit: string | null;
  qty: number;
  minThreshold: number;
  location: WarehouseLocation;
  status: string | null;
  lastUpdated: Date | null;
}

export type WarehouseLocation = 'NSTC' | 'SNC' | string;

export interface InventoryFormData {
  nameEn: string;
  category: string;
  unit: string;
  qty: number;
  location: WarehouseLocation;
}

// =====================
// Local Inventory Types
// =====================
export interface LocalInventoryItem {
  region: string;
  itemName: string;
  qty: number | null;
  lastUpdated: Date | null;
  updatedBy: string | null;
}

// =====================
// Request Types
// =====================
export interface Request {
  reqId: number;
  supervisorName: string | null;
  region: string | null;
  itemName: string | null;
  category: string | null;
  qty: number | null;
  unit: string | null;
  status: RequestStatus | null;
  requestDate: Date | null;
  notes: string | null;
  issuedBy?: string | null;
  issuedAt?: Date | null;
  shiftId?: number | null;
  shiftName?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  receivedAt?: Date | null;
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Issued' | 'Received' | string;

export interface RequestFormData {
  itemName: string;
  category: string;
  qty: number;
  unit: string;
  region: string;
}

// =====================
// Stock Log Types
// =====================
export interface StockLog {
  id: number;
  logDate: Date | null;
  itemName: string | null;
  changeAmount: number | null;
  location: string | null;
  actionBy: string | null;
  actionType: string | null;
  unit: string | null;
  newQty: number | null;
  userName: string | null;
}

export interface LoanRecord {
  id: number;
  itemId: number;
  itemName: string;
  project: string;
  quantity: number;
  originalQuantity?: number | null;
  returnedQuantity?: number | null;
  type: string;
  sourceWarehouse?: string | null;
  date: string;
  status: string;
  expectedReturnDate?: Date | null;
  returnDate?: Date | null;
  reference?: string | null;
  notes?: string | null;
}

// =====================
// Audit Log Types
// =====================
export interface AuditLog {
  id: number;
  timestamp: Date;
  userName: string;
  action: string;
  details: string | null;
  module: string | null;
}

export interface Warehouse {
  id: number;
  name: string;
  type?: string | null;
  location?: string | null;
  createdAt?: Date | null;
}

export type WarehouseBulkOperationType =
  | "REQUEST"
  | "TRANSFER"
  | "LEND"
  | "BORROW"
  | "ISSUE";

export interface WarehouseBulkOperation {
  id: number;
  operationNo: string;
  operationType: WarehouseBulkOperationType | string;
  status: string;
  createdBy: string;
  createdByUserId?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseBulkOperationLine {
  id: number;
  bulkOperationId: number;
  lineNo: number;
  entityType?: string | null;
  entityId?: number | null;
  status: string;
  itemId?: number | null;
  itemName: string;
  itemCode?: string | null;
  category?: string | null;
  unit?: string | null;
  quantity: number;
  approvedQty?: number | null;
  fulfilledQty?: number | null;
  availableQtySnapshot?: number | null;
  fromWarehouse?: string | null;
  toWarehouse?: string | null;
  region?: string | null;
  projectName?: string | null;
  expectedReturnDate?: Date | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================
// Dashboard Types
// =====================
export interface DashboardMetrics {
  activeWorkers: number;
  attendanceRate: number;
  presentCount: number;
  pendingRequests: number;
  lowStockCount: number;
}

export interface ChartData {
  name: string;
  value: number;
}

export interface WarehouseExportFilterState {
  search?: string;
  status?: string;
  warehouse?: string;
  region?: string;
  supervisor?: string;
  category?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  scope?: string;
}

// =====================
// API Response Types
// =====================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =====================
// Form Action Types
// =====================
export interface FormState {
  success: boolean;
  message: string;
}

// =====================
// Manpower Data Type
// =====================

export interface DailyReport {
  id: string;
  date: string;
  region: string;
  shift: string;
  totalWorkers: number;
  presentCount: number;
  absentCount: number;
}

export interface ManpowerData {
  workers: Worker[];
  shifts: Shift[];
  supervisors: User[];
  allAttendance: Attendance[];
  dailyReports?: DailyReport[]; // For the aggregated view
  regions: Region[];
}

export interface Region {
  id: number;
  name: string;
}
