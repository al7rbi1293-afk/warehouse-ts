import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedDashboardData } from "@/lib/cached-data";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const searchParams = await props.searchParams;

  await getServerSession(authOptions);

  const data = await getCachedDashboardData(searchParams.date);

  return <DashboardClient data={data} />;
}
