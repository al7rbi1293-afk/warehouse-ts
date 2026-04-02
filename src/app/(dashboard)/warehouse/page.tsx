import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCachedWarehouseData } from "@/lib/cached-data";
import { WarehouseClient } from "./WarehouseClient";
import { canAccessWarehouse, getDefaultAuthenticatedPath } from "@/lib/roles";

export default async function WarehousePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  const user = session.user;
  if (!canAccessWarehouse(user.role)) {
    redirect(getDefaultAuthenticatedPath(user.role));
  }

  const data = await getCachedWarehouseData(user.role, user.name || "");

  return (
    <WarehouseClient
      data={data}
      userRole={user.role}
      userName={user.name || ""}
      userRegion={user.region}
    />
  );
}
