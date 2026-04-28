export type AppRole =
    | "manager"
    | "admin"
    | "supervisor"
    | "night_supervisor"
    | "senior"
    | "storekeeper";

export type ReportTabKey = "daily" | "weekly" | "discharge";

export const MANAGER_ROLES = new Set<string>(["manager", "admin"]);
export const STANDARD_SUPERVISOR_ROLES = new Set<string>([
    "supervisor",
    "night_supervisor",
]);
export const DISCHARGE_OPERATOR_ROLES = new Set<string>([
    "supervisor",
    "night_supervisor",
    "senior",
]);
export const REPORT_ACCESS_ROLES = new Set<string>([
    "manager",
    "admin",
    "supervisor",
    "night_supervisor",
    "senior",
]);

export function isManagerRole(role?: string | null) {
    return !!role && MANAGER_ROLES.has(role);
}

export function isStandardSupervisorRole(role?: string | null) {
    return !!role && STANDARD_SUPERVISOR_ROLES.has(role);
}

export function isDischargeOperatorRole(role?: string | null) {
    return !!role && DISCHARGE_OPERATOR_ROLES.has(role);
}

export function canAccessWarehouse(role?: string | null) {
    return role === "manager" || role === "supervisor" || role === "storekeeper";
}

export function canAccessManpower(role?: string | null) {
    return role === "manager" || role === "supervisor";
}

export function canAccessReports(role?: string | null) {
    return !!role && REPORT_ACCESS_ROLES.has(role);
}

export function canAccessReportTab(role: string | null | undefined, tab: ReportTabKey) {
    if (isManagerRole(role)) {
        return true;
    }

    if (role === "senior") {
        return tab === "discharge";
    }

    return isStandardSupervisorRole(role);
}

export function getDefaultAuthenticatedPath(role?: string | null) {
    if (isManagerRole(role)) {
        return "/dashboard";
    }

    if (role === "senior") {
        return "/reports";
    }

    if (isStandardSupervisorRole(role)) {
        return "/dashboard";
    }

    if (canAccessWarehouse(role)) {
        return "/warehouse";
    }

    if (canAccessReports(role)) {
        return "/reports";
    }

    return "/login";
}
