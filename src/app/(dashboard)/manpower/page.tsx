import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubstituteZones } from "@/app/actions/staff";
import { getCachedManpowerData } from "@/lib/cached-data";
import { ManpowerClient } from "./ManpowerClient";

export default async function ManpowerPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  const user = session.user;
  const data = await getCachedManpowerData(user.role === "manager");

  let effectiveRegion = user.region || "";

  if (user.regions) {
    const regions = new Set([
      ...effectiveRegion
        .split(",")
        .map((region) => region.trim())
        .filter(Boolean),
      ...user.regions
        .split(",")
        .map((region) => region.trim())
        .filter(Boolean),
    ]);
    effectiveRegion = Array.from(regions).join(",");
  }

  if (user.role === "supervisor") {
    const today = new Date().toISOString().split("T")[0];
    const substituteResult = await getSubstituteZones(
      Number.parseInt(user.id, 10),
      today
    );

    if (
      substituteResult.success &&
      substituteResult.data &&
      substituteResult.data.length > 0
    ) {
      const currentRegions = effectiveRegion
        .split(",")
        .map((region) => region.trim())
        .filter(Boolean);
      const allRegions = new Set([...currentRegions, ...substituteResult.data]);
      effectiveRegion = Array.from(allRegions).join(",");
    }
  }

  return (
    <ManpowerClient
      data={data}
      userRole={user.role}
      userName={user.name || undefined}
      userRegion={effectiveRegion || undefined}
      userShiftId={user.shiftId || undefined}
      userShiftName={user.shiftName || undefined}
      userAllowedShifts={user.allowedShifts || undefined}
    />
  );
}
