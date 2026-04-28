export const OFFICIAL_ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Sick Leave",
  "Annual Leave",
  "Official Leave",
] as const;

export type OfficialAttendanceStatus =
  (typeof OFFICIAL_ATTENDANCE_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, OfficialAttendanceStatus> = {
  Present: "Present",
  Absent: "Absent",
  "Sick Leave": "Sick Leave",
  Vacation: "Annual Leave",
  "Annual Leave": "Annual Leave",
  "Day Off": "Official Leave",
  "Official Leave": "Official Leave",
  "Eid Holiday": "Official Leave",
};

export function normalizeAttendanceStatus(
  value: string | null | undefined
): OfficialAttendanceStatus | null {
  if (!value) {
    return null;
  }

  return LEGACY_STATUS_MAP[value] ?? null;
}

export function isUnavailableAttendanceStatus(
  value: string | null | undefined
): boolean {
  const normalized = normalizeAttendanceStatus(value);
  return normalized !== null && normalized !== "Present";
}

export function getAvailabilityFromStatus(
  value: string | null | undefined
): "available" | "unavailable" | "missing" {
  const normalized = normalizeAttendanceStatus(value);

  if (normalized === null) {
    return "missing";
  }

  return normalized === "Present" ? "available" : "unavailable";
}

export function formatAttendanceStatusLabel(
  value: string | null | undefined
): string {
  return normalizeAttendanceStatus(value) ?? "Missing";
}
