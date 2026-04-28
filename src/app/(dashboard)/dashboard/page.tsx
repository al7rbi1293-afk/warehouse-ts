import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCachedDashboardData } from "@/lib/cached-data";
import { getDefaultAuthenticatedPath, isManagerRole, isStandardSupervisorRole } from "@/lib/roles";
import { getSupervisorReportDashboardData } from "@/lib/supervisor-report-dashboard";
import { DashboardClient } from "./DashboardClient";
import { SupervisorDashboard } from "./SupervisorDashboard";

export default async function DashboardPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const searchParams = await props.searchParams;

  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (isStandardSupervisorRole(session.user.role)) {
    const supervisorId = Number(session.user.id);

    if (!Number.isFinite(supervisorId)) {
      redirect(getDefaultAuthenticatedPath(session.user.role));
    }

    const data = await getSupervisorReportDashboardData(
      supervisorId,
      searchParams.date
    );

    return (
      <SupervisorDashboard
        data={data}
        supervisorName={session.user.name || session.user.username || ""}
      />
    );
  }

  if (!isManagerRole(session.user.role)) {
    redirect(getDefaultAuthenticatedPath(session.user.role));
  }

  const data = await getCachedDashboardData(searchParams.date);

  return <DashboardClient data={data} />;
}
