"use client";

import { useState } from "react";

type ReportTab = "daily" | "weekly" | "discharge";

const tabConfig: Record<
    ReportTab,
    {
        label: string;
        title: string;
        description: string;
        placeholders: string[];
    }
> = {
    daily: {
        label: "Daily report",
        title: "Daily report",
        description: "Track day-by-day operational updates and performance snapshots.",
        placeholders: [
            "Daily attendance summary",
            "Daily inventory activity",
            "Daily pending actions",
        ],
    },
    weekly: {
        label: "Weekly report",
        title: "Weekly report",
        description: "Review weekly trends, totals, and exception patterns.",
        placeholders: [
            "Weekly manpower overview",
            "Weekly stock movements",
            "Weekly request completion rate",
        ],
    },
    discharge: {
        label: "Discharge report",
        title: "Discharge report",
        description: "Monitor discharge-related records and completion details.",
        placeholders: [
            "Discharge request log",
            "Discharge status breakdown",
            "Discharge follow-up notes",
        ],
    },
};

const reportTabs: ReportTab[] = ["daily", "weekly", "discharge"];

export function ReportsClient() {
    const [activeTab, setActiveTab] = useState<ReportTab>("daily");
    const currentTab = tabConfig[activeTab];

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm">View daily, weekly, and discharge reports</p>
            </div>

            <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm min-w-max">
                    {reportTabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                        >
                            {tabConfig[tab].label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">{currentTab.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">{currentTab.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {currentTab.placeholders.map((item) => (
                        <div
                            key={item}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                        >
                            {item}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
