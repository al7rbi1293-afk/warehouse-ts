import "server-only";

import { Prisma } from "@prisma/client";

import { MANDATORY_DAILY_REPORT_ROUNDS } from "@/lib/dailyReportTemplate";
import {
  calculateAchievementPercentage,
  calculateAttendanceCommitment,
  calculateEffectiveExpectedAttendance,
  formatMonthLabel,
  formatNameForMatching,
  formatSignatureForMatching,
  getExpectedSeniorAttendance,
  getExpectedSupervisorAttendance,
  getExpectedSupervisorReportsForMonth,
  getExpectedSupervisorWorkDays,
  getExpectedWorkerAttendance,
  getDaysInMonth,
  KpiAnnualDataset,
  KpiGroupOverviewRow,
  KpiMonthlyBreakdownRow,
  KpiMonthlyDataset,
  KpiPersonRow,
  KpiPortalTab,
  KpiRankingEntry,
  KpiRoleFocus,
  KpiSupervisorRow,
  roundToTwo,
  summarizeAttendanceStatuses,
  type AttendanceStatusRecord,
  type ExecutiveKpiPortalData,
  type KpiPeriodSummary,
} from "@/lib/kpi-helpers";
import { prisma } from "@/lib/prisma";

type SupervisorReference = {
  id: number;
  name: string;
  role: string;
  shiftName: string | null;
};

type WorkerReference = {
  id: number;
  name: string;
  role: string | null;
  shiftName: string | null;
  status: string | null;
};

type SeniorUserReference = {
  id: number;
  name: string;
  role: string;
  shiftName: string | null;
};

type SeniorWorkerReference = {
  id: number;
  name: string;
  role: string | null;
  shiftName: string | null;
};

type SeniorMappingStrategy = "exact" | "signature" | "unmatched";

type SeniorMapping = {
  userId: number;
  workerId: number | null;
  workerName: string | null;
  strategy: SeniorMappingStrategy;
};

type AttendanceAggregateRow = {
  month_key: string;
  entity_id: number;
  status: string | null;
  count: number;
};

type ReportAggregateRow = {
  month_key: string;
  entity_id: number;
  actual_reports: number;
  optional_reports: number;
  total_reports: number;
  actual_report_days: number;
};

type AttendanceMonthMap = Map<string, Map<number, AttendanceStatusRecord[]>>;
type ReportMonthMap = Map<string, Map<number, ReportAggregate>>;

type ReportAggregate = {
  actualReports: number;
  optionalReports: number;
  totalReports: number;
  actualReportDays: number;
};

type ReferenceData = {
  supervisors: SupervisorReference[];
  workers: WorkerReference[];
  seniorUsers: SeniorUserReference[];
  seniorMappings: Map<number, SeniorMapping>;
  assumptions: string[];
  supportedAttendanceStatuses: string[];
  availableYears: number[];
};

type YearFacts = {
  year: number;
  staffAttendance: AttendanceMonthMap;
  workerAttendance: AttendanceMonthMap;
  supervisorReports: ReportMonthMap;
};

type PortalFilters = {
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
};

const SUPERVISOR_ROLES = ["supervisor", "night_supervisor"] as const;
const WORKER_ROLES = new Set(["Housekeeper", "Housekeper"]);
const SENIOR_WORKER_ROLE = "Senior Housekeeper";

function createMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function createYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(name: string, search: string) {
  if (!search) {
    return true;
  }

  return name.toLowerCase().includes(search);
}

function buildAttendanceMonthMap(rows: AttendanceAggregateRow[]) {
  const monthMap: AttendanceMonthMap = new Map();

  for (const row of rows) {
    const entityMap = monthMap.get(row.month_key) || new Map<number, AttendanceStatusRecord[]>();
    const records = entityMap.get(row.entity_id) || [];
    records.push({
      status: row.status,
      count: Number(row.count) || 0,
    });
    entityMap.set(row.entity_id, records);
    monthMap.set(row.month_key, entityMap);
  }

  return monthMap;
}

function buildReportMonthMap(rows: ReportAggregateRow[]) {
  const monthMap: ReportMonthMap = new Map();

  for (const row of rows) {
    const entityMap = monthMap.get(row.month_key) || new Map<number, ReportAggregate>();
    entityMap.set(row.entity_id, {
      actualReports: Number(row.actual_reports) || 0,
      optionalReports: Number(row.optional_reports) || 0,
      totalReports: Number(row.total_reports) || 0,
      actualReportDays: Number(row.actual_report_days) || 0,
    });
    monthMap.set(row.month_key, entityMap);
  }

  return monthMap;
}

function getAttendanceRecords(
  monthMap: AttendanceMonthMap,
  monthKey: string,
  entityId: number
) {
  return monthMap.get(monthKey)?.get(entityId) || [];
}

function getReportAggregate(
  monthMap: ReportMonthMap,
  monthKey: string,
  entityId: number
): ReportAggregate {
  return (
    monthMap.get(monthKey)?.get(entityId) || {
      actualReports: 0,
      optionalReports: 0,
      totalReports: 0,
      actualReportDays: 0,
    }
  );
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function pickTopRankings(
  rows: KpiSupervisorRow[],
  count: number,
  direction: "top" | "bottom"
): KpiRankingEntry[] {
  const sorted = [...rows].sort((left, right) =>
    direction === "top"
      ? right.reportsAchievementPercentage - left.reportsAchievementPercentage
      : left.reportsAchievementPercentage - right.reportsAchievementPercentage
  );

  return sorted.slice(0, count).map((row) => ({
    name: row.name,
    primaryValue: row.reportsAchievementPercentage,
    secondaryText: `${row.actualReports} actual / ${row.expectedReports.toFixed(2)} expected`,
  }));
}

function pickCommitmentRankings(rows: KpiPersonRow[], count: number) {
  return [...rows]
    .sort(
      (left, right) =>
        right.attendanceCommitmentPercentage - left.attendanceCommitmentPercentage
    )
    .slice(0, count)
    .map((row) => ({
      name: row.name,
      primaryValue: row.attendanceCommitmentPercentage,
      secondaryText: `${row.present} present / ${row.effectiveExpectedAttendance.toFixed(2)} effective expected`,
    }));
}

function pickAbsenceRankings(rows: KpiPersonRow[], count: number) {
  return [...rows]
    .sort((left, right) => right.negativeAbsentDays - left.negativeAbsentDays)
    .slice(0, count)
    .map((row) => ({
      name: row.name,
      primaryValue: row.negativeAbsentDays,
      secondaryText: `${row.present} present / ${row.justifiedExcludedDays} justified`,
    }));
}

function sumRows<T>(rows: T[], selector: (row: T) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function buildGroupOverview(
  supervisors: KpiSupervisorRow[],
  workers: KpiPersonRow[],
  seniors: KpiPersonRow[]
): KpiGroupOverviewRow[] {
  const groups = [
    { key: "supervisors", label: "Supervisors", rows: supervisors },
    { key: "workers", label: "Workers", rows: workers },
    { key: "seniors", label: "Seniors", rows: seniors },
  ] as const;

  return groups.map((group) => {
    const present = sumRows(group.rows, (row) => row.present);
    const absent = sumRows(group.rows, (row) => row.absent);
    const vacation = sumRows(group.rows, (row) => row.vacation);
    const dayOff = sumRows(group.rows, (row) => row.dayOff);
    const sickLeave = sumRows(group.rows, (row) => row.sickLeave);
    const justifiedExcludedDays = sumRows(group.rows, (row) => row.justifiedExcludedDays);
    const baseExpectedAttendance = roundToTwo(
      sumRows(group.rows, (row) => row.baseExpectedAttendance)
    );
    const effectiveExpectedAttendance = roundToTwo(
      sumRows(group.rows, (row) => row.effectiveExpectedAttendance)
    );

    return {
      group: group.key,
      label: group.label,
      headcount: group.rows.length,
      present,
      absent,
      vacation,
      dayOff,
      sickLeave,
      justifiedExcludedDays,
      baseExpectedAttendance,
      effectiveExpectedAttendance,
      commitmentPercentage: calculateAttendanceCommitment(
        present,
        effectiveExpectedAttendance,
        {
          justifiedExcludedDays,
          negativeAbsentDays: absent,
        }
      ),
    };
  });
}

function buildPeriodSummary(
  supervisors: KpiSupervisorRow[],
  workers: KpiPersonRow[],
  seniors: KpiPersonRow[]
): KpiPeriodSummary {
  const everyone = [...supervisors, ...workers, ...seniors];
  const totalActualReports = sumRows(supervisors, (row) => row.actualReports);
  const totalOptionalReports = sumRows(supervisors, (row) => row.optionalReports);
  const totalExpectedReports = roundToTwo(
    sumRows(supervisors, (row) => row.expectedReports)
  );
  const totalPresent = sumRows(everyone, (row) => row.present);
  const totalAbsent = sumRows(everyone, (row) => row.absent);
  const totalVacation = sumRows(everyone, (row) => row.vacation);
  const totalDayOff = sumRows(everyone, (row) => row.dayOff);
  const totalSickLeave = sumRows(everyone, (row) => row.sickLeave);
  const totalOtherStatuses = sumRows(everyone, (row) => row.otherStatusCount);
  const totalBaseExpectedAttendance = roundToTwo(
    sumRows(everyone, (row) => row.baseExpectedAttendance)
  );
  const totalEffectiveExpectedAttendance = roundToTwo(
    sumRows(everyone, (row) => row.effectiveExpectedAttendance)
  );
  const totalJustifiedExcludedDays = sumRows(
    everyone,
    (row) => row.justifiedExcludedDays
  );
  const totalNegativeAbsentDays = sumRows(
    everyone,
    (row) => row.negativeAbsentDays
  );
  const totalReportingDays = sumRows(supervisors, (row) => row.actualReportDays);

  return {
    supervisorsCount: supervisors.length,
    workersCount: workers.length,
    seniorsCount: seniors.length,
    totalActualReports,
    totalOptionalReports,
    totalExpectedReports,
    reportsAchievementPercentage: calculateAchievementPercentage(
      totalActualReports,
      totalExpectedReports
    ),
    totalPresent,
    totalAbsent,
    totalVacation,
    totalDayOff,
    totalSickLeave,
    totalOtherStatuses,
    totalBaseExpectedAttendance,
    totalEffectiveExpectedAttendance,
    attendanceCommitmentPercentage: calculateAttendanceCommitment(
      totalPresent,
      totalEffectiveExpectedAttendance,
      {
        justifiedExcludedDays: totalJustifiedExcludedDays,
        negativeAbsentDays: totalNegativeAbsentDays,
      }
    ),
    totalJustifiedExcludedDays,
    totalNegativeAbsentDays,
    totalReportingDays,
  };
}

function buildStatusBreakdown(
  summary: KpiPeriodSummary
): Array<{ label: string; value: number }> {
  return [
    { label: "Present", value: summary.totalPresent },
    { label: "Absent", value: summary.totalAbsent },
    { label: "Vacation", value: summary.totalVacation },
    { label: "Day Off", value: summary.totalDayOff },
    { label: "Sick Leave", value: summary.totalSickLeave },
    { label: "Other", value: summary.totalOtherStatuses },
  ].filter((item) => item.value > 0);
}

function aggregateAnnualPeopleRows<T extends KpiPersonRow>(
  monthlyRows: T[][],
  kind: "person" | "supervisor"
) {
  const rowMap = new Map<string, T>();

  for (const monthRows of monthlyRows) {
    for (const row of monthRows) {
      const existing = rowMap.get(row.id);
      if (!existing) {
        rowMap.set(row.id, { ...row });
        continue;
      }

      existing.present += row.present;
      existing.absent += row.absent;
      existing.vacation += row.vacation;
      existing.dayOff += row.dayOff;
      existing.sickLeave += row.sickLeave;
      existing.justifiedExcludedDays += row.justifiedExcludedDays;
      existing.negativeAbsentDays += row.negativeAbsentDays;
      existing.otherStatusCount += row.otherStatusCount;
      existing.baseExpectedAttendance = roundToTwo(
        existing.baseExpectedAttendance + row.baseExpectedAttendance
      );
      existing.effectiveExpectedAttendance = roundToTwo(
        existing.effectiveExpectedAttendance + row.effectiveExpectedAttendance
      );
    }
  }

  if (kind === "supervisor") {
    for (const row of rowMap.values()) {
      const supervisorRow = row as T & KpiSupervisorRow;
      supervisorRow.actualReports = 0;
      supervisorRow.optionalReports = 0;
      supervisorRow.totalReports = 0;
      supervisorRow.expectedWorkDays = 0;
      supervisorRow.expectedReports = 0;
      supervisorRow.actualDailyReportsRate = 0;
      supervisorRow.expectedDailyReportsRate = 0;
      supervisorRow.reportsAchievementPercentage = 0;
      supervisorRow.actualReportDays = 0;
    }

    for (const monthRows of monthlyRows as unknown as KpiSupervisorRow[][]) {
      for (const monthRow of monthRows) {
        const annualRow = rowMap.get(monthRow.id) as T & KpiSupervisorRow;
        annualRow.actualReports += monthRow.actualReports;
        annualRow.optionalReports += monthRow.optionalReports;
        annualRow.totalReports += monthRow.totalReports;
        annualRow.expectedWorkDays = roundToTwo(
          annualRow.expectedWorkDays + monthRow.expectedWorkDays
        );
        annualRow.expectedReports = roundToTwo(
          annualRow.expectedReports + monthRow.expectedReports
        );
        annualRow.actualReportDays += monthRow.actualReportDays;
      }
    }

    for (const row of rowMap.values()) {
      const supervisorRow = row as T & KpiSupervisorRow;
      supervisorRow.actualDailyReportsRate =
        supervisorRow.actualReportDays > 0
          ? roundToTwo(supervisorRow.actualReports / supervisorRow.actualReportDays)
          : 0;
      supervisorRow.expectedDailyReportsRate =
        supervisorRow.expectedWorkDays > 0
          ? roundToTwo(supervisorRow.expectedReports / supervisorRow.expectedWorkDays)
          : 0;
      supervisorRow.reportsAchievementPercentage = calculateAchievementPercentage(
        supervisorRow.actualReports,
        supervisorRow.expectedReports
      );
      supervisorRow.attendanceCommitmentPercentage = calculateAttendanceCommitment(
        supervisorRow.present,
        supervisorRow.effectiveExpectedAttendance,
        {
          justifiedExcludedDays: supervisorRow.justifiedExcludedDays,
          negativeAbsentDays: supervisorRow.negativeAbsentDays,
        }
      );
    }
  } else {
    for (const row of rowMap.values()) {
      row.attendanceCommitmentPercentage = calculateAttendanceCommitment(
        row.present,
        row.effectiveExpectedAttendance,
        {
          justifiedExcludedDays: row.justifiedExcludedDays,
          negativeAbsentDays: row.negativeAbsentDays,
        }
      );
    }
  }

  return sortByName(Array.from(rowMap.values()));
}

function applySearchToRows<T extends { name: string }>(rows: T[], search: string) {
  if (!search) {
    return rows;
  }

  return rows.filter((row) => matchesSearch(row.name, search));
}

function buildMonthlySupervisorRows(
  references: ReferenceData,
  facts: YearFacts,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const monthKey = createMonthKey(year, month);
  const expectedReports = getExpectedSupervisorReportsForMonth(year, month);
  const expectedWorkDays = getExpectedSupervisorWorkDays(year, month);
  const baseExpectedAttendance = getExpectedSupervisorAttendance(daysInMonth);

  return sortByName(
    references.supervisors.map((supervisor) => {
      const attendanceSummary = summarizeAttendanceStatuses(
        getAttendanceRecords(facts.staffAttendance, monthKey, supervisor.id)
      );
      const reportAggregate = getReportAggregate(
        facts.supervisorReports,
        monthKey,
        supervisor.id
      );
      const effectiveExpectedAttendance = calculateEffectiveExpectedAttendance(
        baseExpectedAttendance,
        attendanceSummary.justifiedExcluded
      );

      return {
        id: `supervisor-${supervisor.id}`,
        name: supervisor.name,
        role: supervisor.role,
        shiftName: supervisor.shiftName,
        actualReports: reportAggregate.actualReports,
        optionalReports: reportAggregate.optionalReports,
        totalReports: reportAggregate.totalReports,
        expectedWorkDays,
        expectedReports,
        actualDailyReportsRate:
          reportAggregate.actualReportDays > 0
            ? roundToTwo(
                reportAggregate.actualReports / reportAggregate.actualReportDays
              )
            : 0,
        expectedDailyReportsRate:
          expectedWorkDays > 0
            ? roundToTwo(expectedReports / expectedWorkDays)
            : 0,
        reportsAchievementPercentage: calculateAchievementPercentage(
          reportAggregate.actualReports,
          expectedReports
        ),
        actualReportDays: reportAggregate.actualReportDays,
        present: attendanceSummary.present,
        absent: attendanceSummary.absent,
        vacation: attendanceSummary.vacation,
        dayOff: attendanceSummary.dayOff,
        sickLeave: attendanceSummary.sickLeave,
        justifiedExcludedDays: attendanceSummary.justifiedExcluded,
        negativeAbsentDays: attendanceSummary.negativeAbsent,
        otherStatusCount: attendanceSummary.other,
        baseExpectedAttendance,
        effectiveExpectedAttendance,
        attendanceCommitmentPercentage: calculateAttendanceCommitment(
          attendanceSummary.present,
          effectiveExpectedAttendance,
          {
            justifiedExcludedDays: attendanceSummary.justifiedExcluded,
            negativeAbsentDays: attendanceSummary.negativeAbsent,
          }
        ),
      } satisfies KpiSupervisorRow;
    })
  );
}

function buildMonthlyWorkerRows(
  references: ReferenceData,
  facts: YearFacts,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const monthKey = createMonthKey(year, month);
  const baseExpectedAttendance = getExpectedWorkerAttendance(daysInMonth);

  return sortByName(
    references.workers.map((worker) => {
      const attendanceSummary = summarizeAttendanceStatuses(
        getAttendanceRecords(facts.workerAttendance, monthKey, worker.id)
      );
      const effectiveExpectedAttendance = calculateEffectiveExpectedAttendance(
        baseExpectedAttendance,
        attendanceSummary.justifiedExcluded
      );

      return {
        id: `worker-${worker.id}`,
        name: worker.name,
        role: worker.role || "worker",
        shiftName: worker.shiftName,
        present: attendanceSummary.present,
        absent: attendanceSummary.absent,
        vacation: attendanceSummary.vacation,
        dayOff: attendanceSummary.dayOff,
        sickLeave: attendanceSummary.sickLeave,
        justifiedExcludedDays: attendanceSummary.justifiedExcluded,
        negativeAbsentDays: attendanceSummary.negativeAbsent,
        otherStatusCount: attendanceSummary.other,
        baseExpectedAttendance,
        effectiveExpectedAttendance,
        attendanceCommitmentPercentage: calculateAttendanceCommitment(
          attendanceSummary.present,
          effectiveExpectedAttendance,
          {
            justifiedExcludedDays: attendanceSummary.justifiedExcluded,
            negativeAbsentDays: attendanceSummary.negativeAbsent,
          }
        ),
      } satisfies KpiPersonRow;
    })
  );
}

function buildMonthlySeniorRows(
  references: ReferenceData,
  facts: YearFacts,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const monthKey = createMonthKey(year, month);
  const baseExpectedAttendance = getExpectedSeniorAttendance(daysInMonth);

  return sortByName(
    references.seniorUsers.map((senior) => {
      const mapping = references.seniorMappings.get(senior.id);
      const attendanceSummary = summarizeAttendanceStatuses(
        mapping?.workerId
          ? getAttendanceRecords(facts.workerAttendance, monthKey, mapping.workerId)
          : []
      );
      const effectiveExpectedAttendance = calculateEffectiveExpectedAttendance(
        baseExpectedAttendance,
        attendanceSummary.justifiedExcluded
      );

      return {
        id: `senior-${senior.id}`,
        name: senior.name,
        role: senior.role,
        shiftName: senior.shiftName,
        present: attendanceSummary.present,
        absent: attendanceSummary.absent,
        vacation: attendanceSummary.vacation,
        dayOff: attendanceSummary.dayOff,
        sickLeave: attendanceSummary.sickLeave,
        justifiedExcludedDays: attendanceSummary.justifiedExcluded,
        negativeAbsentDays: attendanceSummary.negativeAbsent,
        otherStatusCount: attendanceSummary.other,
        baseExpectedAttendance,
        effectiveExpectedAttendance,
        attendanceCommitmentPercentage: calculateAttendanceCommitment(
          attendanceSummary.present,
          effectiveExpectedAttendance,
          {
            justifiedExcludedDays: attendanceSummary.justifiedExcluded,
            negativeAbsentDays: attendanceSummary.negativeAbsent,
          }
        ),
      } satisfies KpiPersonRow;
    })
  );
}

function buildMonthlyDataset(
  references: ReferenceData,
  facts: YearFacts,
  options: {
    year: number;
    month: number;
    search: string;
    roleFocus: KpiRoleFocus;
  }
): KpiMonthlyDataset {
  const search = normalizeSearch(options.search);
  const allSupervisors = buildMonthlySupervisorRows(
    references,
    facts,
    options.year,
    options.month
  );
  const allWorkers = buildMonthlyWorkerRows(
    references,
    facts,
    options.year,
    options.month
  );
  const allSeniors = buildMonthlySeniorRows(
    references,
    facts,
    options.year,
    options.month
  );

  const supervisors = applySearchToRows(allSupervisors, search);
  const workers = applySearchToRows(allWorkers, search);
  const seniors = applySearchToRows(allSeniors, search);
  const visualsSupervisors = supervisors.length > 0 ? supervisors : allSupervisors;
  const visualsEveryone =
    search.length > 0
      ? [...supervisors, ...workers, ...seniors]
      : [...allSupervisors, ...allWorkers, ...allSeniors];
  const groupOverview = buildGroupOverview(allSupervisors, allWorkers, allSeniors);
  const summary = buildPeriodSummary(allSupervisors, allWorkers, allSeniors);

  return {
    period: {
      year: options.year,
      month: options.month,
      label: formatMonthLabel(options.year, options.month),
      daysInMonth: getDaysInMonth(options.year, options.month),
    },
    filters: {
      search: options.search,
      roleFocus: options.roleFocus,
    },
    summary,
    supervisors,
    workers,
    seniors,
    groupOverview,
    reportsTrend: visualsSupervisors.map((row) => ({
      label: row.name,
      actual: row.actualReports,
      expected: row.expectedReports,
      percentage: row.reportsAchievementPercentage,
      optional: row.optionalReports,
    })),
    attendanceTrend: groupOverview.map((group) => ({
      label: group.label,
      actual: group.present,
      expected: group.effectiveExpectedAttendance,
      percentage: group.commitmentPercentage,
    })),
    statusBreakdown: buildStatusBreakdown(summary),
    topSupervisors: pickTopRankings(visualsSupervisors, 5, "top"),
    lowestSupervisors: pickTopRankings(visualsSupervisors, 5, "bottom"),
    mostCommittedPeople: pickCommitmentRankings(visualsEveryone, 5),
    highestAbsencePeople: pickAbsenceRankings(visualsEveryone, 5),
  };
}

function buildAnnualDataset(
  references: ReferenceData,
  facts: YearFacts,
  options: {
    year: number;
    search: string;
    roleFocus: KpiRoleFocus;
  }
): KpiAnnualDataset {
  const monthlyDatasets = Array.from({ length: 12 }, (_, index) =>
    buildMonthlyDataset(references, facts, {
      year: options.year,
      month: index + 1,
      search: "",
      roleFocus: "all",
    })
  );
  const search = normalizeSearch(options.search);
  const annualSupervisors = aggregateAnnualPeopleRows(
    monthlyDatasets.map((dataset) => dataset.supervisors),
    "supervisor"
  ) as KpiSupervisorRow[];
  const annualWorkers = aggregateAnnualPeopleRows(
    monthlyDatasets.map((dataset) => dataset.workers),
    "person"
  );
  const annualSeniors = aggregateAnnualPeopleRows(
    monthlyDatasets.map((dataset) => dataset.seniors),
    "person"
  );

  const supervisors = applySearchToRows(annualSupervisors, search);
  const workers = applySearchToRows(annualWorkers, search);
  const seniors = applySearchToRows(annualSeniors, search);
  const summary = monthlyDatasets.reduce<KpiPeriodSummary>(
    (carry, dataset) => ({
      supervisorsCount: dataset.summary.supervisorsCount,
      workersCount: dataset.summary.workersCount,
      seniorsCount: dataset.summary.seniorsCount,
      totalActualReports: carry.totalActualReports + dataset.summary.totalActualReports,
      totalOptionalReports:
        carry.totalOptionalReports + dataset.summary.totalOptionalReports,
      totalExpectedReports: roundToTwo(
        carry.totalExpectedReports + dataset.summary.totalExpectedReports
      ),
      reportsAchievementPercentage: 0,
      totalPresent: carry.totalPresent + dataset.summary.totalPresent,
      totalAbsent: carry.totalAbsent + dataset.summary.totalAbsent,
      totalVacation: carry.totalVacation + dataset.summary.totalVacation,
      totalDayOff: carry.totalDayOff + dataset.summary.totalDayOff,
      totalSickLeave: carry.totalSickLeave + dataset.summary.totalSickLeave,
      totalOtherStatuses:
        carry.totalOtherStatuses + dataset.summary.totalOtherStatuses,
      totalBaseExpectedAttendance: roundToTwo(
        carry.totalBaseExpectedAttendance +
          dataset.summary.totalBaseExpectedAttendance
      ),
      totalEffectiveExpectedAttendance: roundToTwo(
        carry.totalEffectiveExpectedAttendance +
          dataset.summary.totalEffectiveExpectedAttendance
      ),
      attendanceCommitmentPercentage: 0,
      totalJustifiedExcludedDays:
        carry.totalJustifiedExcludedDays + dataset.summary.totalJustifiedExcludedDays,
      totalNegativeAbsentDays:
        carry.totalNegativeAbsentDays + dataset.summary.totalNegativeAbsentDays,
      totalReportingDays: carry.totalReportingDays + dataset.summary.totalReportingDays,
    }),
    {
      supervisorsCount: references.supervisors.length,
      workersCount: references.workers.length,
      seniorsCount: references.seniorUsers.length,
      totalActualReports: 0,
      totalOptionalReports: 0,
      totalExpectedReports: 0,
      reportsAchievementPercentage: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalVacation: 0,
      totalDayOff: 0,
      totalSickLeave: 0,
      totalOtherStatuses: 0,
      totalBaseExpectedAttendance: 0,
      totalEffectiveExpectedAttendance: 0,
      attendanceCommitmentPercentage: 0,
      totalJustifiedExcludedDays: 0,
      totalNegativeAbsentDays: 0,
      totalReportingDays: 0,
    }
  );

  summary.reportsAchievementPercentage = calculateAchievementPercentage(
    summary.totalActualReports,
    summary.totalExpectedReports
  );
  summary.attendanceCommitmentPercentage = calculateAttendanceCommitment(
    summary.totalPresent,
    summary.totalEffectiveExpectedAttendance,
    {
      justifiedExcludedDays: summary.totalJustifiedExcludedDays,
      negativeAbsentDays: summary.totalNegativeAbsentDays,
    }
  );

  const groupOverview = buildGroupOverview(
    annualSupervisors,
    annualWorkers,
    annualSeniors
  );
  const visualsSupervisors = supervisors.length > 0 ? supervisors : annualSupervisors;
  const visualsEveryone =
    search.length > 0
      ? [...supervisors, ...workers, ...seniors]
      : [...annualSupervisors, ...annualWorkers, ...annualSeniors];

  const monthlyBreakdown: KpiMonthlyBreakdownRow[] = monthlyDatasets.map((dataset) => ({
    month: dataset.period.month,
    label: formatMonthLabel(options.year, dataset.period.month),
    actualReports: dataset.summary.totalActualReports,
    optionalReports: dataset.summary.totalOptionalReports,
    expectedReports: dataset.summary.totalExpectedReports,
    reportsAchievementPercentage: dataset.summary.reportsAchievementPercentage,
    present: dataset.summary.totalPresent,
    absent: dataset.summary.totalAbsent,
    vacation: dataset.summary.totalVacation,
    dayOff: dataset.summary.totalDayOff,
    sickLeave: dataset.summary.totalSickLeave,
    baseExpectedAttendance: dataset.summary.totalBaseExpectedAttendance,
    effectiveExpectedAttendance: dataset.summary.totalEffectiveExpectedAttendance,
    attendanceCommitmentPercentage: dataset.summary.attendanceCommitmentPercentage,
  }));

  return {
    year: options.year,
    filters: {
      search: options.search,
      roleFocus: options.roleFocus,
    },
    summary,
    supervisors,
    workers,
    seniors,
    groupOverview,
    monthlyBreakdown,
    reportsTrend: monthlyBreakdown.map((month) => ({
      label: month.label,
      actual: month.actualReports,
      expected: month.expectedReports,
      percentage: month.reportsAchievementPercentage,
      optional: month.optionalReports,
    })),
    attendanceTrend: monthlyBreakdown.map((month) => ({
      label: month.label,
      actual: month.present,
      expected: month.effectiveExpectedAttendance,
      percentage: month.attendanceCommitmentPercentage,
    })),
    topSupervisors: pickTopRankings(visualsSupervisors, 5, "top"),
    lowestSupervisors: pickTopRankings(visualsSupervisors, 5, "bottom"),
    mostCommittedPeople: pickCommitmentRankings(visualsEveryone, 5),
    highestAbsencePeople: pickAbsenceRankings(visualsEveryone, 5),
  };
}

function createSeniorMappings(
  seniorUsers: SeniorUserReference[],
  seniorWorkers: SeniorWorkerReference[]
) {
  const byExactName = new Map<string, SeniorWorkerReference[]>();
  const bySignature = new Map<string, SeniorWorkerReference[]>();
  const usedWorkerIds = new Set<number>();

  for (const worker of seniorWorkers) {
    const normalized = formatNameForMatching(worker.name);
    const signature = formatSignatureForMatching(worker.name);
    byExactName.set(normalized, [...(byExactName.get(normalized) || []), worker]);
    bySignature.set(signature, [...(bySignature.get(signature) || []), worker]);
  }

  const mappings = new Map<number, SeniorMapping>();
  let signatureMatches = 0;
  let unmatched = 0;

  for (const senior of seniorUsers) {
    const normalized = formatNameForMatching(senior.name);
    const signature = formatSignatureForMatching(senior.name);
    const exactCandidates = (byExactName.get(normalized) || []).filter(
      (worker) => !usedWorkerIds.has(worker.id)
    );

    if (exactCandidates.length === 1) {
      const worker = exactCandidates[0];
      usedWorkerIds.add(worker.id);
      mappings.set(senior.id, {
        userId: senior.id,
        workerId: worker.id,
        workerName: worker.name,
        strategy: "exact",
      });
      continue;
    }

    const signatureCandidates = (bySignature.get(signature) || []).filter(
      (worker) => !usedWorkerIds.has(worker.id)
    );

    if (signatureCandidates.length === 1) {
      const worker = signatureCandidates[0];
      usedWorkerIds.add(worker.id);
      mappings.set(senior.id, {
        userId: senior.id,
        workerId: worker.id,
        workerName: worker.name,
        strategy: "signature",
      });
      signatureMatches += 1;
      continue;
    }

    mappings.set(senior.id, {
      userId: senior.id,
      workerId: null,
      workerName: null,
      strategy: "unmatched",
    });
    unmatched += 1;
  }

  const assumptions: string[] = [];

  if (signatureMatches > 0) {
    assumptions.push(
      `${signatureMatches} senior attendance match${signatureMatches === 1 ? "" : "es"} use first-name/last-name matching because the senior user and worker names are not byte-identical in the current data.`
    );
  }

  if (unmatched > 0) {
    assumptions.push(
      `${unmatched} senior account${unmatched === 1 ? "" : "s"} could not be matched to a Senior Housekeeper worker record, so its attendance remains read-only and zero-valued until the roster data aligns.`
    );
  }

  return { mappings, assumptions };
}

async function getReferenceData(): Promise<ReferenceData> {
  const [supervisors, activeWorkers, seniorUsers, seniorWorkers, statusRows, yearRows] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: { in: [...SUPERVISOR_ROLES] } },
        select: {
          id: true,
          name: true,
          role: true,
          shift: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.worker.findMany({
        where: {
          status: "Active",
          role: { in: [Array.from(WORKER_ROLES)[0], Array.from(WORKER_ROLES)[1]] },
        },
        select: {
          id: true,
          name: true,
          role: true,
          status: true,
          shift: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { role: "senior" },
        select: {
          id: true,
          name: true,
          role: true,
          shift: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.worker.findMany({
        where: {
          status: "Active",
          role: SENIOR_WORKER_ROLE,
        },
        select: {
          id: true,
          name: true,
          role: true,
          shift: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT status
        FROM (
          SELECT DISTINCT status FROM staff_attendance WHERE status IS NOT NULL
          UNION
          SELECT DISTINCT status FROM attendance WHERE status IS NOT NULL
        ) AS combined_statuses
        ORDER BY status ASC
      `),
      prisma.$queryRaw<Array<{ year: number }>>(Prisma.sql`
        SELECT DISTINCT EXTRACT(YEAR FROM source_date)::int AS year
        FROM (
          SELECT date AS source_date FROM staff_attendance
          UNION ALL
          SELECT date AS source_date FROM attendance
          UNION ALL
          SELECT report_date AS source_date FROM daily_report_submissions
        ) AS all_dates
        ORDER BY year DESC
      `),
    ]);

  const { mappings, assumptions } = createSeniorMappings(
    seniorUsers.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      shiftName: user.shift?.name || null,
    })),
    seniorWorkers.map((worker) => ({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      shiftName: worker.shift?.name || null,
    }))
  );
  const currentYear = new Date().getUTCFullYear();
  const availableYears = Array.from(
    new Set([currentYear, ...yearRows.map((row) => Number(row.year)).filter(Boolean)])
  ).sort((left, right) => right - left);

  return {
    supervisors: supervisors.map((supervisor) => ({
      id: supervisor.id,
      name: supervisor.name,
      role: supervisor.role,
      shiftName: supervisor.shift?.name || null,
    })),
    workers: activeWorkers.map((worker) => ({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      shiftName: worker.shift?.name || null,
      status: worker.status,
    })),
    seniorUsers: seniorUsers.map((senior) => ({
      id: senior.id,
      name: senior.name,
      role: senior.role,
      shiftName: senior.shift?.name || null,
    })),
    seniorMappings: mappings,
    assumptions,
    supportedAttendanceStatuses: statusRows.map((row) => row.status).filter(Boolean),
    availableYears,
  };
}

async function getYearFacts(year: number): Promise<YearFacts> {
  const { start, end } = createYearRange(year);
  const [staffAttendanceRows, workerAttendanceRows, reportRows] = await Promise.all([
    prisma.$queryRaw<AttendanceAggregateRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month_key,
        user_id AS entity_id,
        status,
        COUNT(*)::int AS count
      FROM staff_attendance
      WHERE date >= ${start} AND date < ${end}
      GROUP BY month_key, user_id, status
      ORDER BY month_key ASC, user_id ASC
    `),
    prisma.$queryRaw<AttendanceAggregateRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month_key,
        worker_id AS entity_id,
        status,
        COUNT(*)::int AS count
      FROM attendance
      WHERE date >= ${start} AND date < ${end}
      GROUP BY month_key, worker_id, status
      ORDER BY month_key ASC, worker_id ASC
    `),
    prisma.$queryRaw<ReportAggregateRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(report_date, 'YYYY-MM') AS month_key,
        supervisor_id AS entity_id,
        COUNT(*) FILTER (
          WHERE round_number IN (${Prisma.join(MANDATORY_DAILY_REPORT_ROUNDS)})
        )::int AS actual_reports,
        COUNT(*) FILTER (
          WHERE round_number NOT IN (${Prisma.join(MANDATORY_DAILY_REPORT_ROUNDS)})
        )::int AS optional_reports,
        COUNT(*)::int AS total_reports,
        COUNT(DISTINCT report_date) FILTER (
          WHERE round_number IN (${Prisma.join(MANDATORY_DAILY_REPORT_ROUNDS)})
        )::int AS actual_report_days
      FROM daily_report_submissions
      WHERE report_date >= ${start} AND report_date < ${end}
      GROUP BY month_key, supervisor_id
      ORDER BY month_key ASC, supervisor_id ASC
    `),
  ]);

  return {
    year,
    staffAttendance: buildAttendanceMonthMap(staffAttendanceRows),
    workerAttendance: buildAttendanceMonthMap(workerAttendanceRows),
    supervisorReports: buildReportMonthMap(reportRows),
  };
}

export async function getExecutiveKpiPortalData(
  filters: PortalFilters
): Promise<ExecutiveKpiPortalData> {
  const references = await getReferenceData();
  const monthlyFactsPromise = getYearFacts(filters.monthly.year);
  const annualFactsPromise =
    filters.monthly.year === filters.annual.year
      ? monthlyFactsPromise
      : getYearFacts(filters.annual.year);

  const [monthlyFacts, annualFacts] = await Promise.all([
    monthlyFactsPromise,
    annualFactsPromise,
  ]);

  const monthly = buildMonthlyDataset(references, monthlyFacts, {
    year: filters.monthly.year,
    month: filters.monthly.month,
    search: filters.monthly.search,
    roleFocus: filters.monthly.roleFocus,
  });
  const annual = buildAnnualDataset(references, annualFacts, {
    year: filters.annual.year,
    search: filters.annual.search,
    roleFocus: filters.annual.roleFocus,
  });

  return {
    monthly,
    annual,
    availableYears: references.availableYears,
    supportedAttendanceStatuses: references.supportedAttendanceStatuses,
    assumptions: [
      "Supervisor report KPI is computed read-only from persisted rows in daily_report_submissions. Because that table has no review-status column populated in live data, existing saved rows are treated as valid submitted reports and deleted rows remain excluded by absence.",
      "Expected supervisor reports are compared against the current mandatory daily rounds only. Optional rounds remain visible as extra submissions but do not increase the mandatory target.",
      "Supervisor actual daily reports rate uses distinct report-submission days as the denominator. The live staff_attendance table is not populated for every supervisor workday, so this avoids inventing attendance that is not stored.",
      ...references.assumptions,
    ],
  };
}
