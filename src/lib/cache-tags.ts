import { revalidatePath, updateTag } from "next/cache";

export const CACHE_TAGS = {
  dashboard: "dashboard",
  warehouse: "warehouse",
  manpower: "manpower",
  references: "references",
  reports: "reports",
} as const;

function revalidateTags(tags: string[]) {
  for (const tag of tags) {
    updateTag(tag);
  }
}

export function revalidateDashboardData() {
  revalidateTags([CACHE_TAGS.dashboard]);
  revalidatePath("/dashboard");
}

export function revalidateWarehouseData() {
  revalidateTags([
    CACHE_TAGS.warehouse,
    CACHE_TAGS.references,
    CACHE_TAGS.dashboard,
  ]);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");
}

export function revalidateManpowerData() {
  revalidateTags([
    CACHE_TAGS.manpower,
    CACHE_TAGS.references,
    CACHE_TAGS.dashboard,
  ]);
  revalidatePath("/manpower");
  revalidatePath("/dashboard");
}

export function revalidateReferenceData() {
  revalidateTags([
    CACHE_TAGS.references,
    CACHE_TAGS.manpower,
    CACHE_TAGS.warehouse,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.reports,
  ]);
  revalidatePath("/settings");
  revalidatePath("/manpower");
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export function revalidateReportsData() {
  revalidateTags([
    CACHE_TAGS.reports,
    CACHE_TAGS.dashboard,
  ]);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}
