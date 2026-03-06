import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedWarehouseData } from "@/lib/cached-data";
import { WarehouseClient } from "./WarehouseClient";

export default async function WarehousePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  const user = session.user;
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
