import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ReportsClient } from "./ReportsClient";

const allowedRoles = new Set(["manager", "admin", "supervisor", "night_supervisor"]);

export default async function ReportsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    if (!allowedRoles.has(session.user.role)) {
        redirect("/warehouse");
    }

    return <ReportsClient userRole={session.user.role} />;
}
