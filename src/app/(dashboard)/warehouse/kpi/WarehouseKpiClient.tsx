"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PremiumTable } from "@/components/PremiumTable";
import { ChartPanel } from "@/components/warehouse-kpi/ChartPanel";
import { KpiCard } from "@/components/warehouse-kpi/KpiCard";
import { TablePanel } from "@/components/warehouse-kpi/TablePanel";
import {
  WarehouseKpiDataset,
  WarehouseKpiInventoryRecord,
  WarehouseKpiLoanRecord,
  WarehouseKpiRequestRecord,
  WarehouseKpiScope,
  WarehouseKpiWarehouseType,
} from "@/types/warehouse-kpi";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const STALLED_REQUEST_DAYS = 3;
const CHART_COLORS = [
  "#2563EB",
  "#0F766E",
  "#D97706",
  "#DC2626",
  "#475569",
  "#7C3AED",
];

const DashboardIcons = {
  Request: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  ),
  Pending: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Approved: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Rejected: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" x2="9" y1="9" y2="15" />
      <line x1="9" x2="15" y1="9" y2="15" />
    </svg>
  ),
  Issue: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  Receive: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  ),
  Clock: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Stock: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    </svg>
  ),
  Alert: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  ),
  Loan: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="M16 17h6" />
      <path d="m19 14 3 3-3 3" />
      <path d="M9 7h4" />
      <path d="M9 11h4" />
    </svg>
  ),
};

type DatePreset = "last7" | "last30" | "last90" | "custom";
type ChartGranularity = "daily" | "weekly" | "monthly";
type TableFocus =
  | "pending"
  | "storekeeper"
  | "stock"
  | "supervisors"
  | "loans";

interface WarehouseKpiClientProps {
  data: WarehouseKpiDataset;
}

interface DateRange {
  start: Date;
  end: Date;
}

interface TrendSummary {
  label?: string;
  direction?: "up" | "down" | "stable";
}

function parseDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function createDateAtStart(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function createDateAtEnd(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveDateRange(
  preset: DatePreset,
  customStartDate: string,
  customEndDate: string
): DateRange {
  const today = createDateAtEnd(new Date());

  if (preset === "custom") {
    const customStart = customStartDate
      ? createDateAtStart(new Date(customStartDate))
      : createDateAtStart(new Date(today.getTime() - 29 * DAY_IN_MS));
    const customEnd = customEndDate
      ? createDateAtEnd(new Date(customEndDate))
      : today;

    return {
      start: customStart,
      end: customEnd < customStart ? createDateAtEnd(customStart) : customEnd,
    };
  }

  const lookbackDays =
    preset === "last7" ? 6 : preset === "last30" ? 29 : 89;

  return {
    start: createDateAtStart(new Date(today.getTime() - lookbackDays * DAY_IN_MS)),
    end: today,
  };
}

function buildPreviousRange(range: DateRange) {
  const windowSize = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / DAY_IN_MS) + 1
  );

  const previousEnd = createDateAtEnd(new Date(range.start.getTime() - DAY_IN_MS));
  const previousStart = createDateAtStart(
    new Date(previousEnd.getTime() - (windowSize - 1) * DAY_IN_MS)
  );

  return { start: previousStart, end: previousEnd };
}

function isDateWithinRange(dateValue: string | null, range: DateRange) {
  const date = parseDate(dateValue);

  if (!date) {
    return false;
  }

  return date >= range.start && date <= range.end;
}

function matchesText(value: string | null | undefined, search: string) {
  if (!search) {
    return true;
  }

  return (value || "").toLowerCase().includes(search.toLowerCase());
}

function formatDuration(ms: number | null) {
  if (ms === null || Number.isNaN(ms)) {
    return "-";
  }

  const days = ms / DAY_IN_MS;

  if (days >= 1) {
    return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
  }

  const hours = ms / (60 * 60 * 1000);

  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function getRequestFulfillmentWarehouse() {
  return "NSTC";
}

function getRequestWaitingOn(status: string | null) {
  switch (status) {
    case "Pending":
      return "Admin Review";
    case "Approved":
      return "Storekeeper Issue";
    case "Issued":
      return "Supervisor Receipt";
    case "Rejected":
      return "Supervisor Resubmission";
    case "Received":
      return "Completed";
    default:
      return "Unassigned";
  }
}

function getRequestStageDate(request: WarehouseKpiRequestRecord) {
  if (request.status === "Issued" && request.issuedAt) {
    return request.issuedAt;
  }

  if (request.status === "Approved" && (request.approvedAt || request.reviewedAt)) {
    return request.approvedAt || request.reviewedAt;
  }

  if (request.status === "Rejected" && request.reviewedAt) {
    return request.reviewedAt;
  }

  return request.requestDate;
}

function getAgeInDays(dateValue: string | null) {
  const date = parseDate(dateValue);

  if (!date) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_IN_MS));
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function getInventoryWarehouseType(location: string): WarehouseKpiWarehouseType {
  return location === "CWW" ? "central" : "main";
}

function getInventoryScope(location: string): WarehouseKpiScope {
  return location === "CWW" ? "central" : "external";
}

function buildTrendSummary(current: number, previous: number): TrendSummary {
  if (previous === 0 && current === 0) {
    return {};
  }

  if (previous === 0) {
    return { label: "vs previous period", direction: "up" };
  }

  const diff = current - previous;

  if (diff === 0) {
    return { label: "vs previous period", direction: "stable" };
  }

  return {
    label: `${Math.abs(Math.round((diff / previous) * 100))}% vs previous period`,
    direction: diff > 0 ? "up" : "down",
  };
}

function buildAverageTrendSummary(
  currentMs: number | null,
  previousMs: number | null
): TrendSummary {
  if (currentMs === null || previousMs === null) {
    return {};
  }

  if (currentMs === previousMs) {
    return { label: "vs previous period", direction: "stable" };
  }

  return {
    label: "vs previous period",
    direction: currentMs > previousMs ? "up" : "down",
  };
}

function getCycleTimeMs(request: WarehouseKpiRequestRecord) {
  const start = parseDate(request.requestDate);
  const end = parseDate(request.receivedAt);

  if (!start || !end) {
    return null;
  }

  return end.getTime() - start.getTime();
}

function getApprovalTimeMs(request: WarehouseKpiRequestRecord) {
  const start = parseDate(request.requestDate);
  const end = parseDate(request.reviewedAt || request.approvedAt);

  if (!start || !end) {
    return null;
  }

  return end.getTime() - start.getTime();
}

function getFulfillmentTimeMs(request: WarehouseKpiRequestRecord) {
  const start = parseDate(request.approvedAt || request.reviewedAt);
  const end = parseDate(request.issuedAt);

  if (!start || !end) {
    return null;
  }

  return end.getTime() - start.getTime();
}

function getReceiptTimeMs(request: WarehouseKpiRequestRecord) {
  const start = parseDate(request.issuedAt);
  const end = parseDate(request.receivedAt);

  if (!start || !end) {
    return null;
  }

  return end.getTime() - start.getTime();
}

function average(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => value !== null);

  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function getRequestBucketKey(dateValue: string, granularity: ChartGranularity) {
  const date = new Date(dateValue);

  if (granularity === "monthly") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  if (granularity === "weekly") {
    const monday = new Date(date);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatBucketLabel(bucket: string, granularity: ChartGranularity) {
  if (granularity === "monthly") {
    const [year, month] = bucket.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
      undefined,
      { month: "short", year: "numeric" }
    );
  }

  if (granularity === "weekly") {
    return `Week of ${new Date(bucket).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }

  return new Date(bucket).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getStockSuggestedAction(
  item: WarehouseKpiInventoryRecord,
  inventory: WarehouseKpiInventoryRecord[]
) {
  const alternateLocation = inventory.find(
    (candidate) =>
      candidate.nameEn === item.nameEn &&
      candidate.location !== item.location &&
      candidate.qty > candidate.minThreshold
  );

  if (alternateLocation) {
    return `Transfer from ${alternateLocation.location}`;
  }

  if (item.location === "CWW") {
    return "Review central warehouse stocking model";
  }

  return "Rebalance stock from main warehouse";
}

function buildLoanMovement(
  loans: WarehouseKpiLoanRecord[],
  stockLogs: WarehouseKpiDataset["stockLogs"],
  range: DateRange
) {
  const filteredLogs = stockLogs.filter(
    (log) =>
      isDateWithinRange(log.logDate, range) &&
      (log.actionType?.includes("Lent") || log.actionType?.includes("Returned"))
  );

  const openLoans = loans.filter(
    (loan) => loan.quantity > 0 && ["Open", "Active"].includes(loan.status)
  );
  const closedLoans = loans.filter(
    (loan) => loan.quantity === 0 || !["Open", "Active"].includes(loan.status)
  );

  const outgoingQty = filteredLogs
    .filter((log) => log.actionType?.includes("Lent"))
    .reduce((sum, log) => sum + Math.abs(log.changeAmount || 0), 0);
  const incomingQty = filteredLogs
    .filter((log) => log.actionType?.includes("Returned"))
    .reduce((sum, log) => sum + Math.abs(log.changeAmount || 0), 0);
  const pendingQty = openLoans.reduce((sum, loan) => sum + loan.quantity, 0);

  return [
    { name: "Open", value: openLoans.length },
    { name: "Closed", value: closedLoans.length },
    { name: "Outgoing Qty", value: outgoingQty },
    { name: "Incoming Qty", value: incomingQty },
    { name: "Pending Qty", value: pendingQty },
  ];
}

function getInitialStartDate() {
  return formatDateInput(createDateAtStart(new Date(Date.now() - 29 * DAY_IN_MS)));
}

function getInitialEndDate() {
  return formatDateInput(new Date());
}

export function WarehouseKpiClient({ data }: WarehouseKpiClientProps) {
  const [datePreset, setDatePreset] = useState<DatePreset>("last30");
  const [customStartDate, setCustomStartDate] = useState(getInitialStartDate);
  const [customEndDate, setCustomEndDate] = useState(getInitialEndDate);
  const [regionFilter, setRegionFilter] = useState("all");
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [warehouseTypeFilter, setWarehouseTypeFilter] =
    useState<WarehouseKpiWarehouseType>("all");
  const [warehouseNameFilter, setWarehouseNameFilter] = useState("all");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [itemSearch, setItemSearch] = useState("");
  const [borrowLendTypeFilter, setBorrowLendTypeFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<WarehouseKpiScope>("all");
  const [chartGranularity, setChartGranularity] =
    useState<ChartGranularity>("weekly");
  const [focusedTable, setFocusedTable] = useState<TableFocus>("pending");

  const deferredItemSearch = useDeferredValue(itemSearch.trim());
  const range = resolveDateRange(datePreset, customStartDate, customEndDate);
  const previousRange = buildPreviousRange(range);

  const pendingTableRef = useRef<HTMLDivElement>(null);
  const storekeeperTableRef = useRef<HTMLDivElement>(null);
  const stockTableRef = useRef<HTMLDivElement>(null);
  const supervisorTableRef = useRef<HTMLDivElement>(null);
  const loanTableRef = useRef<HTMLDivElement>(null);

  const scrollToTable = (table: TableFocus) => {
    setFocusedTable(table);

    const tableMap = {
      pending: pendingTableRef,
      storekeeper: storekeeperTableRef,
      stock: stockTableRef,
      supervisors: supervisorTableRef,
      loans: loanTableRef,
    };

    window.setTimeout(() => {
      tableMap[table].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const applyRequestDrillDown = (status: string, table: TableFocus) => {
    startTransition(() => {
      setRequestStatusFilter(status);
      scrollToTable(table);
    });
  };

  const visibleRequests = data.requests.filter((request) => {
    if (!isDateWithinRange(request.requestDate, range)) {
      return false;
    }

    if (regionFilter !== "all" && request.region !== regionFilter) {
      return false;
    }

    if (supervisorFilter !== "all" && request.supervisorName !== supervisorFilter) {
      return false;
    }

    if (requestStatusFilter !== "all" && request.status !== requestStatusFilter) {
      return false;
    }

    if (
      deferredItemSearch &&
      !matchesText(request.itemName, deferredItemSearch) &&
      !matchesText(request.category, deferredItemSearch) &&
      !matchesText(request.notes, deferredItemSearch)
    ) {
      return false;
    }

    return true;
  });

  const previousPeriodRequests = data.requests.filter((request) => {
    if (!isDateWithinRange(request.requestDate, previousRange)) {
      return false;
    }

    if (regionFilter !== "all" && request.region !== regionFilter) {
      return false;
    }

    if (supervisorFilter !== "all" && request.supervisorName !== supervisorFilter) {
      return false;
    }

    if (
      deferredItemSearch &&
      !matchesText(request.itemName, deferredItemSearch) &&
      !matchesText(request.category, deferredItemSearch) &&
      !matchesText(request.notes, deferredItemSearch)
    ) {
      return false;
    }

    return true;
  });

  const visibleInventory = data.inventory.filter((item) => {
    const warehouseType = getInventoryWarehouseType(item.location);
    const scope = getInventoryScope(item.location);

    if (warehouseTypeFilter !== "all" && warehouseType !== warehouseTypeFilter) {
      return false;
    }

    if (scopeFilter !== "all" && scope !== scopeFilter) {
      return false;
    }

    if (warehouseNameFilter !== "all" && item.location !== warehouseNameFilter) {
      return false;
    }

    if (
      deferredItemSearch &&
      !matchesText(item.nameEn, deferredItemSearch) &&
      !matchesText(item.category, deferredItemSearch)
    ) {
      return false;
    }

    return true;
  });

  const visibleLocalInventory = data.localInventory.filter((item) => {
    if (warehouseTypeFilter !== "all" && warehouseTypeFilter !== "regional") {
      return false;
    }

    if (scopeFilter !== "all" && scopeFilter !== "internal") {
      return false;
    }

    if (regionFilter !== "all" && item.region !== regionFilter) {
      return false;
    }

    if (
      deferredItemSearch &&
      !matchesText(item.itemName, deferredItemSearch) &&
      !matchesText(item.region, deferredItemSearch)
    ) {
      return false;
    }

    return true;
  });

  const visibleLoans = data.loans.filter((loan) => {
    if (borrowLendTypeFilter !== "all" && loan.type !== borrowLendTypeFilter) {
      return false;
    }

    if (warehouseNameFilter !== "all" && loan.sourceWarehouse !== warehouseNameFilter) {
      return false;
    }

    if (scopeFilter === "central" && loan.sourceWarehouse !== "CWW") {
      return false;
    }

    if (
      deferredItemSearch &&
      !matchesText(loan.itemName, deferredItemSearch) &&
      !matchesText(loan.project, deferredItemSearch)
    ) {
      return false;
    }

    return true;
  });

  const visibleSupervisorRows = data.supervisors.filter((supervisor) => {
    if (supervisorFilter !== "all" && supervisor.name !== supervisorFilter) {
      return false;
    }

    if (regionFilter !== "all" && !supervisor.assignedRegions.includes(regionFilter)) {
      return false;
    }

    return true;
  });

  const previousInventory = data.inventory.filter((item) => {
    const warehouseType = getInventoryWarehouseType(item.location);
    const scope = getInventoryScope(item.location);

    if (warehouseTypeFilter !== "all" && warehouseType !== warehouseTypeFilter) {
      return false;
    }

    if (scopeFilter !== "all" && scope !== scopeFilter) {
      return false;
    }

    if (warehouseNameFilter !== "all" && item.location !== warehouseNameFilter) {
      return false;
    }

    return true;
  });

  const currentTotalRequests = visibleRequests.length;
  const previousTotalRequests = previousPeriodRequests.length;
  const currentPending = visibleRequests.filter((request) => request.status === "Pending");
  const currentApproved = visibleRequests.filter(
    (request) => request.status === "Approved"
  );
  const currentRejected = visibleRequests.filter(
    (request) => request.status === "Rejected"
  );
  const currentIssued = visibleRequests.filter((request) => request.status === "Issued");
  const currentReceived = visibleRequests.filter(
    (request) => request.status === "Received"
  );
  const openRequests = visibleRequests.filter(
    (request) => request.status !== "Received"
  );

  const previousPending = previousPeriodRequests.filter(
    (request) => request.status === "Pending"
  ).length;
  const previousApproved = previousPeriodRequests.filter(
    (request) => request.status === "Approved"
  ).length;
  const previousRejected = previousPeriodRequests.filter(
    (request) => request.status === "Rejected"
  ).length;
  const previousIssued = previousPeriodRequests.filter(
    (request) => request.status === "Issued"
  ).length;
  const previousReceived = previousPeriodRequests.filter(
    (request) => request.status === "Received"
  ).length;

  const averageCycleMs = average(visibleRequests.map(getCycleTimeMs));
  const previousAverageCycleMs = average(previousPeriodRequests.map(getCycleTimeMs));
  const averageApprovalMs = average(visibleRequests.map(getApprovalTimeMs));
  const previousAverageApprovalMs = average(
    previousPeriodRequests.map(getApprovalTimeMs)
  );
  const averageFulfillmentMs = average(visibleRequests.map(getFulfillmentTimeMs));
  const previousAverageFulfillmentMs = average(
    previousPeriodRequests.map(getFulfillmentTimeMs)
  );
  const averageReceiptMs = average(visibleRequests.map(getReceiptTimeMs));
  const previousAverageReceiptMs = average(
    previousPeriodRequests.map(getReceiptTimeMs)
  );

  const externalInventory = visibleInventory.filter(
    (item) => getInventoryScope(item.location) === "external"
  );
  const centralInventory = visibleInventory.filter(
    (item) => getInventoryScope(item.location) === "central"
  );
  const lowStockItems = visibleInventory.filter(
    (item) => item.qty > 0 && item.qty <= item.minThreshold
  );
  const outOfStockItems = visibleInventory.filter((item) => item.qty === 0);

  const currentBorrowOpen = visibleLoans.filter(
    (loan) =>
      loan.type === "Borrow" &&
      loan.quantity > 0 &&
      ["Open", "Active"].includes(loan.status)
  ).length;
  const currentLendOpen = visibleLoans.filter(
    (loan) =>
      loan.type === "Lend" && loan.quantity > 0 && ["Open", "Active"].includes(loan.status)
  ).length;

  const requestTrend = Array.from(
    visibleRequests.reduce(
      (accumulator, request) => {
        const events = [
          ["created", request.requestDate],
          ["approved", request.approvedAt || request.reviewedAt],
          ["issued", request.issuedAt],
          ["received", request.receivedAt],
        ] as const;

        for (const [eventName, eventDate] of events) {
          if (!eventDate || !isDateWithinRange(eventDate, range)) {
            continue;
          }

          const bucket = getRequestBucketKey(eventDate, chartGranularity);
          const current =
            accumulator.get(bucket) ||
            ({ bucket, created: 0, approved: 0, issued: 0, received: 0 } as {
              bucket: string;
              created: number;
              approved: number;
              issued: number;
              received: number;
            });

          current[eventName] += 1;
          accumulator.set(bucket, current);
        }

        return accumulator;
      },
      new Map<
        string,
        {
          bucket: string;
          created: number;
          approved: number;
          issued: number;
          received: number;
        }
      >()
    ).values()
  )
    .sort((left, right) => left.bucket.localeCompare(right.bucket))
    .map((item) => ({
      name: formatBucketLabel(item.bucket, chartGranularity),
      created: item.created,
      approved: item.approved,
      issued: item.issued,
      received: item.received,
    }));

  const stalledRequests = openRequests.filter(
    (request) => getAgeInDays(getRequestStageDate(request)) >= STALLED_REQUEST_DAYS
  );
  const statusDistribution = [
    { name: "Pending", value: currentPending.length },
    { name: "Approved", value: currentApproved.length },
    { name: "Rejected", value: currentRejected.length },
    { name: "Issued", value: currentIssued.length },
    { name: "Received", value: currentReceived.length },
    { name: "Stalled", value: stalledRequests.length },
  ].filter((item) => item.value > 0);

  const stockOverview = [
    {
      name: "Internal / Local",
      quantity: visibleLocalInventory.reduce((sum, item) => sum + (item.qty || 0), 0),
      lowStock: 0,
      outOfStock: visibleLocalInventory.filter((item) => (item.qty || 0) === 0).length,
    },
    {
      name: "External / Main",
      quantity: externalInventory.reduce((sum, item) => sum + item.qty, 0),
      lowStock: externalInventory.filter(
        (item) => item.qty > 0 && item.qty <= item.minThreshold
      ).length,
      outOfStock: externalInventory.filter((item) => item.qty === 0).length,
    },
    {
      name: "Central",
      quantity: centralInventory.reduce((sum, item) => sum + item.qty, 0),
      lowStock: centralInventory.filter(
        (item) => item.qty > 0 && item.qty <= item.minThreshold
      ).length,
      outOfStock: centralInventory.filter((item) => item.qty === 0).length,
    },
  ];

  const regionPerformance = data.regions
    .map((region) => {
      const regionRequests = visibleRequests.filter((request) => request.region === region.name);
      const completed = regionRequests.filter((request) => request.status === "Received").length;
      const delayed = regionRequests.filter(
        (request) => getAgeInDays(getRequestStageDate(request)) >= STALLED_REQUEST_DAYS
      ).length;

      return {
        name: region.name,
        requests: regionRequests.length,
        completionRate: safePercent(completed, regionRequests.length),
        delayRate: safePercent(delayed, regionRequests.length),
      };
    })
    .filter((region) => region.requests > 0 || regionFilter === region.name)
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 10);

  const supervisorPerformance = visibleSupervisorRows.map((supervisor) => {
    const supervisorRequests = visibleRequests.filter(
      (request) => request.supervisorName === supervisor.name
    );
    const approved = supervisorRequests.filter((request) => request.status === "Approved").length;
    const rejected = supervisorRequests.filter((request) => request.status === "Rejected").length;
    const issued = supervisorRequests.filter((request) => request.status === "Issued").length;
    const received = supervisorRequests.filter((request) => request.status === "Received").length;
    const avgCycleTime = average(supervisorRequests.map(getCycleTimeMs));

    return {
      name: supervisor.name || supervisor.username,
      region: supervisor.assignedRegions.join(", ") || "-",
      totalRequests: supervisorRequests.length,
      approved,
      rejected,
      issued,
      received,
      avgCycleMs: avgCycleTime,
      completionRate: safePercent(received, supervisorRequests.length),
    };
  });

  const supervisorPerformanceChart = supervisorPerformance
    .filter((row) => row.totalRequests > 0)
    .sort((left, right) => right.totalRequests - left.totalRequests)
    .slice(0, 8)
    .map((row) => ({
      name: row.name,
      submitted: row.totalRequests,
      approved: row.approved,
      rejected: row.rejected,
      received: row.received,
      cycleDays: row.avgCycleMs ? Number((row.avgCycleMs / DAY_IN_MS).toFixed(1)) : 0,
    }));

  const loanMovement = buildLoanMovement(visibleLoans, data.stockLogs, range);

  const pendingActionRows = openRequests
    .map((request) => ({
      request,
      requestNumber: `REQ-${request.reqId}`,
      ageDays: getAgeInDays(getRequestStageDate(request)),
      waitingOn: getRequestWaitingOn(request.status),
    }))
    .sort((left, right) => right.ageDays - left.ageDays);

  const storekeeperQueueRows = currentApproved
    .map((request) => {
      const approvedDate = request.approvedAt || request.reviewedAt;
      const pendingDays = getAgeInDays(approvedDate);

      return {
        request,
        requestNumber: `REQ-${request.reqId}`,
        approvedDate,
        pendingDays,
        slaStatus: pendingDays >= STALLED_REQUEST_DAYS ? "Overdue" : "On Track",
      };
    })
    .sort((left, right) => right.pendingDays - left.pendingDays);

  const lowStockRows = [...visibleInventory]
    .filter((item) => item.qty <= item.minThreshold)
    .sort((left, right) => left.qty - right.qty)
    .map((item) => ({
      ...item,
      stockStatus:
        item.qty === 0 ? "Out of Stock" : item.qty <= item.minThreshold ? "Low" : "Healthy",
      suggestedAction: getStockSuggestedAction(item, previousInventory),
    }));

  const openLoanRows = visibleLoans
    .filter((loan) => loan.quantity > 0 && ["Open", "Active"].includes(loan.status))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .map((loan) => ({
      ...loan,
      openDays: getAgeInDays(loan.date),
    }));

  const pendingRegionInsight = currentPending
    .reduce(
      (accumulator, request) => {
        const key = request.region || "Unassigned";
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
      },
      {} as Record<string, number>
    );
  const highestPendingRegion = Object.entries(pendingRegionInsight).sort(
    (left, right) => right[1] - left[1]
  )[0];

  const rejectedBySupervisor = currentRejected.reduce(
    (accumulator, request) => {
      const key = request.supervisorName || "Unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    },
    {} as Record<string, number>
  );
  const highestRejectedSupervisor = Object.entries(rejectedBySupervisor).sort(
    (left, right) => right[1] - left[1]
  )[0];

  const issueByWarehouse = data.stockLogs
    .filter(
      (log) =>
        isDateWithinRange(log.logDate, range) && log.actionType?.startsWith("Issued")
    )
    .reduce(
      (accumulator, log) => {
        const key = log.location || "Unknown";
        accumulator[key] = (accumulator[key] || 0) + Math.abs(log.changeAmount || 0);
        return accumulator;
      },
      {} as Record<string, number>
    );
  const highestIssueWarehouse = Object.entries(issueByWarehouse).sort(
    (left, right) => right[1] - left[1]
  )[0];

  const warehouseLowStock = lowStockRows.reduce(
    (accumulator, item) => {
      accumulator[item.location] = (accumulator[item.location] || 0) + 1;
      return accumulator;
    },
    {} as Record<string, number>
  );
  const highestRiskWarehouse = Object.entries(warehouseLowStock).sort(
    (left, right) => right[1] - left[1]
  )[0];

  const localStockByRegion = visibleLocalInventory.reduce(
    (accumulator, item) => {
      accumulator[item.region] = (accumulator[item.region] || 0) + (item.qty || 0);
      return accumulator;
    },
    {} as Record<string, number>
  );
  const lowestRegionalStock = Object.entries(localStockByRegion).sort(
    (left, right) => left[1] - right[1]
  )[0];

  const insightItems = [
    highestPendingRegion
      ? {
          title: "Highest Pending Region",
          body: `${highestPendingRegion[0]} has ${highestPendingRegion[1]} requests waiting for admin review.`,
        }
      : {
          title: "Highest Pending Region",
          body: "No pending admin approvals in the selected request window.",
        },
    highestRejectedSupervisor
      ? {
          title: "Most Rejected Supervisor",
          body: `${highestRejectedSupervisor[0]} has ${highestRejectedSupervisor[1]} returned requests.`,
        }
      : {
          title: "Most Rejected Supervisor",
          body: "No returned requests in the selected request window.",
        },
    highestIssueWarehouse
      ? {
          title: "Top Issue Warehouse",
          body: `${highestIssueWarehouse[0]} processed ${highestIssueWarehouse[1]} issued units in the selected period.`,
        }
      : {
          title: "Top Issue Warehouse",
          body: "No issue movement has been logged in the selected period.",
        },
    pendingActionRows[0]
      ? {
          title: "Oldest Open Request",
          body: `${pendingActionRows[0].requestNumber} has been waiting ${pendingActionRows[0].ageDays} days on ${pendingActionRows[0].waitingOn}.`,
        }
      : {
          title: "Oldest Open Request",
          body: "No open requests are currently waiting in the workflow.",
        },
    highestRiskWarehouse
      ? {
          title: "Highest Stock Risk",
          body: `${highestRiskWarehouse[0]} has ${highestRiskWarehouse[1]} low-stock items needing rebalance.`,
        }
      : {
          title: "Highest Stock Risk",
          body: "No low-stock alerts are active for the current stock filters.",
        },
    openLoanRows.length
      ? {
          title: "Borrow / Lend Imbalance",
          body: `${openLoanRows.length} open transactions are still unsettled, totaling ${openLoanRows.reduce(
            (sum, loan) => sum + loan.quantity,
            0
          )} units.`,
        }
      : {
          title: "Borrow / Lend Imbalance",
          body: "No open borrow or lend transactions are currently outstanding.",
        },
    centralInventory.length
      ? {
          title: "Central Warehouse Pressure",
          body: `CWW currently tracks ${centralInventory.reduce(
            (sum, item) => sum + item.qty,
            0
          )} units across ${centralInventory.length} items.`,
        }
      : {
          title: "Central Warehouse Pressure",
          body: "CWW is configured as a warehouse, but no central stock snapshots are stored yet.",
        },
    lowestRegionalStock
      ? {
          title: "Regional Replenishment Focus",
          body: `${lowestRegionalStock[0]} has the lowest visible local stock balance at ${lowestRegionalStock[1]} units.`,
        }
      : {
          title: "Regional Replenishment Focus",
          body: "No local stocktake records have been submitted yet.",
        },
  ];

  const totalRequestsTrend = buildTrendSummary(
    currentTotalRequests,
    previousTotalRequests
  );
  const pendingTrend = buildTrendSummary(currentPending.length, previousPending);
  const approvedTrend = buildTrendSummary(currentApproved.length, previousApproved);
  const rejectedTrend = buildTrendSummary(currentRejected.length, previousRejected);
  const issuedTrend = buildTrendSummary(currentIssued.length, previousIssued);
  const receivedTrend = buildTrendSummary(currentReceived.length, previousReceived);
  const cycleTrend = buildAverageTrendSummary(averageCycleMs, previousAverageCycleMs);
  const approvalTrend = buildAverageTrendSummary(
    averageApprovalMs,
    previousAverageApprovalMs
  );
  const fulfillmentTrend = buildAverageTrendSummary(
    averageFulfillmentMs,
    previousAverageFulfillmentMs
  );
  const receiptTrend = buildAverageTrendSummary(
    averageReceiptMs,
    previousAverageReceiptMs
  );

  return (
    <div className="space-y-8 pb-12">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
            Warehouse KPI Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Executive view of stock flow, request health, and warehouse bottlenecks
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-500">
            The current implementation models the workflow as Pending, Approved,
            Issued, and Received. Rejected requests are the existing returned-to-supervisor
            path, regional stock is stored in local inventory, and CWW is configured as the
            central warehouse but is not yet stock-tracked in this dataset.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Last refresh
            </p>
            <p className="text-sm font-medium text-slate-700">
              {new Date(data.generatedAt).toLocaleString()}
            </p>
          </div>
          <Link
            href="/warehouse"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Back to Operations
          </Link>
        </div>
      </section>

      <section className="card-premium p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Filters</h2>
            <p className="text-sm text-slate-500">
              All KPI cards, charts, and tables react to the relevant filters below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDatePreset("last30");
              setCustomStartDate(getInitialStartDate());
              setCustomEndDate(getInitialEndDate());
              setRegionFilter("all");
              setSupervisorFilter("all");
              setWarehouseTypeFilter("all");
              setWarehouseNameFilter("all");
              setRequestStatusFilter("all");
              setItemSearch("");
              setBorrowLendTypeFilter("all");
              setScopeFilter("all");
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Date Range</span>
            <select
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value as DatePreset)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="last90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Region</span>
            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All regions</option>
              {data.regions.map((region) => (
                <option key={region.id} value={region.name}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Supervisor</span>
            <select
              value={supervisorFilter}
              onChange={(event) => setSupervisorFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All supervisors</option>
              {data.supervisors.map((supervisor) => (
                <option
                  key={supervisor.id}
                  value={supervisor.name || supervisor.username}
                >
                  {supervisor.name || supervisor.username}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Warehouse Type</span>
            <select
              value={warehouseTypeFilter}
              onChange={(event) =>
                setWarehouseTypeFilter(
                  event.target.value as WarehouseKpiWarehouseType
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All warehouse types</option>
              <option value="main">Main warehouses</option>
              <option value="regional">Regional / local stock</option>
              <option value="central">Central warehouse</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Warehouse Name</span>
            <select
              value={warehouseNameFilter}
              onChange={(event) => setWarehouseNameFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All warehouse names</option>
              {data.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.name}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Request Status</span>
            <select
              value={requestStatusFilter}
              onChange={(event) => setRequestStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All request statuses</option>
              {["Pending", "Approved", "Rejected", "Issued", "Received"].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Item / Category</span>
            <input
              type="text"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Search item, category, or notes"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Borrow / Lend Type</span>
            <select
              value={borrowLendTypeFilter}
              onChange={(event) => setBorrowLendTypeFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All types</option>
              <option value="Borrow">Borrow</option>
              <option value="Lend">Lend</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-600">Stock Scope</span>
            <select
              value={scopeFilter}
              onChange={(event) =>
                setScopeFilter(event.target.value as WarehouseKpiScope)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All scopes</option>
              <option value="internal">Internal / local stock</option>
              <option value="external">External / main warehouse stock</option>
              <option value="central">Central warehouse</option>
            </select>
          </label>
        </div>

        {datePreset === "custom" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-600">Custom Start</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-600">Custom End</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Section A - Top KPI Cards</h2>
            <p className="text-sm text-slate-500">
              Request flow metrics respect the selected date window. Stock metrics show the
              current filtered snapshot.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total Requests"
            value={currentTotalRequests}
            supportText="All requests created in the selected period."
            icon={DashboardIcons.Request}
            tone="blue"
            trendLabel={totalRequestsTrend.label}
            trendDirection={totalRequestsTrend.direction}
            onClick={() => {
              setRequestStatusFilter("all");
              scrollToTable("pending");
            }}
          />
          <KpiCard
            title="Pending Admin Approval"
            value={currentPending.length}
            supportText="Waiting for manager review."
            icon={DashboardIcons.Pending}
            tone="amber"
            trendLabel={pendingTrend.label}
            trendDirection={pendingTrend.direction}
            onClick={() => applyRequestDrillDown("Pending", "pending")}
          />
          <KpiCard
            title="Approved Requests"
            value={currentApproved.length}
            supportText="Approved and ready for fulfillment."
            icon={DashboardIcons.Approved}
            tone="green"
            trendLabel={approvedTrend.label}
            trendDirection={approvedTrend.direction}
            onClick={() => applyRequestDrillDown("Approved", "storekeeper")}
          />
          <KpiCard
            title="Rejected Requests"
            value={currentRejected.length}
            supportText="Rejected during review in the selected period."
            icon={DashboardIcons.Rejected}
            tone="red"
            trendLabel={rejectedTrend.label}
            trendDirection={rejectedTrend.direction}
            onClick={() => applyRequestDrillDown("Rejected", "pending")}
          />
          <KpiCard
            title="Requests Returned to Supervisor"
            value={currentRejected.length}
            supportText="Current implementation uses Rejected as the return path."
            icon={DashboardIcons.Rejected}
            tone="amber"
            onClick={() => applyRequestDrillDown("Rejected", "pending")}
          />
          <KpiCard
            title="Ready for Storekeeper Action"
            value={currentApproved.length}
            supportText="Approved requests waiting to be issued."
            icon={DashboardIcons.Issue}
            tone="blue"
            onClick={() => applyRequestDrillDown("Approved", "storekeeper")}
          />
          <KpiCard
            title="Issued Requests"
            value={currentIssued.length}
            supportText="Issued and waiting for supervisor receipt."
            icon={DashboardIcons.Issue}
            tone="blue"
            trendLabel={issuedTrend.label}
            trendDirection={issuedTrend.direction}
            onClick={() => applyRequestDrillDown("Issued", "pending")}
          />
          <KpiCard
            title="Received Requests"
            value={currentReceived.length}
            supportText="Completed with supervisor confirmation."
            icon={DashboardIcons.Receive}
            tone="green"
            trendLabel={receivedTrend.label}
            trendDirection={receivedTrend.direction}
            onClick={() => applyRequestDrillDown("Received", "pending")}
          />
          <KpiCard
            title="Open Requests Still In Progress"
            value={openRequests.length}
            supportText="All requests not yet marked as received."
            icon={DashboardIcons.Pending}
            tone="amber"
            onClick={() => {
              setRequestStatusFilter("all");
              scrollToTable("pending");
            }}
          />
          <KpiCard
            title="Average Request Cycle Time"
            value={formatDuration(averageCycleMs)}
            supportText="From request creation to supervisor receipt."
            icon={DashboardIcons.Clock}
            tone="slate"
            trendLabel={cycleTrend.label}
            trendDirection={cycleTrend.direction}
          />
          <KpiCard
            title="Average Admin Approval Time"
            value={formatDuration(averageApprovalMs)}
            supportText="From request creation to manager decision."
            icon={DashboardIcons.Clock}
            tone="slate"
            trendLabel={approvalTrend.label}
            trendDirection={approvalTrend.direction}
          />
          <KpiCard
            title="Average Storekeeper Fulfillment Time"
            value={formatDuration(averageFulfillmentMs)}
            supportText="From approval to issue."
            icon={DashboardIcons.Clock}
            tone="slate"
            trendLabel={fulfillmentTrend.label}
            trendDirection={fulfillmentTrend.direction}
          />
          <KpiCard
            title="Average Supervisor Receive Time"
            value={formatDuration(averageReceiptMs)}
            supportText="From issue to supervisor receipt."
            icon={DashboardIcons.Clock}
            tone="slate"
            trendLabel={receiptTrend.label}
            trendDirection={receiptTrend.direction}
          />
          <KpiCard
            title="Internal Stock Items Count"
            value={visibleLocalInventory.length}
            supportText={`${visibleLocalInventory.reduce(
              (sum, item) => sum + (item.qty || 0),
              0
            )} units tracked in local stocktake records.`}
            icon={DashboardIcons.Stock}
            tone="blue"
            onClick={() => scrollToTable("stock")}
          />
          <KpiCard
            title="External Stock Items Count"
            value={externalInventory.length}
            supportText={`${externalInventory.reduce((sum, item) => sum + item.qty, 0)} units across main warehouses.`}
            icon={DashboardIcons.Stock}
            tone="blue"
            onClick={() => scrollToTable("stock")}
          />
          <KpiCard
            title="Central Warehouse Stock Count"
            value={centralInventory.length}
            supportText={
              centralInventory.length
                ? `${centralInventory.reduce((sum, item) => sum + item.qty, 0)} units currently tracked in CWW.`
                : "CWW is configured but no central stock records exist yet."
            }
            icon={DashboardIcons.Stock}
            tone="slate"
            onClick={() => scrollToTable("stock")}
          />
          <KpiCard
            title="Low Stock Alerts"
            value={lowStockItems.length}
            supportText="Current filtered items at or below threshold."
            icon={DashboardIcons.Alert}
            tone="amber"
            onClick={() => scrollToTable("stock")}
          />
          <KpiCard
            title="Out-of-Stock Items"
            value={outOfStockItems.length}
            supportText="Immediate replenishment attention needed."
            icon={DashboardIcons.Alert}
            tone="red"
            onClick={() => scrollToTable("stock")}
          />
          <KpiCard
            title="Borrow Transactions Open"
            value={currentBorrowOpen}
            supportText="Open borrow records in the current loan ledger."
            icon={DashboardIcons.Loan}
            tone="amber"
            onClick={() => scrollToTable("loans")}
          />
          <KpiCard
            title="Lend Transactions Open"
            value={currentLendOpen}
            supportText="Open lend records waiting for settlement."
            icon={DashboardIcons.Loan}
            tone="amber"
            onClick={() => scrollToTable("loans")}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Section B - Executive Alerts / Insights
          </h2>
          <p className="text-sm text-slate-500">
            Short operational signals to help management focus attention immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {insightItems.map((insight) => (
            <article
              key={insight.title}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {insight.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{insight.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Section C - Visual Analytics
            </h2>
            <p className="text-sm text-slate-500">
              Focused charts only. Each view is scoped to the active filters.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(["daily", "weekly", "monthly"] as ChartGranularity[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setChartGranularity(option)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  chartGranularity === option
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartPanel
            title="Requests Trend Over Time"
            description="Created vs approved vs issued vs received across the selected period."
            isEmpty={requestTrend.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={requestTrend}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#2563EB" strokeWidth={3} />
                <Line type="monotone" dataKey="approved" stroke="#0F766E" strokeWidth={3} />
                <Line type="monotone" dataKey="issued" stroke="#D97706" strokeWidth={3} />
                <Line type="monotone" dataKey="received" stroke="#DC2626" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Request Status Distribution"
            description="Current status mix, including stalled requests older than 3 days. Rejected requests are the returned-to-supervisor path in this workflow."
            isEmpty={statusDistribution.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Warehouse Stock Overview"
            description="Snapshot of stock quantities and health by internal, external, and central scope."
            isEmpty={stockOverview.every((entry) => entry.quantity === 0 && entry.lowStock === 0)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockOverview}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity" fill="#2563EB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="lowStock" fill="#D97706" radius={[6, 6, 0, 0]} />
                <Bar dataKey="outOfStock" fill="#DC2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Region Performance"
            description="Request volume, completion rate, and delay rate by region."
            isEmpty={regionPerformance.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionPerformance}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="requests" fill="#2563EB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completionRate" fill="#0F766E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="delayRate" fill="#D97706" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Supervisor Performance"
            description="Submitted requests, approvals, rejections, receipts, and cycle-time exposure by supervisor."
            isEmpty={supervisorPerformanceChart.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supervisorPerformanceChart}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="submitted" fill="#2563EB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="approved" fill="#0F766E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="rejected" fill="#DC2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="received" fill="#475569" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Borrow / Lend Movement"
            description="Open vs closed loan records, outgoing issues, incoming returns, and pending settlement."
            isEmpty={loanMovement.every((entry) => entry.value === 0)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={loanMovement}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#7C3AED" radius={[6, 6, 0, 0]}>
                  {loanMovement.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Section D - Operational Tables
          </h2>
          <p className="text-sm text-slate-500">
            Detailed queues and management tables with the same live filters applied.
          </p>
        </div>

        <div
          ref={pendingTableRef}
          className={`scroll-mt-24 rounded-[20px] transition-shadow ${
            focusedTable === "pending" ? "ring-2 ring-blue-100" : ""
          }`}
        >
          <TablePanel
            title="Pending Requests Requiring Action"
            description="Open requests sorted by age to highlight where the end-to-end workflow is blocked."
          >
            <PremiumTable
              columns={[
                {
                  header: "Request Number",
                  render: (row: (typeof pendingActionRows)[number]) => (
                    <span className="font-semibold text-slate-900">{row.requestNumber}</span>
                  ),
                },
                {
                  header: "Supervisor",
                  render: (row: (typeof pendingActionRows)[number]) =>
                    row.request.supervisorName || "-",
                },
                {
                  header: "Region",
                  render: (row: (typeof pendingActionRows)[number]) =>
                    row.request.region || "-",
                },
                {
                  header: "Warehouse",
                  render: () => getRequestFulfillmentWarehouse(),
                },
                {
                  header: "Request Date",
                  render: (row: (typeof pendingActionRows)[number]) =>
                    row.request.requestDate
                      ? new Date(row.request.requestDate).toLocaleDateString()
                      : "-",
                },
                {
                  header: "Current Status",
                  render: (row: (typeof pendingActionRows)[number]) =>
                    row.request.status || "-",
                },
                {
                  header: "Waiting On",
                  render: (row: (typeof pendingActionRows)[number]) => row.waitingOn,
                },
                {
                  header: "Age in Days",
                  render: (row: (typeof pendingActionRows)[number]) => row.ageDays,
                },
                {
                  header: "Requested Quantity",
                  render: (row: (typeof pendingActionRows)[number]) =>
                    `${row.request.qty || 0} ${row.request.unit || ""}`.trim(),
                },
              ]}
              data={pendingActionRows}
              actions={() => (
                <Link
                  href="/warehouse"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  View
                </Link>
              )}
            />
          </TablePanel>
        </div>

        <div
          ref={storekeeperTableRef}
          className={`scroll-mt-24 rounded-[20px] transition-shadow ${
            focusedTable === "storekeeper" ? "ring-2 ring-blue-100" : ""
          }`}
        >
          <TablePanel
            title="Storekeeper Work Queue"
            description="Approved requests waiting for issue, with a simple SLA watch based on 3 days in queue."
          >
            <PremiumTable
              columns={[
                {
                  header: "Request Number",
                  render: (row: (typeof storekeeperQueueRows)[number]) => (
                    <span className="font-semibold text-slate-900">{row.requestNumber}</span>
                  ),
                },
                {
                  header: "Approved Date",
                  render: (row: (typeof storekeeperQueueRows)[number]) =>
                    row.approvedDate
                      ? new Date(row.approvedDate).toLocaleDateString()
                      : "-",
                },
                {
                  header: "Warehouse",
                  render: () => getRequestFulfillmentWarehouse(),
                },
                {
                  header: "Supervisor",
                  render: (row: (typeof storekeeperQueueRows)[number]) =>
                    row.request.supervisorName || "-",
                },
                {
                  header: "Region",
                  render: (row: (typeof storekeeperQueueRows)[number]) =>
                    row.request.region || "-",
                },
                {
                  header: "Items Count",
                  render: () => "1",
                },
                {
                  header: "Pending Since",
                  render: (row: (typeof storekeeperQueueRows)[number]) =>
                    `${row.pendingDays} day(s)`,
                },
                {
                  header: "SLA Status",
                  render: (row: (typeof storekeeperQueueRows)[number]) => (
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.slaStatus === "Overdue"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {row.slaStatus}
                    </span>
                  ),
                },
              ]}
              data={storekeeperQueueRows}
              actions={() => (
                <Link
                  href="/warehouse"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  View
                </Link>
              )}
            />
          </TablePanel>
        </div>

        <div
          ref={stockTableRef}
          className={`scroll-mt-24 rounded-[20px] transition-shadow ${
            focusedTable === "stock" ? "ring-2 ring-blue-100" : ""
          }`}
        >
          <TablePanel
            title="Low Stock / Critical Stock"
            description="Low and empty stock items based on the configured inventory threshold."
          >
            <PremiumTable
              columns={[
                {
                  header: "Item Name",
                  render: (row: (typeof lowStockRows)[number]) => (
                    <span className="font-semibold text-slate-900">{row.nameEn}</span>
                  ),
                },
                {
                  header: "Warehouse Type",
                  render: (row: (typeof lowStockRows)[number]) =>
                    getInventoryWarehouseType(row.location) === "central"
                      ? "Central"
                      : "Main",
                },
                {
                  header: "Warehouse Name",
                  render: (row: (typeof lowStockRows)[number]) => row.location,
                },
                {
                  header: "Current Qty",
                  render: (row: (typeof lowStockRows)[number]) =>
                    `${row.qty} ${row.unit || ""}`.trim(),
                },
                {
                  header: "Minimum Threshold",
                  render: (row: (typeof lowStockRows)[number]) => row.minThreshold,
                },
                {
                  header: "Stock Status",
                  render: (row: (typeof lowStockRows)[number]) => (
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.stockStatus === "Out of Stock"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {row.stockStatus}
                    </span>
                  ),
                },
                {
                  header: "Region / Allocation",
                  render: (row: (typeof lowStockRows)[number]) => row.location,
                },
                {
                  header: "Suggested Action",
                  render: (row: (typeof lowStockRows)[number]) => row.suggestedAction,
                },
              ]}
              data={lowStockRows}
            />
          </TablePanel>
        </div>

        <div
          ref={supervisorTableRef}
          className={`scroll-mt-24 rounded-[20px] transition-shadow ${
            focusedTable === "supervisors" ? "ring-2 ring-blue-100" : ""
          }`}
        >
          <TablePanel
            title="Supervisor Performance"
            description="Request throughput and completion quality by supervisor and assigned region."
          >
            <PremiumTable
              columns={[
                {
                  header: "Supervisor Name",
                  render: (row: (typeof supervisorPerformance)[number]) => (
                    <span className="font-semibold text-slate-900">{row.name}</span>
                  ),
                },
                {
                  header: "Region",
                  render: (row: (typeof supervisorPerformance)[number]) => row.region,
                },
                {
                  header: "Total Requests",
                  render: (row: (typeof supervisorPerformance)[number]) =>
                    row.totalRequests,
                },
                {
                  header: "Approved",
                  render: (row: (typeof supervisorPerformance)[number]) => row.approved,
                },
                {
                  header: "Rejected",
                  render: (row: (typeof supervisorPerformance)[number]) => row.rejected,
                },
                {
                  header: "Issued",
                  render: (row: (typeof supervisorPerformance)[number]) => row.issued,
                },
                {
                  header: "Received",
                  render: (row: (typeof supervisorPerformance)[number]) => row.received,
                },
                {
                  header: "Avg Completion Time",
                  render: (row: (typeof supervisorPerformance)[number]) =>
                    formatDuration(row.avgCycleMs),
                },
                {
                  header: "Completion Rate",
                  render: (row: (typeof supervisorPerformance)[number]) =>
                    `${row.completionRate}%`,
                },
              ]}
              data={supervisorPerformance}
            />
          </TablePanel>
        </div>

        <div
          ref={loanTableRef}
          className={`scroll-mt-24 rounded-[20px] transition-shadow ${
            focusedTable === "loans" ? "ring-2 ring-blue-100" : ""
          }`}
        >
          <TablePanel
            title="Borrow / Lend Open Transactions"
            description="Open borrow and lend records that still require settlement."
          >
            <PremiumTable
              columns={[
                {
                  header: "Transaction Number",
                  render: (row: (typeof openLoanRows)[number]) => (
                    <span className="font-semibold text-slate-900">LOAN-{row.id}</span>
                  ),
                },
                {
                  header: "Type",
                  render: (row: (typeof openLoanRows)[number]) => row.type,
                },
                {
                  header: "Source Warehouse",
                  render: (row: (typeof openLoanRows)[number]) =>
                    row.sourceWarehouse || "-",
                },
                {
                  header: "Destination / Related Party",
                  render: (row: (typeof openLoanRows)[number]) => row.project,
                },
                {
                  header: "Date",
                  render: (row: (typeof openLoanRows)[number]) =>
                    new Date(row.date).toLocaleDateString(),
                },
                {
                  header: "Qty",
                  render: (row: (typeof openLoanRows)[number]) => row.quantity,
                },
                {
                  header: "Status",
                  render: (row: (typeof openLoanRows)[number]) => row.status,
                },
                {
                  header: "Open Days",
                  render: (row: (typeof openLoanRows)[number]) => row.openDays,
                },
              ]}
              data={openLoanRows}
            />
          </TablePanel>
        </div>
      </section>
    </div>
  );
}
