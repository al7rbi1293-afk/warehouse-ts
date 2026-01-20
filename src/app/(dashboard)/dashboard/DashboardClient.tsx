"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/StatCard";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Legend
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
    Money: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    Orders: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
};

export function DashboardClient({ data }: { data: DashboardData }) {
    const router = useRouter();

    // Sample Data for Charts (matching mockup visualization)
    const efficiencyData = [
        { name: 'Sun', value: 5 },
        { name: 'Mon', value: 25 },
        { name: 'Tue', value: 35 },
        { name: 'Wed', value: 45 },
        { name: 'Thu', value: 65 },
        { name: 'Fri', value: 80 },
        { name: 'Sat', value: 98 },
    ];

    const inventoryData = [
        { name: 'Category', value: 170 },
        { name: 'Category', value: 125 },
        { name: 'Item Category', value: 200 },
        { name: 'Shipping', value: 65 },
        { name: 'Tool', value: 120 },
        { name: 'Panel', value: 230 },
        { name: 'Item...', value: 135 },
        { name: 'Inventory', value: 155 },
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-12">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">KPI Stats</h1>
            </div>

            {/* Top Row: 4 Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Workers"
                    value={data.metrics.activeWorkers}
                    icon={Icons.Workers}
                    delay={0}
                />
                <StatCard
                    title="Attendance"
                    value={`${data.metrics.attendanceRate}%`}
                    icon={Icons.Time}
                    delay={0.1}
                />
                <StatCard
                    title="Cost"
                    value="$1,250,000"
                    icon={Icons.Money}
                    delay={0.2}
                />
                <StatCard
                    title="Orders Today"
                    value="1,500"
                    icon={Icons.Orders}
                    delay={0.3}
                />
            </div>

            {/* Middle Row: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Efficiency Trend */}
                <div className="card-premium p-6">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Weekly Efficiency Trend</h3>
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
                </div>

                {/* Inventory Distribution */}
                <div className="card-premium p-6">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Inventory Distribution</h3>
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
                </div>
            </div>

            {/* Bottom Row: Recent Activity Table */}
            <div className="card-premium overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-lg">Recent Activity</h3>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                        View All Activity
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#F8FAFC]">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Order #</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Award date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[
                                { id: "Order #12345", status: "Pending", date: "Apr 1, 2022" },
                                { id: "Order #12346", status: "Shipped", date: "Sep 1, 2022" },
                                { id: "Order #12347", status: "Shipped", date: "Sep 2, 2022" },
                            ].map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{row.id}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">{row.status}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{row.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
