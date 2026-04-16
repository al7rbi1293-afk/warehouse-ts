import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getDefaultAuthenticatedPath, isManagerRole } from "@/lib/roles";
import { getWarehouseKpiDataset } from "@/lib/warehouse-kpi";

import { WarehouseKpiClient } from "./WarehouseKpiClient";

export default async function WarehouseKpiPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  if (!isManagerRole(session.user.role)) {
    redirect(getDefaultAuthenticatedPath(session.user.role));
  }

  const data = await getWarehouseKpiDataset();

  return <WarehouseKpiClient data={data} />;
}
