import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ReportsClient } from "./ReportsClient";
import { canAccessReports, getDefaultAuthenticatedPath } from "@/lib/roles";

export default async function ReportsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    if (!canAccessReports(session.user.role)) {
        redirect(getDefaultAuthenticatedPath(session.user.role));
    }

    return <ReportsClient userRole={session.user.role} userName={session.user.name || ""} />;
}
