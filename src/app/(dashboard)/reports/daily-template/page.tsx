import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDailyReportTemplate } from "@/app/actions/reportQuestionnaire";
import { DailyTemplateEditorClient } from "./DailyTemplateEditorClient";

const allowedRoles = new Set(["manager", "admin"]);

export default async function DailyTemplatePage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    if (!allowedRoles.has(session.user.role)) {
        redirect("/reports");
    }

    const result = await getDailyReportTemplate();
    const sections = result.success && result.data ? result.data.sections : [];
    const updatedAt = result.success && result.data ? result.data.updatedAt : null;

    return (
        <DailyTemplateEditorClient
            initialSections={sections}
            updatedAt={updatedAt}
        />
    );
}

