import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCachedDashboardData } from "@/lib/cached-data";
import { getDefaultAuthenticatedPath, isManagerRole } from "@/lib/roles";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const searchParams = await props.searchParams;

  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (!isManagerRole(session.user.role)) {
    redirect(getDefaultAuthenticatedPath(session.user.role));
  }

  const data = await getCachedDashboardData(searchParams.date);

  return <DashboardClient data={data} />;
}
