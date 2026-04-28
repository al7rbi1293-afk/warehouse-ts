"use client";

import { useDeferredValue, useState, type ReactNode } from "react";

import { PremiumTable } from "@/components/PremiumTable";
import { WarehouseExportButton } from "@/components/WarehouseExportButton";
import { inferWarehouseType } from "@/lib/warehouse-utils";
import { WarehouseExportFilterState } from "@/types";
import {
  WarehouseKpiBorrowLendRecord,
  WarehouseKpiDataset,
  WarehouseKpiInventoryRecord,
  WarehouseKpiIssueDispatchRecord,
  WarehouseKpiMovementRecord,
  WarehouseKpiRequestRecord,
} from "@/types/warehouse-kpi";

type SectionKey = "requests" | "dispatch" | "borrowLend" | "movements";

type TableColumn<T> = {
  header: string;
  accessorKey?: keyof T;
  render?: (item: T) => ReactNode;
  className?: string;
};

interface SupplyReportFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  warehouseType: string;
  warehouse: string;
  supervisor: string;
  region: string;
  movementType: string;
  status: string;
  loanType: string;
  item: string;
}

interface SummaryCardData {
  title: string;
  value: string;
  helper: string;
}

interface DetailState {
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
}

interface WarehouseKpiClientProps {
  data: WarehouseKpiDataset;
}

const INITIAL_FILTERS: SupplyReportFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  warehouseType: "",
  warehouse: "",
  supervisor: "",
  region: "",
  movementType: "",
  status: "",
  loanType: "",
  item: "",
};

function normalizeValue(value?: string | number | null) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchesSearch(values: Array<string | number | null | undefined>, search: string) {
  const term = normalizeValue(search);
  if (!term) return true;

  return values.some((value) => normalizeValue(value).includes(term));
}

function matchesExact(value: string | null | undefined, filter: string) {
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

function matchesDateRange(value: string | null | undefined, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    if (date < from) return false;
  }

  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    if (date > to) return false;
  }

  return true;
}

function sumBy<T>(rows: T[], selector: (row: T) => number | null | undefined) {
  return rows.reduce((total, row) => total + (selector(row) || 0), 0);
}

function isLowStock(item: WarehouseKpiInventoryRecord) {
  return item.minThreshold > 0 && item.qty <= item.minThreshold;
}

function buildStatusBadge(value?: string | null) {
  const normalized = normalizeValue(value);

  if (!normalized) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
        -
      </span>
    );
  }

  const tone = normalized.includes("received") ||
    normalized.includes("returned") ||
    normalized.includes("closed") ||
    normalized.includes("completed")
      ? "bg-emerald-100 text-emerald-700"
      : normalized.includes("pending") || normalized.includes("open")
        ? "bg-amber-100 text-amber-700"
        : normalized.includes("approved") || normalized.includes("issued")
          ? "bg-blue-100 text-blue-700"
          : normalized.includes("rejected") || normalized.includes("cancel")
            ? "bg-rose-100 text-rose-700"
            : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {value}
    </span>
  );
}

function buildExportFilters(filters: SupplyReportFilters): WarehouseExportFilterState {
  const payload: WarehouseExportFilterState = {
    search: filters.search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseType: filters.warehouseType || undefined,
    warehouse: filters.warehouse || undefined,
    supervisor: filters.supervisor || undefined,
    region: filters.region || undefined,
    movementType: filters.movementType || undefined,
    status: filters.status || undefined,
    loanType: filters.loanType || undefined,
    item: filters.item || undefined,
  };

  return payload;
}

function buildDetailState(
  section: SectionKey,
  row:
    | WarehouseKpiRequestRecord
    | WarehouseKpiIssueDispatchRecord
    | WarehouseKpiBorrowLendRecord
    | WarehouseKpiMovementRecord
): DetailState {
  if (section === "requests") {
    const request = row as WarehouseKpiRequestRecord;

    return {
      title: request.requestNo,
      subtitle: "Request details",
      fields: [
        { label: "Request Number", value: request.requestNo },
        { label: "Bulk Request No.", value: request.requestOperationNo || "-" },
        { label: "Dispatch No.", value: request.dispatchOperationNo || "-" },
        { label: "Item", value: request.itemName || "-" },
        { label: "Item Code", value: request.itemCode || "-" },
        { label: "Category", value: request.category || "-" },
        { label: "Quantity", value: `${request.qty || 0} ${request.unit || ""}`.trim() || "-" },
        { label: "Warehouse", value: request.warehouse || "-" },
        { label: "Warehouse Type", value: request.warehouseType || "-" },
        { label: "Supervisor", value: request.supervisorName || "-" },
        { label: "Region", value: request.region || "-" },
        { label: "Status", value: request.status || "-" },
        { label: "Requested At", value: formatDateTime(request.requestDate) },
        { label: "Approved By", value: request.approvedBy || "-" },
        { label: "Approved At", value: formatDateTime(request.approvedAt) },
        { label: "Issued By", value: request.issuedBy || "-" },
        { label: "Issued At", value: formatDateTime(request.issuedAt) },
        { label: "Received At", value: formatDateTime(request.receivedAt) },
        { label: "Notes", value: request.notes || "-" },
      ],
    };
  }

  if (section === "dispatch") {
    const dispatch = row as WarehouseKpiIssueDispatchRecord;

    return {
      title: dispatch.transactionNo,
      subtitle: "Issue / dispatch details",
      fields: [
        { label: "Transaction Number", value: dispatch.transactionNo },
        { label: "Request Number", value: dispatch.requestNo },
        { label: "Item", value: dispatch.itemName },
        { label: "Item Code", value: dispatch.itemCode || "-" },
        { label: "Quantity", value: `${dispatch.quantity} ${dispatch.unit || ""}`.trim() },
        { label: "Warehouse", value: dispatch.warehouse || "-" },
        { label: "Warehouse Type", value: dispatch.warehouseType || "-" },
        { label: "Supervisor", value: dispatch.supervisorName || "-" },
        { label: "Region", value: dispatch.region || "-" },
        { label: "Issued By", value: dispatch.issuedBy || "-" },
        { label: "Received By", value: dispatch.receivedBy || "-" },
        { label: "Status", value: dispatch.status || "-" },
        { label: "Date", value: formatDateTime(dispatch.date) },
        { label: "Notes", value: dispatch.notes || "-" },
      ],
    };
  }

  if (section === "borrowLend") {
    const borrowLend = row as WarehouseKpiBorrowLendRecord;

    return {
      title: borrowLend.transactionNo,
      subtitle: "Borrow / lend details",
      fields: [
        { label: "Transaction Number", value: borrowLend.transactionNo },
        { label: "Type", value: borrowLend.type },
        { label: "Item", value: borrowLend.itemName },
        { label: "Item Code", value: borrowLend.itemCode || "-" },
        { label: "Category", value: borrowLend.category || "-" },
        { label: "Quantity", value: `${borrowLend.quantity} ${borrowLend.unit || ""}`.trim() },
        { label: "Source", value: borrowLend.source || "-" },
        { label: "Destination", value: borrowLend.destination || "-" },
        { label: "Warehouse Type", value: borrowLend.warehouseType || "-" },
        { label: "Status", value: borrowLend.status || "-" },
        { label: "Date", value: formatDateTime(borrowLend.date) },
        { label: "Expected Return", value: formatDateTime(borrowLend.expectedReturnDate) },
        { label: "Returned At", value: formatDateTime(borrowLend.returnDate) },
        { label: "Notes", value: borrowLend.notes || "-" },
      ],
    };
  }

  const movement = row as WarehouseKpiMovementRecord;

  return {
    title: movement.movementNo,
    subtitle: "Movement history details",
    fields: [
      { label: "Movement Number", value: movement.movementNo },
      { label: "Movement Type", value: movement.movementType },
      { label: "Source Module", value: movement.sourceModule },
      { label: "Item", value: movement.itemName },
      { label: "Item Code", value: movement.itemCode || "-" },
      { label: "Category", value: movement.category || "-" },
      { label: "Quantity", value: `${movement.quantity} ${movement.unit || ""}`.trim() },
      { label: "From", value: movement.from || "-" },
      { label: "To", value: movement.to || "-" },
      { label: "Warehouse Type", value: movement.warehouseType || "-" },
      { label: "Region", value: movement.region || "-" },
      { label: "Supervisor", value: movement.supervisorName || "-" },
      { label: "Related User", value: movement.relatedUser || "-" },
      { label: "Status", value: movement.status || "-" },
      { label: "Date", value: formatDateTime(movement.date) },
      { label: "Notes", value: movement.notes || "-" },
    ],
  };
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryCard({ title, value, helper }: SummaryCardData) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function WarehouseKpiClient({ data }: WarehouseKpiClientProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("requests");
  const [filters, setFilters] = useState<SupplyReportFilters>(INITIAL_FILTERS);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const deferredSearch = useDeferredValue(filters.search);

  const warehouseTypeOptions = Array.from(
    new Set(
      [
        ...data.warehouses.map((warehouse) =>
          inferWarehouseType(warehouse.name, warehouse.type || undefined)
        ),
        ...data.requests.map((request) => request.warehouseType),
        ...data.issueDispatches.map((dispatch) => dispatch.warehouseType),
        ...data.borrowLend.map((record) => record.warehouseType),
        ...data.movements.map((movement) => movement.warehouseType),
      ].filter(Boolean)
    )
  ).sort();

  const warehouseOptions = Array.from(
    new Set(
      [
        ...data.warehouses.map((warehouse) => warehouse.name),
        ...data.requests.map((request) => request.warehouse),
        ...data.issueDispatches.map((dispatch) => dispatch.warehouse),
        ...data.borrowLend.flatMap((record) => [record.source, record.destination]),
        ...data.movements.flatMap((movement) => [movement.from, movement.to]),
      ].filter(Boolean)
    )
  ).sort();

  const supervisorOptions = Array.from(
    new Set(
      [
        ...data.supervisors.map((supervisor) => supervisor.name || supervisor.username),
        ...data.requests.map((request) => request.supervisorName || ""),
        ...data.issueDispatches.map((dispatch) => dispatch.supervisorName || ""),
      ].filter(Boolean)
    )
  ).sort();

  const regionOptions = Array.from(
    new Set(
      [
        ...data.regions.map((region) => region.name),
        ...data.requests.map((request) => request.region || ""),
        ...data.issueDispatches.map((dispatch) => dispatch.region || ""),
        ...data.movements.map((movement) => movement.region || ""),
      ].filter(Boolean)
    )
  ).sort();

  const movementTypeOptions = Array.from(
    new Set(
      [
        "Request",
        "Issue / Dispatch",
        ...data.borrowLend.map((record) => record.type),
        ...data.movements.map((movement) => movement.movementType),
      ].filter(Boolean)
    )
  ).sort();

  const statusOptions = Array.from(
    new Set(
      [
        ...data.requests.map((request) => request.status || ""),
        ...data.issueDispatches.map((dispatch) => dispatch.status || ""),
        ...data.borrowLend.map((record) => record.status || ""),
        ...data.movements.map((movement) => movement.status || ""),
      ].filter(Boolean)
    )
  ).sort();

  const loanTypeOptions = Array.from(
    new Set(data.borrowLend.map((record) => record.type).filter(Boolean))
  ).sort();

  const itemOptions = Array.from(
    new Set(
      [
        ...data.inventory.map((item) => item.nameEn),
        ...data.requests.map((request) => request.itemName || ""),
        ...data.issueDispatches.map((dispatch) => dispatch.itemName),
        ...data.borrowLend.map((record) => record.itemName),
        ...data.movements.map((movement) => movement.itemName),
      ].filter(Boolean)
    )
  ).sort();

  const filteredRequests = data.requests.filter((request) => {
    if (filters.loanType) return false;

    return (
      matchesSearch(
        [
          request.requestNo,
          request.requestOperationNo,
          request.dispatchOperationNo,
          request.itemName,
          request.itemCode,
          request.category,
          request.supervisorName,
          request.region,
          request.warehouse,
          request.notes,
          request.status,
        ],
        deferredSearch
      ) &&
      matchesDateRange(request.requestDate, filters.dateFrom, filters.dateTo) &&
      matchesExact(request.warehouseType, filters.warehouseType) &&
      matchesWarehouse([request.warehouse], filters.warehouse) &&
      matchesExact(request.supervisorName, filters.supervisor) &&
      matchesExact(request.region, filters.region) &&
      matchesLooseValue(request.status, filters.status) &&
      matchesItem(request.itemName, request.itemCode, filters.item) &&
      matchesLooseValue("Request", filters.movementType)
    );
  });

  const filteredDispatches = data.issueDispatches.filter((dispatch) => {
    if (filters.loanType) return false;

    return (
      matchesSearch(
        [
          dispatch.transactionNo,
          dispatch.requestNo,
          dispatch.itemName,
          dispatch.itemCode,
          dispatch.supervisorName,
          dispatch.region,
          dispatch.warehouse,
          dispatch.issuedBy,
          dispatch.receivedBy,
          dispatch.notes,
          dispatch.status,
        ],
        deferredSearch
      ) &&
      matchesDateRange(dispatch.date, filters.dateFrom, filters.dateTo) &&
      matchesExact(dispatch.warehouseType, filters.warehouseType) &&
      matchesWarehouse([dispatch.warehouse], filters.warehouse) &&
      matchesExact(dispatch.supervisorName, filters.supervisor) &&
      matchesExact(dispatch.region, filters.region) &&
      matchesLooseValue(dispatch.status, filters.status) &&
      matchesItem(dispatch.itemName, dispatch.itemCode, filters.item) &&
      matchesLooseValue("Issue / Dispatch", filters.movementType)
    );
  });

  const filteredBorrowLend = data.borrowLend.filter((record) => {
    const regionMatches =
      !filters.region ||
      matchesSearch([record.source, record.destination], filters.region);

    return (
      matchesSearch(
        [
          record.transactionNo,
          record.type,
          record.source,
          record.destination,
          record.itemName,
          record.itemCode,
          record.category,
          record.notes,
          record.status,
        ],
        deferredSearch
      ) &&
      matchesDateRange(record.date, filters.dateFrom, filters.dateTo) &&
      matchesExact(record.warehouseType, filters.warehouseType) &&
      matchesWarehouse([record.source, record.destination], filters.warehouse) &&
      matchesLooseValue(record.type, filters.loanType) &&
      matchesLooseValue(record.type, filters.movementType) &&
      matchesLooseValue(record.status, filters.status) &&
      matchesItem(record.itemName, record.itemCode, filters.item) &&
      regionMatches &&
      (filters.supervisor ? false : true)
    );
  });

  const filteredMovements = data.movements.filter((movement) => {
    const supervisorMatches =
      !filters.supervisor ||
      matchesExact(movement.supervisorName, filters.supervisor) ||
      matchesExact(movement.relatedUser, filters.supervisor);

    const loanTypeMatches = !filters.loanType || matchesLooseValue(movement.movementType, filters.loanType);

    return (
      matchesSearch(
        [
          movement.movementNo,
          movement.movementType,
          movement.sourceModule,
          movement.itemName,
          movement.itemCode,
          movement.category,
          movement.from,
          movement.to,
          movement.relatedUser,
          movement.supervisorName,
          movement.region,
          movement.notes,
          movement.status,
        ],
        deferredSearch
      ) &&
      matchesDateRange(movement.date, filters.dateFrom, filters.dateTo) &&
      matchesExact(movement.warehouseType, filters.warehouseType) &&
      matchesWarehouse([movement.from, movement.to], filters.warehouse) &&
      matchesExact(movement.region, filters.region) &&
      matchesLooseValue(movement.movementType, filters.movementType) &&
      matchesLooseValue(movement.status, filters.status) &&
      matchesItem(movement.itemName, movement.itemCode, filters.item) &&
      supervisorMatches &&
      loanTypeMatches
    );
  });

  const filteredLowStockItems = data.inventory.filter((item) => {
    const warehouseType = inferWarehouseType(item.location);

    return (
      isLowStock(item) &&
      matchesSearch([item.nameEn, item.itemCode, item.category, item.location], deferredSearch) &&
      matchesExact(warehouseType, filters.warehouseType) &&
      matchesWarehouse([item.location], filters.warehouse) &&
      matchesItem(item.nameEn, item.itemCode, filters.item)
    );
  });

  const pendingRequests = filteredRequests.filter((request) =>
    normalizeValue(request.status).includes("pending")
  );
  const receivedRequests = filteredRequests.filter((request) =>
    normalizeValue(request.status).includes("received") || !!request.receivedAt
  );
  const borrowTransactions = filteredBorrowLend.filter((record) =>
    normalizeValue(record.type).includes("borrow")
  );
  const lendTransactions = filteredBorrowLend.filter((record) =>
    normalizeValue(record.type).includes("lend")
  );
  const openRequestCount = filteredRequests.filter((request) => {
    const status = normalizeValue(request.status);
    return status !== "received" && status !== "rejected" && status !== "cancelled";
  }).length;
  const openBorrowLendCount = filteredBorrowLend.filter((record) => {
    const status = normalizeValue(record.status);
    return !status || (!status.includes("returned") && !status.includes("closed") && !status.includes("completed"));
  }).length;

  const summaryCards: SummaryCardData[] = [
    {
      title: "Total Requests",
      value: formatNumber(filteredRequests.length),
      helper: `${formatNumber(sumBy(filteredRequests, (request) => request.qty))} units requested in the current view`,
    },
    {
      title: "Total Issued",
      value: formatNumber(filteredDispatches.length),
      helper: `${formatNumber(sumBy(filteredDispatches, (dispatch) => dispatch.quantity))} units dispatched`,
    },
    {
      title: "Total Received",
      value: formatNumber(receivedRequests.length),
      helper: `${formatNumber(sumBy(receivedRequests, (request) => request.qty))} units confirmed as received`,
    },
    {
      title: "Total Borrow Transactions",
      value: formatNumber(borrowTransactions.length),
      helper: `${formatNumber(sumBy(borrowTransactions, (record) => record.quantity))} units borrowed`,
    },
    {
      title: "Total Lend Transactions",
      value: formatNumber(lendTransactions.length),
      helper: `${formatNumber(sumBy(lendTransactions, (record) => record.quantity))} units lent out`,
    },
    {
      title: "Pending Requests",
      value: formatNumber(pendingRequests.length),
      helper: `${formatNumber(sumBy(pendingRequests, (request) => request.qty))} units still waiting`,
    },
    {
      title: "Open Movements",
      value: formatNumber(openRequestCount + openBorrowLendCount),
      helper: "Requests and borrow/lend records that are still in progress",
    },
    {
      title: "Low Stock Items",
      value: formatNumber(filteredLowStockItems.length),
      helper: "Items at or below the configured minimum threshold",
    },
  ];

  const sectionCounts: Record<SectionKey, number> = {
    requests: filteredRequests.length,
    dispatch: filteredDispatches.length,
    borrowLend: filteredBorrowLend.length,
    movements: filteredMovements.length,
  };

  const requestColumns: TableColumn<WarehouseKpiRequestRecord>[] = [
    { header: "Request Number", render: (request) => request.requestNo },
    { header: "Supervisor", render: (request) => request.supervisorName || "-" },
    { header: "Region", render: (request) => request.region || "-" },
    { header: "Warehouse", render: (request) => request.warehouse || "-" },
    { header: "Date", render: (request) => formatDateTime(request.requestDate) },
    { header: "Status", render: (request) => buildStatusBadge(request.status) },
    {
      header: "Quantity",
      render: (request) => `${formatNumber(request.qty || 0)} ${request.unit || ""}`.trim(),
      className: "whitespace-nowrap",
    },
    { header: "Notes", render: (request) => request.notes || "-" },
  ];

  const dispatchColumns: TableColumn<WarehouseKpiIssueDispatchRecord>[] = [
    { header: "Transaction Number", render: (dispatch) => dispatch.transactionNo },
    { header: "Request Number", render: (dispatch) => dispatch.requestNo },
    { header: "Warehouse", render: (dispatch) => dispatch.warehouse || "-" },
    { header: "Issued By", render: (dispatch) => dispatch.issuedBy || "-" },
    { header: "Received By", render: (dispatch) => dispatch.receivedBy || "-" },
    { header: "Date", render: (dispatch) => formatDateTime(dispatch.date) },
    { header: "Status", render: (dispatch) => buildStatusBadge(dispatch.status) },
    {
      header: "Quantity",
      render: (dispatch) => `${formatNumber(dispatch.quantity)} ${dispatch.unit || ""}`.trim(),
      className: "whitespace-nowrap",
    },
  ];

  const borrowLendColumns: TableColumn<WarehouseKpiBorrowLendRecord>[] = [
    { header: "Transaction Number", render: (record) => record.transactionNo },
    { header: "Type", render: (record) => buildStatusBadge(record.type) },
    { header: "Source", render: (record) => record.source || "-" },
    { header: "Destination", render: (record) => record.destination || "-" },
    { header: "Item", render: (record) => record.itemName },
    {
      header: "Quantity",
      render: (record) => `${formatNumber(record.quantity)} ${record.unit || ""}`.trim(),
      className: "whitespace-nowrap",
    },
    { header: "Date", render: (record) => formatDateTime(record.date) },
    { header: "Status", render: (record) => buildStatusBadge(record.status) },
  ];

  const movementColumns: TableColumn<WarehouseKpiMovementRecord>[] = [
    { header: "Movement Number", render: (movement) => movement.movementNo },
    { header: "Item", render: (movement) => movement.itemName },
    { header: "Movement Type", render: (movement) => buildStatusBadge(movement.movementType) },
    { header: "From", render: (movement) => movement.from || "-" },
    { header: "To", render: (movement) => movement.to || "-" },
    {
      header: "Quantity",
      render: (movement) => `${formatNumber(movement.quantity)} ${movement.unit || ""}`.trim(),
      className: "whitespace-nowrap",
    },
    { header: "Date", render: (movement) => formatDateTime(movement.date) },
    { header: "Related User", render: (movement) => movement.relatedUser || movement.supervisorName || "-" },
    { header: "Notes", render: (movement) => movement.notes || "-" },
  ];

  const currentExportFilters = buildExportFilters(filters);

  const currentSection = {
    requests: {
      title: "Requests",
      description: "Review request history with simple status tracking and warehouse context.",
      count: filteredRequests.length,
      module: "tracking" as const,
      data: filteredRequests,
      columns: requestColumns,
      openDetail: (row: WarehouseKpiRequestRecord) => setDetail(buildDetailState("requests", row)),
      emptyTitle: "No requests match these filters",
      emptyDescription:
        "Try widening the date range or clearing one of the warehouse, supervisor, or status filters.",
    },
    dispatch: {
      title: "Issue / Dispatch",
      description: "Track supply handover records between the warehouse team and the field.",
      count: filteredDispatches.length,
      module: "dispatch" as const,
      data: filteredDispatches,
      columns: dispatchColumns,
      openDetail: (row: WarehouseKpiIssueDispatchRecord) =>
        setDetail(buildDetailState("dispatch", row)),
      emptyTitle: "No dispatch records match these filters",
      emptyDescription:
        "Dispatch records will appear here once items are issued against approved requests.",
    },
    borrowLend: {
      title: "Borrow / Lend",
      description: "See active lending and borrowing transactions in one clean operational list.",
      count: filteredBorrowLend.length,
      module: "borrow-lend" as const,
      data: filteredBorrowLend,
      columns: borrowLendColumns,
      openDetail: (row: WarehouseKpiBorrowLendRecord) =>
        setDetail(buildDetailState("borrowLend", row)),
      emptyTitle: "No borrow or lend records match these filters",
      emptyDescription:
        "Transactions will populate once borrowing or lending activity is recorded in the system.",
    },
    movements: {
      title: "Stock Movement History",
      description: "Combine warehouse bulk actions and stock logs in one readable movement history.",
      count: filteredMovements.length,
      module: "movements" as const,
      data: filteredMovements,
      columns: movementColumns,
      openDetail: (row: WarehouseKpiMovementRecord) =>
        setDetail(buildDetailState("movements", row)),
      emptyTitle: "No movement history matches these filters",
      emptyDescription:
        "Movement rows will appear as transfers, dispatches, lending, borrowing, and stock log entries are recorded.",
    },
  }[activeSection];

  const noOperationalData =
    data.requests.length === 0 &&
    data.issueDispatches.length === 0 &&
    data.borrowLend.length === 0;

  const renderCurrentTable = () => {
    if (currentSection.data.length === 0) {
      return (
        <EmptyState
          title={currentSection.emptyTitle}
          description={currentSection.emptyDescription}
        />
      );
    }

    if (activeSection === "requests") {
      return (
        <PremiumTable
          columns={requestColumns}
          data={filteredRequests}
          actions={(row) => (
            <button
              type="button"
              onClick={() => setDetail(buildDetailState("requests", row))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              View details
            </button>
          )}
        />
      );
    }

    if (activeSection === "dispatch") {
      return (
        <PremiumTable
          columns={dispatchColumns}
          data={filteredDispatches}
          actions={(row) => (
            <button
              type="button"
              onClick={() => setDetail(buildDetailState("dispatch", row))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              View details
            </button>
          )}
        />
      );
    }

    if (activeSection === "borrowLend") {
      return (
        <PremiumTable
          columns={borrowLendColumns}
          data={filteredBorrowLend}
          actions={(row) => (
            <button
              type="button"
              onClick={() => setDetail(buildDetailState("borrowLend", row))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              View details
            </button>
          )}
        />
      );
    }

    return (
      <PremiumTable
        columns={movementColumns}
        data={filteredMovements}
        actions={(row) => (
          <button
            type="button"
            onClick={() => setDetail(buildDetailState("movements", row))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            View details
          </button>
        )}
      />
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/80">
              Supply Reports
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Simple operational reporting for supply activity</h1>
            <p className="text-sm text-slate-300">
              Review requests, dispatches, borrow/lend activity, and movement history without the
              noise of a KPI-heavy dashboard.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            Snapshot updated: <span className="font-medium text-white">{formatDateTime(data.generatedAt)}</span>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
            <p className="text-sm text-slate-500">
              Keep the view focused by date, warehouse, region, supervisor, movement type, status, and item.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters(INITIAL_FILTERS)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Clear Filters
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Search">
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="Search number, item, note, or user"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </FilterField>

          <FilterField label="Item">
            <select
              value={filters.item}
              onChange={(event) =>
                setFilters((current) => ({ ...current, item: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All items</option>
              {itemOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Date From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateFrom: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </FilterField>

          <FilterField label="Date To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateTo: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </FilterField>

          <FilterField label="Warehouse Type">
            <select
              value={filters.warehouseType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, warehouseType: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All warehouse types</option>
              {warehouseTypeOptions.map((warehouseType) => (
                <option key={warehouseType} value={warehouseType}>
                  {warehouseType}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Warehouse Name">
            <select
              value={filters.warehouse}
              onChange={(event) =>
                setFilters((current) => ({ ...current, warehouse: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All warehouses</option>
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Supervisor">
            <select
              value={filters.supervisor}
              onChange={(event) =>
                setFilters((current) => ({ ...current, supervisor: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All supervisors</option>
              {supervisorOptions.map((supervisor) => (
                <option key={supervisor} value={supervisor}>
                  {supervisor}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Region">
            <select
              value={filters.region}
              onChange={(event) =>
                setFilters((current) => ({ ...current, region: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Movement Type">
            <select
              value={filters.movementType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, movementType: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All movement types</option>
              {movementTypeOptions.map((movementType) => (
                <option key={movementType} value={movementType}>
                  {movementType}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Borrow / Lend Type">
            <select
              value={filters.loanType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, loanType: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All borrow / lend types</option>
              {loanTypeOptions.map((loanType) => (
                <option key={loanType} value={loanType}>
                  {loanType}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </section>

      {noOperationalData ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
          Local data currently has no saved requests, dispatches, or borrow/lend transactions. The
          page is live and ready, and it will populate automatically as supply activity is recorded.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.title} {...card} />
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Operational tables</h2>
            <p className="text-sm text-slate-500">
              Switch between the main supply report sections and export exactly what you need.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["requests", "Requests"],
                ["dispatch", "Issue / Dispatch"],
                ["borrowLend", "Borrow / Lend"],
                ["movements", "Movement History"],
              ] as Array<[SectionKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeSection === key
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeSection === key
                      ? "bg-white/15 text-slate-100"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {formatNumber(sectionCounts[key])}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-slate-900">{currentSection.title}</h3>
            <p className="text-sm text-slate-500">{currentSection.description}</p>
            <p className="text-sm font-medium text-slate-700">
              {formatNumber(currentSection.count)} records in the current view
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <WarehouseExportButton
              module={currentSection.module}
              filters={currentExportFilters}
              label="Export Current View"
            />
            <WarehouseExportButton
              module={currentSection.module}
              label="Export All"
              className="bg-slate-700 hover:bg-slate-800"
            />
          </div>
        </div>

        <div className="mt-5">{renderCurrentTable()}</div>
      </section>

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {detail.subtitle}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{detail.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                aria-label="Close detail panel"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {detail.fields.map((field) => (
                  <div
                    key={`${detail.title}-${field.label}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {field.label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{field.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
