
import { getProjects, getWarehouses, getRegions } from "@/app/actions/references";
import { notFound } from "next/navigation";

export default async function DebugDbPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }

    const projects = await getProjects();
    const warehouses = await getWarehouses();
    const regions = await getRegions();

    // Safety: Mask the password in the connection string
    const dbUrl = process.env.DATABASE_URL || "NOT_SET";
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":****@");

    return (
        <div className="p-10 font-mono text-sm space-y-8 bg-white min-h-screen text-slate-800">
            <h1 className="text-2xl font-bold border-b pb-4">Database Debugger</h1>

            <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <h3 className="font-bold mb-2">Environment Check</h3>
                <p><strong>Database URL:</strong> {maskedUrl}</p>
                <p className="text-xs text-slate-500 mt-1">
                    (Check if this looks like the Direct Connection &apos;db.cofqikmt...&apos; or the old one)
                </p>
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
