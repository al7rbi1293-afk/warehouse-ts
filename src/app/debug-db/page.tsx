
import { getProjects, getWarehouses, getRegions } from "@/app/actions/references";
import { getDatabaseHealth } from "@/lib/database-health";
import { notFound } from "next/navigation";

export default async function DebugDbPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }

    const health = await getDatabaseHealth();
    const projects = await getProjects();
    const warehouses = await getWarehouses();
    const regions = await getRegions();

    const environmentSummary = [
        { label: "DATABASE_URL", configured: Boolean(process.env.DATABASE_URL) },
        { label: "DIRECT_URL", configured: Boolean(process.env.DIRECT_URL) },
        { label: "NEXTAUTH_SECRET", configured: Boolean(process.env.NEXTAUTH_SECRET) },
        { label: "NEXTAUTH_URL", configured: Boolean(process.env.NEXTAUTH_URL) },
    ];

    return (
        <div className="p-10 font-mono text-sm space-y-8 bg-white min-h-screen text-slate-800">
            <h1 className="text-2xl font-bold border-b pb-4">Database Debugger</h1>

            <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <h3 className="font-bold mb-2">Environment Check</h3>
                <div className="space-y-1">
                    {environmentSummary.map(({ label, configured }) => (
                        <p key={label}>
                            <strong>{label}:</strong> {configured ? "configured" : "missing"}
                        </p>
                    ))}
                    <p>
                        <strong>Database Health:</strong> {health.status}
                        {health.reason ? ` (${health.reason})` : ""}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <section className="border p-4 rounded">
                    <h2 className="text-lg font-bold mb-2 text-blue-600">Projects ({projects.data?.length || 0})</h2>
                    <div className="bg-slate-50 p-2 rounded h-40 overflow-auto text-xs">
                        <pre>{JSON.stringify(projects, null, 2)}</pre>
                    </div>
                </section>

                <section className="border p-4 rounded">
                    <h2 className="text-lg font-bold mb-2 text-green-600">Warehouses ({warehouses.data?.length || 0})</h2>
                    <div className="bg-slate-50 p-2 rounded h-40 overflow-auto text-xs">
                        <pre>{JSON.stringify(warehouses, null, 2)}</pre>
                    </div>
                </section>

                <section className="border p-4 rounded">
                    <h2 className="text-lg font-bold mb-2 text-purple-600">Regions ({regions.data?.length || 0})</h2>
                    <div className="bg-slate-50 p-2 rounded h-40 overflow-auto text-xs">
                        <pre>{JSON.stringify(regions, null, 2)}</pre>
                    </div>
                </section>
            </div>
        </div>
    );
}
