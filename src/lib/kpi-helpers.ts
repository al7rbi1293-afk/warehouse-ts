export type KpiRoleFocus = "all" | "supervisors" | "workers" | "seniors";

export type KpiPortalTab =
  | "monthly"
  | "annual"
  | "supervisors"
  | "attendance"
  | "reports";

export type AttendanceStatusCategory =
  | "present"
  | "negative_absent"
  | "justified_excluded"
  | "other"
  | "missing";

export interface AttendanceStatusRecord {
  status: string | null | undefined;
  count?: number | null;
}

export interface AttendanceStatusSummary {
  present: number;
  absent: number;
  vacation: number;
  dayOff: number;
  sickLeave: number;
  justifiedExcluded: number;
  negativeAbsent: number;
  other: number;
  byStatus: Record<string, number>;
}

export interface KpiPeriodSummary {
  supervisorsCount: number;
  workersCount: number;
  seniorsCount: number;
  totalActualReports: number;
  totalOptionalReports: number;
  totalExpectedReports: number;
  reportsAchievementPercentage: number;
  totalPresent: number;
  totalAbsent: number;
  totalVacation: number;
  totalDayOff: number;
  totalSickLeave: number;
  totalOtherStatuses: number;
  totalBaseExpectedAttendance: number;
  totalEffectiveExpectedAttendance: number;
  attendanceCommitmentPercentage: number;
  totalJustifiedExcludedDays: number;
  totalNegativeAbsentDays: number;
  totalReportingDays: number;
}

export interface KpiPersonRow {
  id: string;
  name: string;
  role: string;
  shiftName: string | null;
  present: number;
  absent: number;
  vacation: number;
  dayOff: number;
  sickLeave: number;
  justifiedExcludedDays: number;
  negativeAbsentDays: number;
  otherStatusCount: number;
  baseExpectedAttendance: number;
  effectiveExpectedAttendance: number;
  attendanceCommitmentPercentage: number;
}

export interface KpiSupervisorRow extends KpiPersonRow {
  actualReports: number;
  optionalReports: number;
  totalReports: number;
  expectedWorkDays: number;
  expectedReports: number;
  actualDailyReportsRate: number;
  expectedDailyReportsRate: number;
  reportsAchievementPercentage: number;
  actualReportDays: number;
}

export interface KpiGroupOverviewRow {
  group: "supervisors" | "workers" | "seniors";
  label: string;
  headcount: number;
  present: number;
  absent: number;
  vacation: number;
  dayOff: number;
  sickLeave: number;
  justifiedExcludedDays: number;
  baseExpectedAttendance: number;
  effectiveExpectedAttendance: number;
  commitmentPercentage: number;
}

export interface KpiTrendPoint {
  label: string;
  actual: number;
  expected: number;
  percentage: number;
  optional?: number;
}

export interface KpiStatusBreakdownPoint {
  label: string;
  value: number;
}

export interface KpiRankingEntry {
  name: string;
  primaryValue: number;
  secondaryText: string;
}

export interface KpiMonthlyBreakdownRow {
  month: number;
  label: string;
  actualReports: number;
  optionalReports: number;
  expectedReports: number;
  reportsAchievementPercentage: number;
  present: number;
  absent: number;
  vacation: number;
  dayOff: number;
  sickLeave: number;
  baseExpectedAttendance: number;
  effectiveExpectedAttendance: number;
  attendanceCommitmentPercentage: number;
}

export interface KpiMonthlyDataset {
  period: {
    year: number;
    month: number;
    label: string;
    daysInMonth: number;
  };
  filters: {
    search: string;
    roleFocus: KpiRoleFocus;
  };
  summary: KpiPeriodSummary;
  supervisors: KpiSupervisorRow[];
  workers: KpiPersonRow[];
  seniors: KpiPersonRow[];
  groupOverview: KpiGroupOverviewRow[];
  reportsTrend: KpiTrendPoint[];
  attendanceTrend: KpiTrendPoint[];
  statusBreakdown: KpiStatusBreakdownPoint[];
  topSupervisors: KpiRankingEntry[];
  lowestSupervisors: KpiRankingEntry[];
  mostCommittedPeople: KpiRankingEntry[];
  highestAbsencePeople: KpiRankingEntry[];
}

export interface KpiAnnualDataset {
  year: number;
  filters: {
    search: string;
    roleFocus: KpiRoleFocus;
  };
  summary: KpiPeriodSummary;
  supervisors: KpiSupervisorRow[];
  workers: KpiPersonRow[];
  seniors: KpiPersonRow[];
  groupOverview: KpiGroupOverviewRow[];
  monthlyBreakdown: KpiMonthlyBreakdownRow[];
  reportsTrend: KpiTrendPoint[];
  attendanceTrend: KpiTrendPoint[];
  topSupervisors: KpiRankingEntry[];
  lowestSupervisors: KpiRankingEntry[];
  mostCommittedPeople: KpiRankingEntry[];
  highestAbsencePeople: KpiRankingEntry[];
}

export interface ExecutiveKpiPortalData {
  monthly: KpiMonthlyDataset;
  annual: KpiAnnualDataset;
  availableYears: number[];
  supportedAttendanceStatuses: string[];
  assumptions: string[];
}

export const PRESENT_STATUSES = new Set<string>(["Present"]);
export const NEGATIVE_ABSENT_STATUSES = new Set<string>(["Absent"]);
export const JUSTIFIED_EXCLUDED_STATUSES = new Set<string>([
  "Vacation",
  "Day Off",
  "Sick Leave",
  "Annual Leave",
  "Official Leave",
  "Eid Holiday",
]);

export function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function scaleExpectation(baseValueFor31Days: number, daysInMonth: number) {
  return roundToTwo(baseValueFor31Days * (daysInMonth / 31));
}

export function getExpectedSupervisorWorkDays(daysInMonth: number) {
  return scaleExpectation(25, daysInMonth);
}

export function getExpectedSupervisorReports(daysInMonth: number) {
  return scaleExpectation(100, daysInMonth);
}

export function getExpectedSupervisorAttendance(daysInMonth: number) {
  return scaleExpectation(25, daysInMonth);
}

export function getExpectedWorkerAttendance(daysInMonth: number) {
  return scaleExpectation(27, daysInMonth);
}

export function getExpectedSeniorAttendance(daysInMonth: number) {
  return scaleExpectation(27, daysInMonth);
}

export function calculateAchievementPercentage(actual: number, expected: number) {
  if (expected <= 0) {
    return 0;
  }

  return roundToTwo((actual / expected) * 100);
}

export function isPresentStatus(status: string | null | undefined) {
  return !!status && PRESENT_STATUSES.has(status);
}

export function isNegativeAbsentStatus(status: string | null | undefined) {
  return !!status && NEGATIVE_ABSENT_STATUSES.has(status);
}

export function isJustifiedExcludedStatus(status: string | null | undefined) {
  return !!status && JUSTIFIED_EXCLUDED_STATUSES.has(status);
}

export function getAttendanceStatusCategory(
  status: string | null | undefined
): AttendanceStatusCategory {
  if (!status) {
    return "missing";
  }

  if (isPresentStatus(status)) {
    return "present";
  }

  if (isNegativeAbsentStatus(status)) {
    return "negative_absent";
  }

  if (isJustifiedExcludedStatus(status)) {
    return "justified_excluded";
  }

  return "other";
}

export function calculateEffectiveExpectedAttendance(
  baseExpected: number,
  justifiedExcludedDays: number
) {
  return roundToTwo(Math.max(baseExpected - justifiedExcludedDays, 0));
}

export function calculateAttendanceCommitment(
  actualPresent: number,
  effectiveExpected: number,
  options?: {
    justifiedExcludedDays?: number;
    negativeAbsentDays?: number;
  }
) {
  if (effectiveExpected > 0) {
    return roundToTwo((actualPresent / effectiveExpected) * 100);
  }

  const justifiedExcludedDays = options?.justifiedExcludedDays || 0;
  const negativeAbsentDays = options?.negativeAbsentDays || 0;

  if (justifiedExcludedDays > 0 && negativeAbsentDays === 0) {
    return 100;
  }

  return 0;
}

export function summarizeAttendanceStatuses(
  records: AttendanceStatusRecord[]
): AttendanceStatusSummary {
  const summary: AttendanceStatusSummary = {
    present: 0,
    absent: 0,
    vacation: 0,
    dayOff: 0,
    sickLeave: 0,
    justifiedExcluded: 0,
    negativeAbsent: 0,
    other: 0,
    byStatus: {},
  };

  for (const record of records) {
    const count = record.count ?? 0;
    const statusLabel = record.status?.trim() || "Missing";
    summary.byStatus[statusLabel] = (summary.byStatus[statusLabel] || 0) + count;

    if (record.status === "Vacation") {
      summary.vacation += count;
    } else if (record.status === "Day Off" || record.status === "Official Leave" || record.status === "Eid Holiday") {
      summary.dayOff += count;
    } else if (record.status === "Sick Leave") {
      summary.sickLeave += count;
    }

    const category = getAttendanceStatusCategory(record.status);

    if (category === "present") {
      summary.present += count;
    } else if (category === "negative_absent") {
      summary.absent += count;
      summary.negativeAbsent += count;
    } else if (category === "justified_excluded") {
      summary.justifiedExcluded += count;
    } else if (category === "other") {
      summary.other += count;
    }
  }

  return summary;
}

export function calculateAbsence(
  actualAttendance: number,
  expectedAttendance: number,
  actualAbsenceFromSystem?: number
) {
  if (typeof actualAbsenceFromSystem === "number" && Number.isFinite(actualAbsenceFromSystem)) {
    return actualAbsenceFromSystem;
  }

  return roundToTwo(Math.max(expectedAttendance - actualAttendance, 0));
}

export function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatNameForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatSignatureForMatching(value: string) {
  const tokens = formatNameForMatching(value)
    .split(" ")
    .filter(Boolean);

  if (tokens.length === 0) {
    return "";
  }

  if (tokens.length === 1) {
    return tokens[0];
  }

  return `${tokens[0]}::${tokens[tokens.length - 1]}`;
}
