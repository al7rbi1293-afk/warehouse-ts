import "server-only";

import {
  DAILY_REQUIRED_SUPERVISOR_REPORTS,
  MANDATORY_DAILY_REPORT_ROUNDS,
  isMandatoryDailyReportRound,
} from "@/lib/dailyReportTemplate";
import { decodeAreaValue, splitRoomValues } from "@/lib/dischargeLocations";
import {
  calculateAchievementPercentage,
  formatMonthLabel,
  getExpectedSupervisorReportsForMonth,
  getStandardSupervisorWorkingDaysInMonth,
  roundToTwo,
} from "@/lib/kpi-helpers";
import { prisma } from "@/lib/prisma";
import { logSanitizedDatabaseError } from "@/lib/database-health";

export type SupervisorDailyReportStatus = "complete" | "incomplete" | "exceeded";

export interface SupervisorDailyReportMonitor {
  date: string;
  requiredReports: number;
  completedRequiredReports: number;
  totalCompletedReports: number;
  optionalReports: number;
  remainingReports: number;
  achievementRate: number;
  status: SupervisorDailyReportStatus;
  submittedMandatoryRounds: string[];
  missingMandatoryRounds: string[];
  optionalRounds: string[];
  duplicateMandatoryRounds: string[];
}

export interface SupervisorMonthlyReportMonitor {
  year: number;
  month: number;
  label: string;
  standardWorkingDays: number;
  expectedReports: number;
  completedRequiredReports: number;
  optionalReports: number;
  totalCompletedReports: number;
  remainingReports: number;
  achievementRate: number;
  averageRequiredReportsPerStandardDay: number;
  dailyBreakdown: SupervisorDailyReportMonitor[];
}

export interface SupervisorDischargeBreakdownRow {
  area: string;
  floorOrDetail: string;
  count: number;
}

export interface SupervisorDischargeMonitor {
  dailyTotal: number;
  monthlyTotal: number;
  dailyBreakdown: SupervisorDischargeBreakdownRow[];
  monthlyBreakdown: SupervisorDischargeBreakdownRow[];
}

export interface SupervisorReportDashboardData {
  selectedDate: string;
  daily: SupervisorDailyReportMonitor;
  monthly: SupervisorMonthlyReportMonitor;
  discharge: SupervisorDischargeMonitor;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function parseDashboardDate(dateStr?: string) {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return { year, month, day, label: dateStr };
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return {
    year,
    month,
    day,
    label: formatDateKey(year, month, day),
  };
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeAreaKey(value: string) {
  return value.trim().toUpperCase();
}

function splitAssignedRegions(...values: Array<string | null | undefined>) {
  const regions: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    regions.push(
      ...value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  const deduped = new Map<string, string>();
  for (const region of regions) {
    const key = normalizeAreaKey(region);
    if (!deduped.has(key)) {
      deduped.set(key, region);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.localeCompare(right, "ar")
  );
}

async function getSupervisorDashboardAllowedRegions(
  supervisorId: number,
  reportDate: Date
) {
  const user = await prisma.user.findUnique({
    where: { id: supervisorId },
    select: { role: true, region: true, regions: true },
  });

  const assignedRegions: string[] = [];
  assignedRegions.push(...splitAssignedRegions(user?.region, user?.regions));

  if (user?.role === "senior") {
    const supervisorAreas = await prisma.user.findMany({
      where: {
        role: {
          in: ["supervisor", "night_supervisor"],
        },
      },
      select: {
        region: true,
        regions: true,
      },
    });

    for (const supervisorArea of supervisorAreas) {
      assignedRegions.push(
        ...splitAssignedRegions(supervisorArea.region, supervisorArea.regions)
      );
    }
  }

  const substitutions = await prisma.staffAttendance.findMany({
    where: {
      coveredBy: supervisorId,
      date: reportDate,
      substituteActive: true,
    },
    include: {
      user: {
        select: {
          region: true,
          regions: true,
        },
      },
    },
  });

  for (const substitution of substitutions) {
    assignedRegions.push(
      ...splitAssignedRegions(
        substitution.user?.region,
        substitution.user?.regions
      )
    );
  }

  return splitAssignedRegions(assignedRegions.join(","));
}

function getDailyStatus(
  completedRequiredReports: number,
  totalCompletedReports: number
): SupervisorDailyReportStatus {
  if (
    completedRequiredReports >= DAILY_REQUIRED_SUPERVISOR_REPORTS &&
    totalCompletedReports > DAILY_REQUIRED_SUPERVISOR_REPORTS
  ) {
    return "exceeded";
  }

  if (completedRequiredReports >= DAILY_REQUIRED_SUPERVISOR_REPORTS) {
    return "complete";
  }

  return "incomplete";
}

function buildDailyMonitor(
  date: string,
  rounds: string[]
): SupervisorDailyReportMonitor {
  const mandatoryRoundCounts = new Map<string, number>();
  const optionalRounds: string[] = [];

  for (const round of rounds) {
    if (isMandatoryDailyReportRound(round)) {
      mandatoryRoundCounts.set(round, (mandatoryRoundCounts.get(round) || 0) + 1);
    } else {
      optionalRounds.push(round);
    }
  }

  const submittedMandatoryRounds = MANDATORY_DAILY_REPORT_ROUNDS.filter((round) =>
    mandatoryRoundCounts.has(round)
  );
  const missingMandatoryRounds = MANDATORY_DAILY_REPORT_ROUNDS.filter(
    (round) => !mandatoryRoundCounts.has(round)
  );
  const duplicateMandatoryRounds = Array.from(mandatoryRoundCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([round]) => round);
  const completedRequiredReports = submittedMandatoryRounds.length;
  const totalCompletedReports = rounds.length;

  return {
    date,
    requiredReports: DAILY_REQUIRED_SUPERVISOR_REPORTS,
    completedRequiredReports,
    totalCompletedReports,
    optionalReports: optionalRounds.length,
    remainingReports: Math.max(
      0,
      DAILY_REQUIRED_SUPERVISOR_REPORTS - completedRequiredReports
    ),
    achievementRate: calculateAchievementPercentage(
      completedRequiredReports,
      DAILY_REQUIRED_SUPERVISOR_REPORTS
    ),
    status: getDailyStatus(completedRequiredReports, totalCompletedReports),
    submittedMandatoryRounds,
    missingMandatoryRounds,
    optionalRounds,
    duplicateMandatoryRounds,
  };
}

function getDischargeCountFromRoomNumber(roomNumber: string) {
  return Math.max(splitRoomValues(roomNumber).length, 1);
}

function buildDischargeBreakdown(
  entries: Array<{ area: string; roomNumber: string }>
): SupervisorDischargeBreakdownRow[] {
  const rowMap = new Map<string, SupervisorDischargeBreakdownRow>();

  for (const entry of entries) {
    const decodedArea = decodeAreaValue(entry.area);
    const area = decodedArea.area || "Unassigned";
    const floorOrDetail = decodedArea.areaDetail || "-";
    const key = `${area}::${floorOrDetail}`;
    const count = getDischargeCountFromRoomNumber(entry.roomNumber);
    const existing = rowMap.get(key);

    if (existing) {
      existing.count += count;
      continue;
    }

    rowMap.set(key, {
      area,
      floorOrDetail,
      count,
    });
  }

  return Array.from(rowMap.values()).sort((left, right) => {
    const byArea = left.area.localeCompare(right.area, "en", { numeric: true });
    if (byArea !== 0) {
      return byArea;
    }
    return left.floorOrDetail.localeCompare(right.floorOrDetail, "en", {
      numeric: true,
    });
  });
}

function filterDischargeEntriesByAllowedRegions<T extends { area: string }>(
  entries: T[],
  allowedRegions: string[]
) {
  if (allowedRegions.length === 0) {
    return entries;
  }

  const allowedAreaKeys = new Set(allowedRegions.map(normalizeAreaKey));

  return entries.filter((entry) => {
    const decodedArea = decodeAreaValue(entry.area);
    return allowedAreaKeys.has(normalizeAreaKey(decodedArea.area));
  });
}

export async function getSupervisorReportDashboardData(
  supervisorId: number,
  selectedDateInput?: string
): Promise<SupervisorReportDashboardData> {
  const selectedDate = parseDashboardDate(selectedDateInput);
  const monthStart = new Date(Date.UTC(selectedDate.year, selectedDate.month - 1, 1));
  const nextMonthStart = new Date(Date.UTC(selectedDate.year, selectedDate.month, 1));
  const daysInMonth = new Date(
    Date.UTC(selectedDate.year, selectedDate.month, 0)
  ).getUTCDate();

  const selectedDateValue = new Date(
    Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day)
  );
  const nextSelectedDateValue = new Date(
    Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day + 1)
  );
  const expectedReports = getExpectedSupervisorReportsForMonth(
    selectedDate.year,
    selectedDate.month
  );
  const standardWorkingDays = getStandardSupervisorWorkingDaysInMonth(
    selectedDate.year,
    selectedDate.month
  );

  try {
    const allowedDischargeRegions = await getSupervisorDashboardAllowedRegions(
      supervisorId,
      selectedDateValue
    );

    const [submissions, dischargeEntries] = await Promise.all([
      prisma.dailyReportSubmission.findMany({
        where: {
          supervisorId,
          reportDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          reportDate: true,
          roundNumber: true,
        },
        orderBy: [{ reportDate: "asc" }, { roundNumber: "asc" }],
      }),
      prisma.dischargeReportEntry.findMany({
        where: {
          ...(allowedDischargeRegions.length === 0 ? { supervisorId } : {}),
          dischargeDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          dischargeDate: true,
          area: true,
          roomNumber: true,
        },
        orderBy: [
          { dischargeDate: "asc" },
          { area: "asc" },
          { roomNumber: "asc" },
        ],
      }),
    ]);
  const scopedDischargeEntries = filterDischargeEntriesByAllowedRegions(
    dischargeEntries,
    allowedDischargeRegions
  );

  const roundsByDate = new Map<string, string[]>();
  for (const submission of submissions) {
    const dateKey = getDateKey(submission.reportDate);
    const rounds = roundsByDate.get(dateKey) || [];
    rounds.push(submission.roundNumber);
    roundsByDate.set(dateKey, rounds);
  }

  const dailyBreakdown = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = formatDateKey(selectedDate.year, selectedDate.month, day);
    return buildDailyMonitor(dateKey, roundsByDate.get(dateKey) || []);
  });

  const completedRequiredReports = dailyBreakdown.reduce(
    (total, day) => total + day.completedRequiredReports,
    0
  );
  const optionalReports = dailyBreakdown.reduce(
    (total, day) => total + day.optionalReports,
    0
  );
  const totalCompletedReports = dailyBreakdown.reduce(
    (total, day) => total + day.totalCompletedReports,
    0
  );
  const dailyDischargeEntries = scopedDischargeEntries.filter(
    (entry) =>
      entry.dischargeDate >= selectedDateValue &&
      entry.dischargeDate < nextSelectedDateValue
  );
  const dailyDischargeBreakdown = buildDischargeBreakdown(dailyDischargeEntries);
  const monthlyDischargeBreakdown = buildDischargeBreakdown(scopedDischargeEntries);

  return {
    selectedDate: selectedDate.label,
    daily:
      dailyBreakdown.find((day) => day.date === selectedDate.label) ||
      buildDailyMonitor(selectedDate.label, []),
    monthly: {
      year: selectedDate.year,
      month: selectedDate.month,
      label: formatMonthLabel(selectedDate.year, selectedDate.month),
      standardWorkingDays,
      expectedReports,
      completedRequiredReports,
      optionalReports,
      totalCompletedReports,
      remainingReports: Math.max(0, expectedReports - completedRequiredReports),
      achievementRate: calculateAchievementPercentage(
        completedRequiredReports,
        expectedReports
      ),
      averageRequiredReportsPerStandardDay:
        standardWorkingDays > 0
          ? roundToTwo(completedRequiredReports / standardWorkingDays)
          : 0,
      dailyBreakdown,
    },
    discharge: {
      dailyTotal: dailyDischargeBreakdown.reduce((total, row) => total + row.count, 0),
      monthlyTotal: monthlyDischargeBreakdown.reduce(
        (total, row) => total + row.count,
        0
      ),
      dailyBreakdown: dailyDischargeBreakdown,
      monthlyBreakdown: monthlyDischargeBreakdown,
    },
  };
  } catch (error: unknown) {
    logSanitizedDatabaseError("supervisor-dashboard data", error);

    return {
      selectedDate: selectedDate.label,
      daily: buildDailyMonitor(selectedDate.label, []),
      monthly: {
        year: selectedDate.year,
        month: selectedDate.month,
        label: formatMonthLabel(selectedDate.year, selectedDate.month),
        standardWorkingDays,
        expectedReports,
        completedRequiredReports: 0,
        optionalReports: 0,
        totalCompletedReports: 0,
        remainingReports: expectedReports,
        achievementRate: 0,
        averageRequiredReportsPerStandardDay: 0,
        dailyBreakdown: Array.from({ length: daysInMonth }, (_, index) =>
          buildDailyMonitor(
            formatDateKey(selectedDate.year, selectedDate.month, index + 1),
            []
          )
        ),
      },
      discharge: {
        dailyTotal: 0,
        monthlyTotal: 0,
        dailyBreakdown: [],
        monthlyBreakdown: [],
      },
    };
  }
}
