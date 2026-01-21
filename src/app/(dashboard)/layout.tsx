import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { DashboardContent } from "@/components/DashboardContent";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />
            <DashboardContent>
                <main className="flex-1 p-6">
                    {children}
                </main>
                <footer className="px-6 py-4 text-center text-xs text-slate-400 border-t border-slate-100">
                    COPYRIGHT © abdulaziz alhazmi AST.Project manager
                </footer>
            </DashboardContent>
        </div>
    );
}
