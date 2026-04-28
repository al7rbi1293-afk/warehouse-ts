import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ReportsClient } from "./ReportsClient";
import { canAccessReports, getDefaultAuthenticatedPath } from "@/lib/roles";

export default async function ReportsPage(props: {
    searchParams: Promise<{ date?: string }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    if (!canAccessReports(session.user.role)) {
        redirect(getDefaultAuthenticatedPath(session.user.role));
    }

    return (
        <ReportsClient
            userId={Number(session.user.id)}
            userRole={session.user.role}
            userName={session.user.name || ""}
            initialReportDate={searchParams.date}
        />
    );
}
