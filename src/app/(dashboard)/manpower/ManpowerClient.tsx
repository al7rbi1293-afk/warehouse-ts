"use client";

import { useState, useMemo } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { ManpowerData, Attendance, DailyReport, Worker } from "@/types";
import { WorkerModal } from "@/components/WorkerModal";
import { deleteWorker } from "@/app/actions/manpower";
import { toast } from "sonner";

interface Props {
    data: ManpowerData;
    userRole?: string;
    userName?: string;
    userRegion?: string | null;
    userShiftId?: number | null;
    userShiftName?: string | null;
}

export function ManpowerClient({ data }: Props) {
    const [activeTab, setActiveTab] = useState("attendance");
    const [searchTerm, setSearchTerm] = useState("");

    // Aggregate attendance data for the table
    const dailyReports = useMemo(() => {
        if (!data.allAttendance) return [];

        // Group by date, region, shift
        // This is a simplified mock aggregation for visual purposes based on the passed data
        // In a real scenario, this aggregation might happen on the server or be more complex

        // Mocking aggregated rows for display if raw data isn't pre-aggregated
        // Using the raw attendance to create summary rows
        const grouped = new Map<string, DailyReport>();

        data.allAttendance.forEach((record: Attendance) => {
            const dateStr = new Date(record.date).toLocaleDateString();
            const region = record.worker?.region || "Unknown";
            const shiftId = (record.shiftId || "General").toString();
            const key = `${dateStr}-${region}-${shiftId}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    id: key,
                    date: dateStr,
                    region: region,
                    shift: shiftId,
                    totalWorkers: 0,
                    presentCount: 0,
                    absentCount: 0
                });
            }

            const group = grouped.get(key)!;
            group.totalWorkers++;
            if (record.status === "Present") group.presentCount++;
            if (record.status === "Absent") group.absentCount++;
        });

        // If no data, return empty array
        return Array.from(grouped.values());

    }, [data.allAttendance]);

    const attendanceColumns = [
        { header: "Date", accessorKey: "date" as const },
        { header: "Region", accessorKey: "region" as const },
        {
            header: "Total Workers", accessorKey: "totalWorkers" as const, render: (row: DailyReport) => (
                <span className="font-semibold text-slate-700">{row.totalWorkers}</span>
            )
        },
        {
            header: "Present", accessorKey: "presentCount" as const, render: (row: DailyReport) => (
                <span className="text-green-600 font-bold">{row.presentCount}</span>
            )
        },
        {
            header: "Absent", accessorKey: "absentCount" as const, render: (row: DailyReport) => (
                <span className="text-red-500">{row.absentCount}</span>
            )
        },
    ];

    const workerColumns = [
        {
            header: "Name", accessorKey: "name" as const, render: (row: Worker) => (
                <span className="font-medium text-slate-900">{row.name}</span>
            )
        },
        { header: "ID", accessorKey: "empId" as const },
        { header: "Role", accessorKey: "role" as const },
        { header: "Region", accessorKey: "region" as const },
        {
            header: "Shift", accessorKey: "shiftName" as const, render: (row: Worker) => (
                <span className="px-2 py-1 rounded bg-slate-100 text-xs text-slate-600">{row.shiftName || "-"}</span>
            )
        },
    ];

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

    // Handlers
    const handleAddWorker = () => {
        setEditingWorker(null);
        setIsModalOpen(true);
    };

    const handleEditWorker = (worker: Worker) => {
        setEditingWorker(worker);
        setIsModalOpen(true);
    };

    const handleDeleteWorker = async (id: number) => {
        if (confirm("Are you sure you want to delete this worker? This will also delete their attendance records.")) {
            try {
                // Determine if we need to call a server action. 
                // Since deleteWorker is a server action, we need to import it.
                // Dynamic import or passed prop would be better but let's assume we can import it.
                // We'll need to import deleteWorker at top of file.
                await deleteWorker(id);
                toast.success("Worker deleted successfully");
            } catch {
                toast.error("Failed to delete worker");
            }
        }
    };

    // Filter workers based on search
    const filteredWorkers = data.workers.filter(w =>
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.empId && w.empId.includes(searchTerm))
    );

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Manpower Reports</h1>
                    <p className="text-slate-500 text-sm">Track attendance and workforce dynamics</p>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm">
                    {["attendance", "workers"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {activeTab === "workers" && (
                    <button
                        onClick={handleAddWorker}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                        Add Worker
                    </button>
                )}
            </div>

            <div className="card-premium p-6">
                {/* Search Bar - Shared */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder={activeTab === "attendance" ? "Search reports..." : "Search workers..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-md px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>

                {activeTab === "attendance" && (
                    <PremiumTable
                        columns={attendanceColumns}
                        data={dailyReports}
                    />
                )}

                {activeTab === "workers" && (
                    <PremiumTable
                        columns={workerColumns}
                        data={filteredWorkers}
                        actions={(item) => (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleEditWorker(item as Worker)}
                                    className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDeleteWorker((item as Worker).id)}
                                    className="text-red-600 text-sm font-medium hover:underline flex items-center gap-1"
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    />
                )}
            </div>

            <WorkerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                worker={editingWorker}
                shifts={data.shifts}
                regions={data.regions}
                onSuccess={() => { }}
            />
        </div>
    );
}
