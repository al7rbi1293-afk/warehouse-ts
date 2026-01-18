"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    Legend,
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

interface Props {
    data: DashboardData;
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

export function DashboardClient({ data }: Props) {
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Auto refresh every 30 seconds
    const refreshData = useCallback(() => {
        router.refresh();
        setLastRefresh(new Date());
    }, [router]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            refreshData();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [autoRefresh, refreshData]);

    return (
        <div className="space-y-6">
            {/* Header with Refresh Controls */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">📊 Executive Dashboard</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                        آخر تحديث: {lastRefresh.toLocaleTimeString()}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded"
                        />
                        <span className="text-sm">Auto-refresh</span>
                    </label>
                    <button
                        onClick={refreshData}
                        className="btn text-sm flex items-center gap-2"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    title="Active Workers"
                    value={data.metrics.activeWorkers}
                    icon="👷"
                    color="blue"
                />
                <MetricCard
                    title="Today's Attendance"
                    value={`${data.metrics.attendanceRate}%`}
                    subtitle={`${data.metrics.presentCount} present`}
                    icon="📋"
                    color="green"
                />
                <MetricCard
                    title="Pending Requests"
                    value={data.metrics.pendingRequests}
                    icon="⏳"
                    color={data.metrics.pendingRequests > 0 ? "yellow" : "green"}
                    alert={data.metrics.pendingRequests > 5}
                />
                <MetricCard
                    title="Low Stock Items"
                    value={data.metrics.lowStockCount}
                    icon="⚠️"
                    color={data.metrics.lowStockCount > 0 ? "red" : "green"}
                    alert={data.metrics.lowStockCount > 0}
                />
            </div>

            {/* Low Stock Alerts */}
            {data.lowStockItems.length > 0 && (
                <div className="card border-l-4 border-red-500 bg-red-50">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🚨</span>
                        <h3 className="font-bold text-red-700">Low Stock Alert ({data.lowStockItems.length} items)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table text-sm">
                            <thead>
                                <tr className="bg-red-100">
                                    <th>Item</th>
                                    <th>Current Qty</th>
                                    <th>Location</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.lowStockItems.slice(0, 5).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-red-50">
                                        <td className="font-medium">{item.nameEn}</td>
                                        <td>
                                            <span className="badge badge-error">{item.qty}</span>
                                        </td>
                                        <td>{item.location}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data.lowStockItems.length > 5 && (
                            <p className="text-sm text-red-600 mt-2">
                                +{data.lowStockItems.length - 5} more items
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Workers by Region */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">👷 Workers by Region</h3>
                    <div className="h-64">
                        {data.workersByRegion.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.workersByRegion}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ name, value }) => `${name}: ${value}`}
                                    >
                                        {data.workersByRegion.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                No data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Top Stock Items */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📦 Top 10 Stock Items (NSTC)</h3>
                    <div className="h-64">
                        {data.topStockItems.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={data.topStockItems}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                No data available
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Attendance Trend */}
            <div className="card">
                <h3 className="font-bold text-lg mb-4">📈 Attendance Trend (Last 7 Days)</h3>
                <div className="h-64">
                    {data.attendanceTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.attendanceTrend}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="count"
                                    name="Present"
                                    stroke="#10B981"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            No attendance data for the past 7 days
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats Summary */}
            <div className="card bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                <h3 className="font-bold text-lg mb-4">📊 Quick Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-blue-100 text-sm">Total Workers</p>
                        <p className="text-3xl font-bold">{data.metrics.activeWorkers}</p>
                    </div>
                    <div>
                        <p className="text-blue-100 text-sm">Attendance Rate</p>
                        <p className="text-3xl font-bold">{data.metrics.attendanceRate}%</p>
                    </div>
                    <div>
                        <p className="text-blue-100 text-sm">Regions</p>
                        <p className="text-3xl font-bold">{data.workersByRegion.length}</p>
                    </div>
                    <div>
                        <p className="text-blue-100 text-sm">Stock Items</p>
                        <p className="text-3xl font-bold">{data.topStockItems.length > 0 ? "214+" : "0"}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Metric Card Component
function MetricCard({
    title,
    value,
    subtitle,
    icon,
    color,
    alert = false,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    color: "blue" | "green" | "yellow" | "red";
    alert?: boolean;
}) {
    const colorClasses = {
        blue: "bg-blue-50 border-blue-200 text-blue-700",
        green: "bg-green-50 border-green-200 text-green-700",
        yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
        red: "bg-red-50 border-red-200 text-red-700",
    };

    return (
        <div
            className={`card border-2 ${colorClasses[color]} ${alert ? "animate-pulse" : ""
                }`}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm opacity-75">{title}</p>
                    <p className="text-3xl font-bold">{value}</p>
                    {subtitle && <p className="text-xs opacity-60">{subtitle}</p>}
                </div>
                <span className="text-3xl">{icon}</span>
            </div>
        </div>
    );
}
