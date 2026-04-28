export type ReportReviewType = "daily" | "weekly" | "discharge";

export const REPORT_REVIEW_STATUSES = [
  "Submitted",
  "Accepted",
  "NeedsCorrection",
  "Rejected",
] as const;

export type ReportReviewStatus = (typeof REPORT_REVIEW_STATUSES)[number];

export interface ReportReviewScope {
  reportType: ReportReviewType;
  reportDate: Date | string;
  supervisorId: number;
  area?: string | null;
  roundNumber?: string | null;
}

export function isReportReviewStatus(value: string): value is ReportReviewStatus {
  return REPORT_REVIEW_STATUSES.includes(value as ReportReviewStatus);
}

export function getReportReviewDateLabel(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function normalizeReportReviewScope(scope: ReportReviewScope) {
  return {
    reportType: scope.reportType,
    reportDateLabel: getReportReviewDateLabel(scope.reportDate),
    supervisorId: scope.supervisorId,
    area: (scope.area || "").trim(),
    roundNumber: (scope.roundNumber || "").trim(),
  };
}

export function makeReportReviewKey(scope: ReportReviewScope) {
  const normalized = normalizeReportReviewScope(scope);
  return [
    normalized.reportType,
    normalized.reportDateLabel,
    normalized.supervisorId,
    normalized.area,
    normalized.roundNumber,
  ].join("::");
}

export function getReportReviewStatusLabel(status: ReportReviewStatus) {
  if (status === "NeedsCorrection") {
    return "Needs correction";
  }

  return status;
}
