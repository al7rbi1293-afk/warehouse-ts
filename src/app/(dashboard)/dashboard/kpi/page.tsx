import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PremiumTable } from "@/components/PremiumTable";
import { authOptions } from "@/lib/auth";
import { getExecutiveKpiPortalData } from "@/lib/executive-kpi";
import {
  type ExecutiveKpiPortalData,
  type KpiPortalTab,
  type KpiRoleFocus,
} from "@/lib/kpi-helpers";
import { getDefaultAuthenticatedPath, isManagerRole } from "@/lib/roles";

import {
  DualMetricBarChart,
  PercentageTrendChart,
  SingleMetricBarChart,
} from "./KpiCharts";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

type SummaryCardProps = {
  label: string;
  value: string;
  helper: string;
};

const PORTAL_TABS: Array<{ key: KpiPortalTab; label: string }> = [
  { key: "monthly", label: "Monthly KPI" },
  { key: "annual", label: "Annual KPI" },
  { key: "supervisors", label: "Supervisors Performance" },
  { key: "attendance", label: "Attendance Overview" },
  { key: "reports", label: "Reports Overview" },
];

const ROLE_FOCUS_OPTIONS: Array<{ value: KpiRoleFocus; label: string }> = [
  { value: "all", label: "All roles" },
  { value: "supervisors", label: "Supervisors" },
  { value: "workers", label: "Workers" },
  { value: "seniors", label: "Seniors" },
];

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntegerParam(
  value: string | undefined,
  fallback: number,
  options?: { min?: number; max?: number }
) {
  const parsed = Number.parseInt(value || "", 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (typeof options?.min === "number" && parsed < options.min) {
    return fallback;
  }

  if (typeof options?.max === "number" && parsed > options.max) {
    return fallback;
  }

  return parsed;
}

function parseRoleFocus(value: string | undefined): KpiRoleFocus {
  if (value === "supervisors" || value === "workers" || value === "seniors") {
    return value;
  }

  return "all";
}

function parsePortalTab(value: string | undefined): KpiPortalTab {
  if (
    value === "annual" ||
    value === "supervisors" ||
    value === "attendance" ||
    value === "reports"
  ) {
    return value;
  }

  return "monthly";
}

function createQueryString(
  values: Record<string, string | number | undefined | null>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDecimal(value: number) {
  return value.toFixed(2);
}

function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}

function SummaryCard({ label, value, helper }: SummaryCardProps) {
  return (
    <div className="card-premium p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function RankingPanel({
  title,
  rows,
  suffix,
}: {
  title: string;
  rows: Array<{ name: string; primaryValue: number; secondaryText: string }>;
  suffix?: string;
}) {
  return (
    <section className="card-premium p-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No ranking data for the selected filters.</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${title}-${row.name}-${index}`}
              className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.secondaryText}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
                  {row.primaryValue.toFixed(2)}
                  {suffix || ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function buildMonthlySummaryCards(data: ExecutiveKpiPortalData["monthly"]) {
  return [
    {
      label: "Supervisors",
      value: formatInteger(data.summary.supervisorsCount),
      helper: "Active supervisor accounts in the current roster.",
    },
    {
      label: "Actual Reports",
      value: formatInteger(data.summary.totalActualReports),
      helper: "Mandatory daily report submissions stored this month.",
    },
    {
      label: "Expected Reports",
      value: formatInteger(data.summary.totalExpectedReports),
      helper: "Standard supervisor working days multiplied by 4 reports.",
    },
    {
      label: "Reports Achievement",
      value: formatPercentage(data.summary.reportsAchievementPercentage),
      helper: "Actual mandatory reports divided by expected reports.",
    },
    {
      label: "Present",
      value: formatInteger(data.summary.totalPresent),
      helper: "Attendance records categorized as effective presence.",
    },
    {
      label: "Absent",
      value: formatInteger(data.summary.totalAbsent),
      helper: "Negative absence statuses only.",
    },
    {
      label: "Vacation",
      value: formatInteger(data.summary.totalVacation),
      helper: "Justified vacation days excluded from negative absence.",
    },
    {
      label: "Day Off",
      value: formatInteger(data.summary.totalDayOff),
      helper: "Scheduled day-off and official-off statuses.",
    },
    {
      label: "Sick Leave",
      value: formatInteger(data.summary.totalSickLeave),
      helper: "Sick leave statuses excluded from negative absence.",
    },
    {
      label: "Attendance Commitment",
      value: formatPercentage(data.summary.attendanceCommitmentPercentage),
      helper: "Total present days divided by effective expected attendance.",
    },
  ];
}

function buildAnnualSummaryCards(data: ExecutiveKpiPortalData["annual"]) {
  return [
    {
      label: "Actual Reports",
      value: formatInteger(data.summary.totalActualReports),
      helper: "Sum of monthly mandatory report submissions for the full year.",
    },
    {
      label: "Expected Reports",
      value: formatInteger(data.summary.totalExpectedReports),
      helper: "Sum of monthly expected report targets across the year.",
    },
    {
      label: "Yearly Achievement",
      value: formatPercentage(data.summary.reportsAchievementPercentage),
      helper: "Annual actual reports divided by annual expected reports.",
    },
    {
      label: "Present",
      value: formatInteger(data.summary.totalPresent),
      helper: "Sum of present attendance records across all tracked groups.",
    },
    {
      label: "Absent",
      value: formatInteger(data.summary.totalAbsent),
      helper: "Negative absence statuses only across the full year.",
    },
    {
      label: "Vacation",
      value: formatInteger(data.summary.totalVacation),
      helper: "Vacation days accumulated across the full year.",
    },
    {
      label: "Day Off",
      value: formatInteger(data.summary.totalDayOff),
      helper: "Day-off and official-off statuses accumulated for the year.",
    },
    {
      label: "Sick Leave",
      value: formatInteger(data.summary.totalSickLeave),
      helper: "Sick leave days accumulated for the year.",
    },
    {
      label: "Attendance Commitment",
      value: formatPercentage(data.summary.attendanceCommitmentPercentage),
      helper: "Annual present attendance divided by annual effective expectation.",
    },
  ];
}

function buildSupervisorMonthlyRows(data: ExecutiveKpiPortalData["monthly"]) {
  return data.supervisors.map((row) => ({
    name: row.name,
    actualReports: formatInteger(row.actualReports),
    expectedReports: formatInteger(row.expectedReports),
    actualDailyRate: formatDecimal(row.actualDailyReportsRate),
    expectedDailyRate: formatDecimal(row.expectedDailyReportsRate),
    reportsAchievement: formatPercentage(row.reportsAchievementPercentage),
    present: formatInteger(row.present),
    absent: formatInteger(row.absent),
    vacation: formatInteger(row.vacation),
    dayOff: formatInteger(row.dayOff),
    sickLeave: formatInteger(row.sickLeave),
    baseExpected: formatDecimal(row.baseExpectedAttendance),
    effectiveExpected: formatDecimal(row.effectiveExpectedAttendance),
    commitment: formatPercentage(row.attendanceCommitmentPercentage),
  }));
}

function buildAttendanceRows(
  rows: ExecutiveKpiPortalData["monthly"]["workers"] | ExecutiveKpiPortalData["monthly"]["seniors"]
) {
  return rows.map((row) => ({
    name: row.name,
    present: formatInteger(row.present),
    absent: formatInteger(row.absent),
    vacation: formatInteger(row.vacation),
    dayOff: formatInteger(row.dayOff),
    sickLeave: formatInteger(row.sickLeave),
    baseExpected: formatDecimal(row.baseExpectedAttendance),
    effectiveExpected: formatDecimal(row.effectiveExpectedAttendance),
    commitment: formatPercentage(row.attendanceCommitmentPercentage),
  }));
}

function buildSupervisorAnnualRows(data: ExecutiveKpiPortalData["annual"]) {
  return data.supervisors.map((row) => ({
    name: row.name,
    actualReports: formatInteger(row.actualReports),
    expectedReports: formatInteger(row.expectedReports),
    reportsAchievement: formatPercentage(row.reportsAchievementPercentage),
    present: formatInteger(row.present),
    absent: formatInteger(row.absent),
    vacation: formatInteger(row.vacation),
    dayOff: formatInteger(row.dayOff),
    sickLeave: formatInteger(row.sickLeave),
    baseExpected: formatDecimal(row.baseExpectedAttendance),
    effectiveExpected: formatDecimal(row.effectiveExpectedAttendance),
    commitment: formatPercentage(row.attendanceCommitmentPercentage),
  }));
}

function buildAnnualAttendanceRows(
  rows: ExecutiveKpiPortalData["annual"]["workers"] | ExecutiveKpiPortalData["annual"]["seniors"]
) {
  return rows.map((row) => ({
    name: row.name,
    present: formatInteger(row.present),
    absent: formatInteger(row.absent),
    vacation: formatInteger(row.vacation),
    dayOff: formatInteger(row.dayOff),
    sickLeave: formatInteger(row.sickLeave),
    baseExpected: formatDecimal(row.baseExpectedAttendance),
    effectiveExpected: formatDecimal(row.effectiveExpectedAttendance),
    commitment: formatPercentage(row.attendanceCommitmentPercentage),
  }));
}

function buildGroupOverviewRows(data: ExecutiveKpiPortalData["monthly"] | ExecutiveKpiPortalData["annual"]) {
  return data.groupOverview.map((group) => ({
    group: group.label,
    headcount: formatInteger(group.headcount),
    present: formatInteger(group.present),
    absent: formatInteger(group.absent),
    vacation: formatInteger(group.vacation),
    dayOff: formatInteger(group.dayOff),
    sickLeave: formatInteger(group.sickLeave),
    baseExpected: formatDecimal(group.baseExpectedAttendance),
    effectiveExpected: formatDecimal(group.effectiveExpectedAttendance),
    commitment: formatPercentage(group.commitmentPercentage),
  }));
}

function buildMonthlyBreakdownRows(data: ExecutiveKpiPortalData["annual"]) {
  return data.monthlyBreakdown.map((row) => ({
    month: row.label,
    actualReports: formatInteger(row.actualReports),
    expectedReports: formatInteger(row.expectedReports),
    reportsAchievement: formatPercentage(row.reportsAchievementPercentage),
    present: formatInteger(row.present),
    absent: formatInteger(row.absent),
    vacation: formatInteger(row.vacation),
    dayOff: formatInteger(row.dayOff),
    sickLeave: formatInteger(row.sickLeave),
    baseExpected: formatDecimal(row.baseExpectedAttendance),
    effectiveExpected: formatDecimal(row.effectiveExpectedAttendance),
    commitment: formatPercentage(row.attendanceCommitmentPercentage),
  }));
}

const supervisorMonthlyColumns: Array<{ header: string; accessorKey: keyof ReturnType<typeof buildSupervisorMonthlyRows>[number] }> = [
  { header: "Supervisor", accessorKey: "name" },
  { header: "Actual Reports", accessorKey: "actualReports" },
  { header: "Expected Reports", accessorKey: "expectedReports" },
  { header: "Actual Daily Rate", accessorKey: "actualDailyRate" },
  { header: "Expected Daily Rate", accessorKey: "expectedDailyRate" },
  { header: "Reports Achievement %", accessorKey: "reportsAchievement" },
  { header: "Present", accessorKey: "present" },
  { header: "Absent", accessorKey: "absent" },
  { header: "Vacation", accessorKey: "vacation" },
  { header: "Day Off", accessorKey: "dayOff" },
  { header: "Sick Leave", accessorKey: "sickLeave" },
  { header: "Base Expected Attendance", accessorKey: "baseExpected" },
  { header: "Effective Expected Attendance", accessorKey: "effectiveExpected" },
  { header: "Commitment %", accessorKey: "commitment" },
];

const attendanceColumns: Array<{ header: string; accessorKey: keyof ReturnType<typeof buildAttendanceRows>[number] }> = [
  { header: "Name", accessorKey: "name" },
  { header: "Present", accessorKey: "present" },
  { header: "Absent", accessorKey: "absent" },
  { header: "Vacation", accessorKey: "vacation" },
  { header: "Day Off", accessorKey: "dayOff" },
  { header: "Sick Leave", accessorKey: "sickLeave" },
  { header: "Base Expected Attendance", accessorKey: "baseExpected" },
  { header: "Effective Expected Attendance", accessorKey: "effectiveExpected" },
  { header: "Commitment %", accessorKey: "commitment" },
];

const supervisorAnnualColumns: Array<{ header: string; accessorKey: keyof ReturnType<typeof buildSupervisorAnnualRows>[number] }> = [
  { header: "Supervisor", accessorKey: "name" },
  { header: "Actual Reports Yearly", accessorKey: "actualReports" },
  { header: "Expected Reports Yearly", accessorKey: "expectedReports" },
  { header: "Reports Achievement %", accessorKey: "reportsAchievement" },
  { header: "Present", accessorKey: "present" },
  { header: "Absent", accessorKey: "absent" },
  { header: "Vacation", accessorKey: "vacation" },
  { header: "Day Off", accessorKey: "dayOff" },
  { header: "Sick Leave", accessorKey: "sickLeave" },
  { header: "Base Expected Attendance", accessorKey: "baseExpected" },
  { header: "Effective Expected Attendance", accessorKey: "effectiveExpected" },
  { header: "Commitment %", accessorKey: "commitment" },
];

const groupOverviewColumns: Array<{ header: string; accessorKey: keyof ReturnType<typeof buildGroupOverviewRows>[number] }> = [
  { header: "Group", accessorKey: "group" },
  { header: "Headcount", accessorKey: "headcount" },
  { header: "Present", accessorKey: "present" },
  { header: "Absent", accessorKey: "absent" },
  { header: "Vacation", accessorKey: "vacation" },
  { header: "Day Off", accessorKey: "dayOff" },
  { header: "Sick Leave", accessorKey: "sickLeave" },
  { header: "Base Expected", accessorKey: "baseExpected" },
  { header: "Effective Expected", accessorKey: "effectiveExpected" },
  { header: "Commitment %", accessorKey: "commitment" },
];

const monthlyBreakdownColumns: Array<{ header: string; accessorKey: keyof ReturnType<typeof buildMonthlyBreakdownRows>[number] }> = [
  { header: "Month", accessorKey: "month" },
  { header: "Actual Reports", accessorKey: "actualReports" },
  { header: "Expected Reports", accessorKey: "expectedReports" },
  { header: "Reports Achievement %", accessorKey: "reportsAchievement" },
  { header: "Present", accessorKey: "present" },
  { header: "Absent", accessorKey: "absent" },
  { header: "Vacation", accessorKey: "vacation" },
  { header: "Day Off", accessorKey: "dayOff" },
  { header: "Sick Leave", accessorKey: "sickLeave" },
  { header: "Base Expected", accessorKey: "baseExpected" },
  { header: "Effective Expected", accessorKey: "effectiveExpected" },
  { header: "Commitment %", accessorKey: "commitment" },
];

function renderSummaryGrid(cards: SummaryCardProps[]) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </div>
  );
}

function renderRoleTables(
  data: ExecutiveKpiPortalData["monthly"] | ExecutiveKpiPortalData["annual"],
  kind: "monthly" | "annual"
) {
  const showSupervisors =
    data.filters.roleFocus === "all" || data.filters.roleFocus === "supervisors";
  const showWorkers =
    data.filters.roleFocus === "all" || data.filters.roleFocus === "workers";
  const showSeniors =
    data.filters.roleFocus === "all" || data.filters.roleFocus === "seniors";

  return (
    <div className="space-y-6">
      {showSupervisors && (
        <section className="card-premium p-6">
          <SectionHeader
            title="Supervisors KPI Table"
            description="Monthly report compliance and attendance commitment for each supervisor."
          />
          <div className="mt-5">
            {kind === "monthly" ? (
              <PremiumTable
                columns={supervisorMonthlyColumns}
                data={buildSupervisorMonthlyRows(data as ExecutiveKpiPortalData["monthly"])}
              />
            ) : (
              <PremiumTable
                columns={supervisorAnnualColumns}
                data={buildSupervisorAnnualRows(data as ExecutiveKpiPortalData["annual"])}
              />
            )}
          </div>
        </section>
      )}

      {showWorkers && (
        <section className="card-premium p-6">
          <SectionHeader
            title="Workers KPI Table"
            description="Attendance commitment for active worker records only, without any region grouping."
          />
          <div className="mt-5">
            <PremiumTable
              columns={attendanceColumns}
              data={
                kind === "monthly"
                  ? buildAttendanceRows((data as ExecutiveKpiPortalData["monthly"]).workers)
                  : buildAnnualAttendanceRows((data as ExecutiveKpiPortalData["annual"]).workers)
              }
            />
          </div>
        </section>
      )}

      {showSeniors && (
        <section className="card-premium p-6">
          <SectionHeader
            title="Senior KPI Table"
            description="Attendance commitment for senior roster members based on their matched attendance worker records."
          />
          <div className="mt-5">
            <PremiumTable
              columns={attendanceColumns}
              data={
                kind === "monthly"
                  ? buildAttendanceRows((data as ExecutiveKpiPortalData["monthly"]).seniors)
                  : buildAnnualAttendanceRows((data as ExecutiveKpiPortalData["annual"]).seniors)
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

function renderMonthlyFilterForm({
  monthly,
  annual,
  activeTab,
  availableYears,
}: {
  monthly: {
    month: number;
    year: number;
    search: string;
    roleFocus: KpiRoleFocus;
  };
  annual: {
    year: number;
    search: string;
    roleFocus: KpiRoleFocus;
  };
  activeTab: KpiPortalTab;
  availableYears: number[];
}) {
  return (
    <form action="/dashboard/kpi" method="get" className="card-premium p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Month</label>
          <select
            name="month"
            defaultValue={String(monthly.month)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, month - 1, 1)))}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Year</label>
          <select
            name="year"
            defaultValue={String(monthly.year)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-[1.4]">
          <label className="mb-2 block text-sm font-medium text-slate-700">Search by name</label>
          <input
            type="search"
            name="monthlySearch"
            defaultValue={monthly.search}
            placeholder="Search supervisor, worker, or senior"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </div>

        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Role focus</label>
          <select
            name="monthlyRoleFocus"
            defaultValue={monthly.roleFocus}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {ROLE_FOCUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <input type="hidden" name="annualYear" value={annual.year} />
        <input type="hidden" name="annualSearch" value={annual.search} />
        <input type="hidden" name="annualRoleFocus" value={annual.roleFocus} />
        <input type="hidden" name="view" value={activeTab} />

        <button type="submit" className="btn-primary whitespace-nowrap">
          Apply monthly filters
        </button>
      </div>
    </form>
  );
}

function renderAnnualFilterForm({
  monthly,
  annual,
  activeTab,
  availableYears,
}: {
  monthly: {
    month: number;
    year: number;
    search: string;
    roleFocus: KpiRoleFocus;
  };
  annual: {
    year: number;
    search: string;
    roleFocus: KpiRoleFocus;
  };
  activeTab: KpiPortalTab;
  availableYears: number[];
}) {
  return (
    <form action="/dashboard/kpi" method="get" className="card-premium p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Year</label>
          <select
            name="annualYear"
            defaultValue={String(annual.year)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-[1.4]">
          <label className="mb-2 block text-sm font-medium text-slate-700">Search by name</label>
          <input
            type="search"
            name="annualSearch"
            defaultValue={annual.search}
            placeholder="Search supervisor, worker, or senior"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </div>

        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Role focus</label>
          <select
            name="annualRoleFocus"
            defaultValue={annual.roleFocus}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          >
            {ROLE_FOCUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <input type="hidden" name="month" value={monthly.month} />
        <input type="hidden" name="year" value={monthly.year} />
        <input type="hidden" name="monthlySearch" value={monthly.search} />
        <input type="hidden" name="monthlyRoleFocus" value={monthly.roleFocus} />
        <input type="hidden" name="view" value={activeTab} />

        <button type="submit" className="btn-primary whitespace-nowrap">
          Apply annual filters
        </button>
      </div>
    </form>
  );
}

export const dynamic = "force-dynamic";

export default async function ExecutiveKpiPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (!isManagerRole(session.user.role)) {
    redirect(getDefaultAuthenticatedPath(session.user.role));
  }

  const params = await searchParams;
  const now = new Date();
  const activeTab = parsePortalTab(getFirstParam(params.view));
  const monthlyYear = parseIntegerParam(
    getFirstParam(params.year),
    now.getUTCFullYear(),
    { min: 2020, max: 2100 }
  );
  const monthlyMonth = parseIntegerParam(
    getFirstParam(params.month),
    now.getUTCMonth() + 1,
    { min: 1, max: 12 }
  );
  const annualYear = parseIntegerParam(
    getFirstParam(params.annualYear),
    now.getUTCFullYear(),
    { min: 2020, max: 2100 }
  );
  const monthlySearch = getFirstParam(params.monthlySearch)?.trim() || "";
  const annualSearch = getFirstParam(params.annualSearch)?.trim() || "";
  const monthlyRoleFocus = parseRoleFocus(getFirstParam(params.monthlyRoleFocus));
  const annualRoleFocus = parseRoleFocus(getFirstParam(params.annualRoleFocus));

  const portalData = await getExecutiveKpiPortalData({
    monthly: {
      month: monthlyMonth,
      year: monthlyYear,
      search: monthlySearch,
      roleFocus: monthlyRoleFocus,
    },
    annual: {
      year: annualYear,
      search: annualSearch,
      roleFocus: annualRoleFocus,
    },
    activeTab,
  });

  const monthlySummaryCards = buildMonthlySummaryCards(portalData.monthly);
  const annualSummaryCards = buildAnnualSummaryCards(portalData.annual);

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Executive KPI Portal
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Monthly and Annual KPI Analytics
          </h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Read-only executive analytics built on the existing reports and attendance
            system. No report workflow changes, no region grouping, and access is
            limited to manager-equivalent roles only.
          </p>
        </div>

        <div className="card-premium flex flex-wrap gap-3 p-4 text-sm text-slate-600">
          <span>
            Monthly period:{" "}
            <strong className="text-slate-900">{portalData.monthly.period.label}</strong>
          </span>
          <span>
            Annual period:{" "}
            <strong className="text-slate-900">{portalData.annual.year}</strong>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {PORTAL_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/dashboard/kpi${createQueryString({
              view: tab.key,
              month: monthlyMonth,
              year: monthlyYear,
              annualYear,
              monthlySearch,
              annualSearch,
              monthlyRoleFocus,
              annualRoleFocus,
            })}`}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {(activeTab === "monthly" ||
        activeTab === "supervisors" ||
        activeTab === "attendance" ||
        activeTab === "reports") &&
        renderMonthlyFilterForm({
          monthly: {
            month: monthlyMonth,
            year: monthlyYear,
            search: monthlySearch,
            roleFocus: monthlyRoleFocus,
          },
          annual: {
            year: annualYear,
            search: annualSearch,
            roleFocus: annualRoleFocus,
          },
          activeTab,
          availableYears: portalData.availableYears,
        })}

      {(activeTab === "annual" || activeTab === "supervisors") &&
        renderAnnualFilterForm({
          monthly: {
            month: monthlyMonth,
            year: monthlyYear,
            search: monthlySearch,
            roleFocus: monthlyRoleFocus,
          },
          annual: {
            year: annualYear,
            search: annualSearch,
            roleFocus: annualRoleFocus,
          },
          activeTab,
          availableYears: portalData.availableYears,
        })}

      {activeTab === "monthly" && (
        <div className="space-y-6">
          {renderSummaryGrid(monthlySummaryCards)}

          <div className="grid gap-6 xl:grid-cols-2">
            <DualMetricBarChart
              title="Supervisor Reports: Actual vs Expected"
              description="Mandatory daily report submissions compared against the scaled monthly target for each supervisor."
              data={portalData.monthly.reportsTrend}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
            <PercentageTrendChart
              title="Attendance Commitment by Group"
              description="Monthly attendance commitment after justified excluded days are deducted from the base expectation."
              data={portalData.monthly.attendanceTrend.map((item) => ({
                label: item.label,
                percentage: item.percentage,
              }))}
              lineLabel="Commitment %"
            />
          </div>

          {renderRoleTables(portalData.monthly, "monthly")}
        </div>
      )}

      {activeTab === "annual" && (
        <div className="space-y-6">
          {renderSummaryGrid(annualSummaryCards)}

          <div className="grid gap-6 xl:grid-cols-2">
            <DualMetricBarChart
              title="Yearly Report Trend by Month"
              description="Annual actual vs expected report totals, aggregated month by month from the same monthly KPI logic."
              data={portalData.annual.reportsTrend}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
            <PercentageTrendChart
              title="Yearly Attendance Commitment Trend"
              description="Monthly attendance commitment trend inside the selected year."
              data={portalData.annual.attendanceTrend.map((item) => ({
                label: item.label,
                percentage: item.percentage,
              }))}
              lineLabel="Commitment %"
            />
          </div>

          {renderRoleTables(portalData.annual, "annual")}

          <section className="card-premium p-6">
            <SectionHeader
              title="Monthly Breakdown Inside Annual KPI"
              description="Full Jan-Dec breakdown generated from month-level aggregation, not from a separate annual hard-coded formula."
            />
            <div className="mt-5">
              <PremiumTable
                columns={monthlyBreakdownColumns}
                data={buildMonthlyBreakdownRows(portalData.annual)}
              />
            </div>
          </section>
        </div>
      )}

      {activeTab === "supervisors" && (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              label="Best Month Supervisor"
              value={portalData.monthly.topSupervisors[0]?.name || "-"}
              helper={
                portalData.monthly.topSupervisors[0]
                  ? `${portalData.monthly.topSupervisors[0].primaryValue.toFixed(2)}% report achievement`
                  : "No monthly supervisor report data."
              }
            />
            <SummaryCard
              label="Lowest Month Supervisor"
              value={portalData.monthly.lowestSupervisors[0]?.name || "-"}
              helper={
                portalData.monthly.lowestSupervisors[0]
                  ? `${portalData.monthly.lowestSupervisors[0].primaryValue.toFixed(2)}% report achievement`
                  : "No monthly supervisor report data."
              }
            />
            <SummaryCard
              label="Best Year Supervisor"
              value={portalData.annual.topSupervisors[0]?.name || "-"}
              helper={
                portalData.annual.topSupervisors[0]
                  ? `${portalData.annual.topSupervisors[0].primaryValue.toFixed(2)}% report achievement`
                  : "No annual supervisor report data."
              }
            />
            <SummaryCard
              label="Lowest Year Supervisor"
              value={portalData.annual.lowestSupervisors[0]?.name || "-"}
              helper={
                portalData.annual.lowestSupervisors[0]
                  ? `${portalData.annual.lowestSupervisors[0].primaryValue.toFixed(2)}% report achievement`
                  : "No annual supervisor report data."
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DualMetricBarChart
              title="Selected Month: Supervisor Actual vs Expected"
              description="Monthly supervisor report compliance for the selected month."
              data={portalData.monthly.reportsTrend}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
            <DualMetricBarChart
              title="Selected Year: Supervisor Actual vs Expected"
              description="Annual supervisor report performance across the selected year."
              data={portalData.annual.supervisors.map((row) => ({
                label: row.name,
                actual: row.actualReports,
                expected: row.expectedReports,
              }))}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <RankingPanel
              title="Top Supervisors This Month"
              rows={portalData.monthly.topSupervisors}
              suffix="%"
            />
            <RankingPanel
              title="Top Supervisors This Year"
              rows={portalData.annual.topSupervisors}
              suffix="%"
            />
          </div>

          <section className="card-premium p-6">
            <SectionHeader
              title="Annual Supervisor Performance Table"
              description="Year-level supervisor performance built from the monthly KPI aggregation layer."
            />
            <div className="mt-5">
              <PremiumTable
                columns={supervisorAnnualColumns}
                data={buildSupervisorAnnualRows(portalData.annual)}
              />
            </div>
          </section>
        </div>
      )}

      {activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              label="Present"
              value={formatInteger(portalData.monthly.summary.totalPresent)}
              helper="Positive attendance statuses only for the selected month."
            />
            <SummaryCard
              label="Negative Absence"
              value={formatInteger(portalData.monthly.summary.totalNegativeAbsentDays)}
              helper="Absence statuses that reduce KPI commitment."
            />
            <SummaryCard
              label="Justified Excluded"
              value={formatInteger(portalData.monthly.summary.totalJustifiedExcludedDays)}
              helper="Vacation, day off, sick leave, and other justified statuses."
            />
            <SummaryCard
              label="Supported Statuses"
              value={formatInteger(portalData.supportedAttendanceStatuses.length)}
              helper="Distinct attendance statuses observed in the live attendance tables."
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SingleMetricBarChart
              title="Attendance Status Distribution"
              description="Explicit breakdown of the stored monthly attendance statuses."
              data={portalData.monthly.statusBreakdown.map((item) => ({
                label: item.label,
                value: item.value,
              }))}
              barLabel="Status count"
            />
            <DualMetricBarChart
              title="Present vs Effective Expected by Group"
              description="Attendance comparison across supervisors, workers, and seniors."
              data={portalData.monthly.groupOverview.map((group) => ({
                label: group.label,
                actual: group.present,
                expected: group.effectiveExpectedAttendance,
              }))}
              actualLabel="Present days"
              expectedLabel="Effective expected"
            />
          </div>

          <section className="card-premium p-6">
            <SectionHeader
              title="Attendance Group Overview"
              description="Group-level attendance KPI without any region-based grouping."
            />
            <div className="mt-5">
              <PremiumTable
                columns={groupOverviewColumns}
                data={buildGroupOverviewRows(portalData.monthly)}
              />
            </div>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
              Supported attendance statuses from live data:{" "}
              <strong className="text-slate-900">
                {portalData.supportedAttendanceStatuses.join(", ") || "No statuses found"}
              </strong>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <RankingPanel
              title="Most Committed People This Month"
              rows={portalData.monthly.mostCommittedPeople}
              suffix="%"
            />
            <RankingPanel
              title="Highest Negative Absence This Month"
              rows={portalData.monthly.highestAbsencePeople}
            />
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              label="Mandatory Reports"
              value={formatInteger(portalData.monthly.summary.totalActualReports)}
              helper="Mandatory report rounds counted toward report KPI."
            />
            <SummaryCard
              label="Optional Reports"
              value={formatInteger(portalData.monthly.summary.totalOptionalReports)}
              helper="Optional extra rounds visible in the live report data."
            />
            <SummaryCard
              label="Report Days"
              value={formatInteger(portalData.monthly.summary.totalReportingDays)}
              helper="Distinct supervisor-days with mandatory report submissions."
            />
            <SummaryCard
              label="Year Trend"
              value={formatInteger(portalData.annual.monthlyBreakdown.length)}
              helper="Monthly breakdown entries available for the selected year."
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DualMetricBarChart
              title="Monthly Supervisor Report Coverage"
              description="Supervisor-level mandatory actual reports versus expected monthly targets."
              data={portalData.monthly.reportsTrend}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
            <DualMetricBarChart
              title="Annual Reports Trend"
              description="Month-by-month actual versus expected report totals inside the selected year."
              data={portalData.annual.reportsTrend}
              actualLabel="Actual reports"
              expectedLabel="Expected reports"
            />
          </div>

          <section className="card-premium p-6">
            <SectionHeader
              title="Supervisor Reports Overview"
              description="Report-only view focused on the mandatory rounds used in KPI scoring."
            />
            <div className="mt-5">
              <PremiumTable
                columns={supervisorMonthlyColumns}
                data={buildSupervisorMonthlyRows(portalData.monthly)}
              />
            </div>
          </section>
        </div>
      )}

      {portalData.assumptions.length > 0 && (
        <section className="card-premium p-6">
          <SectionHeader
            title="Assumptions and Live-Data Notes"
            description="Only the minimum assumptions required to bridge live-data gaps are listed here."
          />
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {portalData.assumptions.map((assumption, index) => (
              <li
                key={`assumption-${index}`}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                {assumption}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
