"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { PremiumTable } from "@/components/PremiumTable";
import { Attendance } from "@/types";
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
        absentCount: number;
        vacationCount: number;
        dayOffCount: number;
    };
    lowStockItems: { nameEn: string; qty: number; location: string }[];
    workersByRegion: { name: string; value: number }[];
    topStockItems: { name: string; value: number }[];
    attendanceTrend: { date: string; count: number }[];
    todayAttendance: Attendance[];
}

// Icons matching the mockup style
const Icons = {
    Workers: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    Time: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Present: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    Requests: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>, // Reuse clock or similar for pending
    Absent: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
    Vacation: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h5" /><path d="M22 12h-5" /><path d="M12 2a5 5 0 0 0-5 5v2a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5Z" /><path d="M12 14v8" /><path d="M8 22h8" /></svg>,
    DayOff: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5 2 12l2.5 2.5" /><path d="M19.5 9.5 22 12l-2.5 2.5" /><path d="M9 4v16" /><path d="M15 4v16" /></svg>
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

    // State for modal
    const [selectedStat, setSelectedStat] = useState<{ title: string; data: Attendance[] } | null>(null);

    const handleStatClick = (title: string, statusFilter: string) => {
        const filtered = data.todayAttendance.filter((a: Attendance) => a.status === statusFilter);
        setSelectedStat({ title, data: filtered });
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">KPI Stats</h1>
            </div>

            {/* Top Row: Metric Cards - Real Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Active Workers"
                    value={data.metrics.activeWorkers}
                    icon={Icons.Workers}
                    delay={0}
                    href="/manpower?tab=workers"
                />
                <StatCard
                    title="Present Today"
                    value={data.metrics.presentCount}
                    icon={Icons.Present}
                    delay={0.1}
                    onClick={() => handleStatClick("Present Workers", "Present")}
                />
                <StatCard
                    title="Absent Today"
                    value={data.metrics.absentCount}
                    icon={Icons.Absent}
                    delay={0.2}
                    onClick={() => handleStatClick("Absent Workers", "Absent")}
                />
                <StatCard
                    title="On Vacation"
                    value={data.metrics.vacationCount}
                    icon={Icons.Vacation}
                    delay={0.3}
                    onClick={() => handleStatClick("Workers on Vacation", "Vacation")}
                />
                <StatCard
                    title="Day Off"
                    value={data.metrics.dayOffCount}
                    icon={Icons.DayOff}
                    delay={0.4}
                    onClick={() => handleStatClick("Workers on Day Off", "Day Off")}
                />
                <StatCard
                    title="Attendance Rate"
                    value={`${data.metrics.attendanceRate}%`}
                    icon={Icons.Time}
                    delay={0.5}
                    href="/manpower"
                />
                <StatCard
                    title="Pending Requests"
                    value={data.metrics.pendingRequests}
                    icon={Icons.Requests}
                    delay={0.6}
                    href="/warehouse"
                />
                <StatCard
                    title="Low Stock Items"
                    value={data.metrics.lowStockCount}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /></svg>}
                    delay={0.7}
                    href="/warehouse"
                />
            </div>

            {/* Drill Down Modal */}
            {selectedStat && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-900">{selectedStat.title}</h3>
                            <button
                                onClick={() => setSelectedStat(null)}
                                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-0 overflow-y-auto flex-1">
                            {selectedStat.data.length > 0 ? (
                                <PremiumTable
                                    columns={[
                                        {
                                            header: "Name",
                                            render: (row: Attendance) => <span className="font-medium text-slate-900">{row.worker?.name || "Unknown"}</span>
                                        },
                                        {
                                            header: "Role",
                                            render: (row: Attendance) => <span className="text-slate-600">{row.worker?.role || "-"}</span>
                                        },
                                        {
                                            header: "Region",
                                            render: (row: Attendance) => <span className="text-slate-600">{row.worker?.region || "-"}</span>
                                        },
                                        {
                                            header: "Shift",
                                            render: (row: Attendance) => <span className="text-slate-500 text-xs uppercase bg-slate-100 px-2 py-1 rounded">{row.worker?.shiftName || "-"}</span>
                                        },
                                        { header: "Notes", accessorKey: "notes" as const }
                                    ]}
                                    data={selectedStat.data}
                                />
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    No workers found in this category for today.
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button
                                onClick={() => setSelectedStat(null)}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 10 }} dy={10} interval={0} angle={-45} textAnchor="end" height={100} />
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
