import { prisma } from "@/lib/prisma";

export default async function TestPage() {
    let data = null;
    let error = null;

    try {
        const [inventory, workers, shifts] = await Promise.all([
            prisma.inventory.findMany({ take: 10, where: { location: "NSTC" } }),
            prisma.worker.findMany({ take: 10 }),
            prisma.shift.findMany(),
        ]);
        data = { inventory, workers, shifts };
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    if (error) {
        return (
            <div style={{ padding: 20 }}>
                <h1>❌ Error</h1>
                <pre style={{ background: "#fee", padding: 10 }}>{error}</pre>
            </div>
        );
    }

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <h1>✅ Database Test Page</h1>

            <h2>📦 Inventory ({data?.inventory?.length || 0} items)</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                    <tr style={{ background: "#eee" }}>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>ID</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Name</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Qty</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Location</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.inventory?.map((item) => (
                        <tr key={item.id}>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{item.id}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{item.nameEn}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{item.qty}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{item.location}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h2>👷 Workers ({data?.workers?.length || 0} workers)</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                    <tr style={{ background: "#eee" }}>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>ID</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Name</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Region</th>
                        <th style={{ border: "1px solid #ccc", padding: 8 }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.workers?.map((w) => (
                        <tr key={w.id}>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{w.id}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{w.name}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{w.region}</td>
                            <td style={{ border: "1px solid #ccc", padding: 8 }}>{w.status}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h2>⏰ Shifts ({data?.shifts?.length || 0} shifts)</h2>
            <ul>
                {data?.shifts?.map((s) => (
                    <li key={s.id}>{s.name} ({s.startTime} - {s.endTime})</li>
                ))}
            </ul>
        </div>
    );
}
