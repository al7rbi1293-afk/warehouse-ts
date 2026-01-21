"use client";

import Link from "next/link";


import { StatCard } from "@/components/StatCard";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar
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

// Icons matching the mockup style
const Icons = {
    Workers: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    Time: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Present: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    Requests: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> // Reuse clock or similar for pending
};

export function DashboardClient({ data }: { data: DashboardData }) {

    // Use Real Data for Charts if available, or simplified view
    // Using filtered inventory for Top Items distribution if available, else existing logic
    const inventoryData = data.topStockItems.length > 0 ? data.topStockItems : [];

    // Attendance Trend
    const efficiencyData = data.attendanceTrend.map(t => ({
        name: new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' }),
        value: t.count
    })).reverse(); // Assuming API returns desc

    return (
        <div className="space-y-8 animate-fade-in pb-12">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">KPI Stats</h1>
            </div>

            {/* Top Row: 4 Metric Cards - REAL DATA ONLY */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard
                    title="Active Workers"
                    value={data.metrics.activeWorkers}
                    icon={Icons.Workers}
                    delay={0}
                    href="/manpower"
                />
                <StatCard
                    title="Attendance Rate"
                    value={`${data.metrics.attendanceRate}%`}
                    icon={Icons.Time}
                    delay={0.1}
                    href="/manpower"
                />
                <StatCard
                    title="Present Today"
                    value={data.metrics.presentCount}
                    icon={Icons.Present}
                    delay={0.2}
                    href="/manpower"
                />
                <StatCard
                    title="Pending Requests"
                    value={data.metrics.pendingRequests}
                    icon={Icons.Requests}
                    delay={0.3}
                    href="/warehouse"
                />
                <StatCard
                    title="Low Stock Items"
                    value={data.metrics.lowStockCount}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /></svg>}
                    delay={0.4}
                    href="/warehouse"
                />
            </div>

            {/* Middle Row: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Efficiency Trend -> Actual Attendance Trend */}
                <div className="card-premium p-6">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Attendance Trend (Last 7 Days)</h3>
                    {efficiencyData.length > 0 ? (
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={efficiencyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, fill: "#2563EB", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[250px] w-full flex items-center justify-center text-slate-400">
                            No attendance data available yet.
                        </div>
                    )}
                </div>

                {/* Inventory Distribution -> Real Stock Data */}
                <div className="card-premium p-6">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Top Inventory Items</h3>
                    {inventoryData.length > 0 ? (
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={inventoryData} barGap={8}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} dy={10} interval={0} angle={-45} textAnchor="end" height={60} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[250px] w-full flex items-center justify-center text-slate-400">
                            No inventory data available.
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row: Recent Low Stock Alerts (More relevant than fake orders) */}
            {data.lowStockItems.length > 0 && (
                <div className="card-premium overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <Link href="/warehouse" className="font-bold text-slate-800 text-lg hover:text-blue-600 transition-colors">
                            Low Stock Alerts
                        </Link>
                        <span className="text-red-500 font-medium text-sm">Requires Attention</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[#F8FAFC]">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.lowStockItems.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.nameEn}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{item.location}</td>
                                        <td className="px-6 py-4 text-sm text-red-600 font-bold">{item.qty} (Low)</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
