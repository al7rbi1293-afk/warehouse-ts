"use client";

import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
} from "recharts";

interface DashboardData {
    metrics: {
        activeWorkers: number;
        attendanceRate: number;
        presentCount: number;
        pendingRequests: number;
        lowStockCount: number;
    };
    lowStockItems: { nameEn: string; qty: number; location: string }[];
    workersByRegion: { name: string; value: number }[];
    topStockItems: { name: string; value: number }[];
    attendanceTrend: { date: string; count: number }[];
}

const COLORS = ["#2e86de", "#54a0ff", "#00d2d3", "#10ac84", "#ee5253", "#f39c12"];

export function DashboardClient({ data }: { data: DashboardData }) {
    const { metrics, lowStockItems, workersByRegion, topStockItems, attendanceTrend } = data;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">📊 Executive Dashboard</h1>
                <p className="text-sm text-gray-500">🔄 Auto-refreshes every 30 seconds</p>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="metric-card">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">👷</span>
                        <div>
                            <div className="metric-value">{metrics.activeWorkers}</div>
                            <div className="metric-label">Active Workers</div>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">✅</span>
                        <div>
                            <div className="metric-value">{metrics.attendanceRate}%</div>
                            <div className="metric-label">
                                Attendance Rate ({metrics.presentCount} / {metrics.activeWorkers})
                            </div>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">📝</span>
                        <div>
                            <div className="metric-value">{metrics.pendingRequests}</div>
                            <div className="metric-label">Pending Requests</div>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">⚠️</span>
                        <div>
                            <div className="metric-value">{metrics.lowStockCount}</div>
                            <div className="metric-label">Low Stock Items</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Low Stock Alert */}
            {lowStockItems.length > 0 && (
                <div className="card mb-8 border-l-4 border-l-yellow-500">
                    <h3 className="font-bold text-lg mb-4">🚨 Low Stock Details ({lowStockItems.length} items)</h3>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Item Name</th>
                                    <th>Quantity</th>
                                    <th>Location</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockItems.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.nameEn}</td>
                                        <td>
                                            <span className="badge badge-warning">{item.qty}</span>
                                        </td>
                                        <td>{item.location}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Workers by Region */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">👥 Workers by Region</h3>
                    {workersByRegion.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={workersByRegion}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, value }) => `${name}: ${value}`}
                                >
                                    {workersByRegion.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-center text-gray-500 py-8">No worker data</div>
                    )}
                </div>

                {/* Top Stock Items */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📦 Top 10 Stock Items (NSTC)</h3>
                    {topStockItems.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={topStockItems} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} fontSize={12} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#2e86de" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-center text-gray-500 py-8">No stock data</div>
                    )}
                </div>
            </div>

            {/* Attendance Trend */}
            <div className="card">
                <h3 className="font-bold text-lg mb-4">📈 Attendance Trend (Last 7 Days)</h3>
                {attendanceTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={attendanceTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#2e86de"
                                strokeWidth={2}
                                dot={{ fill: "#2e86de", strokeWidth: 2 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="text-center text-gray-500 py-8">No attendance history</div>
                )}
            </div>
        </div>
    );
}
