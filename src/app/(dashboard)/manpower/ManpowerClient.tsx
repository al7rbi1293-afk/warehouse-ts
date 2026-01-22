"use client";

import { useState, useMemo } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { ManpowerData, Attendance, DailyReport, Worker, User } from "@/types";
import { WorkerModal } from "@/components/WorkerModal";
import { deleteWorker, submitBulkAttendance } from "@/app/actions/manpower";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { UserManagement } from "@/components/UserManagement";

interface Props {
    data: ManpowerData & { allUsers?: User[] };
    userRole?: string;
    userName?: string;
    userRegion?: string | null;
    userShiftId?: number | null;
    userShiftName?: string | null;
}

export function ManpowerClient({ data, userRole = "manager", userName = "Admin", userRegion, userShiftId }: Props) {
    const router = useRouter();
    // Default tab based on role? Or just default to Reports
    const [activeTab, setActiveTab] = useState("reports");
    const [searchTerm, setSearchTerm] = useState("");

    // Parse supervisor regions
    const supervisorRegions = useMemo(() => {
        if (!userRegion) return [];
        return userRegion.split(",").map(r => r.trim());
    }, [userRegion]);

    // Attendance Marking State
    const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
    // Initialize region: if multiple regions, default to "All", otherwise specific region or "All"
    const [selectedRegion, setSelectedRegion] = useState<string>(
        userRegion && !userRegion.includes(",") ? userRegion : "All"
    );
    const [selectedShift, setSelectedShift] = useState<string>(userShiftId ? userShiftId.toString() : "All");

    // Filter available regions for dropdown
    const availableRegions = useMemo(() => {
        if (userRole !== "supervisor" || supervisorRegions.length === 0) return data.regions;
        return data.regions.filter(r => supervisorRegions.includes(r.name));
    }, [data.regions, userRole, supervisorRegions]);

    // Track attendance overrides: { [date]: { [workerId]: { status?: string; notes?: string } } }
    const [attendanceBuffer, setAttendanceBuffer] = useState<Record<string, Record<number, { status?: string; notes?: string }>>>({});

    // Helper to get effective status
    const getWorkerStatus = (workerId: number) => {
        // 1. Check local override
        if (attendanceBuffer[attendanceDate]?.[workerId]?.status) return attendanceBuffer[attendanceDate][workerId].status!;

        // 2. Check existing DB record
        const existing = data.allAttendance?.find(a =>
            a.workerId === workerId &&
            new Date(a.date).toISOString().split('T')[0] === attendanceDate
        );
        if (existing) return existing.status || "Present";

        // 3. Default
        return "Present";
    };

    const getWorkerNotes = (workerId: number) => {
        if (attendanceBuffer[attendanceDate]?.[workerId]?.notes !== undefined) return attendanceBuffer[attendanceDate][workerId].notes!;

        const existing = data.allAttendance?.find(a =>
            a.workerId === workerId &&
            new Date(a.date).toISOString().split('T')[0] === attendanceDate
        );
        return existing?.notes || "";
    };

    // Handle single worker status change
    const handleStatusChange = (workerId: number, status: string) => {
        setAttendanceBuffer(prev => ({
            ...prev,
            [attendanceDate]: {
                ...(prev[attendanceDate] || {}),
                [workerId]: { ...(prev[attendanceDate]?.[workerId] || {}), status }
            }
        }));
    };

    const handleNotesChange = (workerId: number, notes: string) => {
        setAttendanceBuffer(prev => ({
            ...prev,
            [attendanceDate]: {
                ...(prev[attendanceDate] || {}),
                [workerId]: { ...(prev[attendanceDate]?.[workerId] || {}), notes }
            }
        }));
    };

    // Consolidated Worker Filtering Logic
    const attendanceWorkers = useMemo(() => {
        return data.workers.filter(w => {
            // 1. Region Filter
            if (userRole === "supervisor") {
                // If specific region selected, match it
                if (selectedRegion !== "All" && w.region !== selectedRegion) return false;
                // If "All" selected, ensuring worker is in one of the supervisor's allowed regions
                if (selectedRegion === "All" && (!w.region || !supervisorRegions.includes(w.region))) return false;
            } else {
                // Manager/Admin
                if (selectedRegion !== "All" && w.region !== selectedRegion) return false;
            }

            // 2. Shift Filter with Mapping
            if (selectedShift !== "All") {
                const selectedShiftObj = data.shifts.find(s => s.id.toString() === selectedShift);
                if (selectedShiftObj) {
                    const name = selectedShiftObj.name;
                    let targetNames = [name];

                    // Specific logic: A/A2 -> A1, B -> B1
                    if (name === "A" || name === "A2") targetNames = ["A1"];
                    else if (name === "B") targetNames = ["B1"];

                    if (!w.shiftName || !targetNames.includes(w.shiftName)) return false;
                }
            }

            // 3. Search
            if (searchTerm && !w.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !(w.empId && w.empId.includes(searchTerm))) return false;

            return true;
        });
    }, [data.workers, selectedRegion, selectedShift, searchTerm, userRole, supervisorRegions, data.shifts]);


    const handleSubmitAttendance = async () => {
        if (!confirm(`Submit attendance for ${attendanceDate}? Previous records for this date/shift/region will be overwritten.`)) return;

        const currentWorkers = attendanceWorkers;

        if (currentWorkers.length === 0) {
            toast.error("No workers to submit attendance for.");
            return;
        }

        const attendanceData = currentWorkers.map(w => ({
            workerId: w.id,
            status: getWorkerStatus(w.id) || "Present", // Ensure string logic
            notes: getWorkerNotes(w.id)
        }));

        try {
            const targetShiftId = parseInt(selectedShift);

            // Allow submission even if "All" is selected, defaulting to 0 or handling on backend?
            // If "All" is selected (NaN), we can't delete previous by shift effectively without looping.
            // For now, warn if specific shift not selected to avoid data loss issues or complexity.
            if (isNaN(targetShiftId)) {
                toast.error("Please select a specific shift to submit attendance safely.");
                return;
            }

            const res = await submitBulkAttendance(
                attendanceData,
                attendanceDate,
                targetShiftId,
                userName
            );

            if (res.success) {
                toast.success(res.message);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to submit attendance");
        }
    };


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

    // Detail View State
    const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);

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

    // Filter workers based on search (for Management Tab)
    const filteredWorkers = data.workers.filter(w =>
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.empId && w.empId.includes(searchTerm))
    );

    // Determine available tabs
    // Supervisor: Reports, Mark Attendance
    // Manager: Reports, Mark Attendance, Workers, Users

    // Rename 'attendance' to 'reports' for clarity in UI
    const tabs = ["reports", "mark_attendance"];
    const isManager = userRole === "manager";

    if (isManager) {
        tabs.push("workers", "users");
    }

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
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1).replace("_", " ")}
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

                {activeTab === "mark_attendance" && (
                    <div className="flex gap-2">
                        {/* Filters for Attendance Marking */}
                        <div className="relative">
                            <input
                                type="date"
                                value={attendanceDate}
                                onChange={(e) => setAttendanceDate(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <select
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="All">All Regions</option>
                            {availableRegions.map(r => (
                                <option key={r.id} value={r.name}>{r.name}</option>
                            ))}
                        </select>

                        {userRole === "supervisor" ? (
                            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600">
                                Shift: {data.shifts.find(s => s.id.toString() === selectedShift)?.name || "Assigned Shift"}
                            </div>
                        ) : (
                            <select
                                value={selectedShift}
                                onChange={(e) => setSelectedShift(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="All">Select Shift</option>
                                {data.shifts.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        )}

                        <button
                            onClick={handleSubmitAttendance}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium text-sm"
                        >
                            Submit Attendance
                        </button>
                    </div>
                )}
            </div>

            <div className="card-premium p-6">
                {/* Search Bar - Shared */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder={activeTab === "reports" ? "Search reports..." : "Search workers..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-md px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>

                {activeTab === "reports" && (
                    <>
                        <PremiumTable
                            columns={[
                                ...attendanceColumns,
                                {
                                    header: "Actions",
                                    render: (row: DailyReport) => (
                                        <button
                                            onClick={() => setSelectedReport(row)}
                                            className="text-blue-600 hover:text-blue-800 font-medium text-sm underline"
                                        >
                                            View Details
                                        </button>
                                    )
                                }
                            ]}
                            data={dailyReports}
                        />

                        {selectedReport && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900">
                                                Attendance Details
                                            </h3>
                                            <p className="text-sm text-slate-500">
                                                {selectedReport.date} - {selectedReport.region} ({selectedReport.shift})
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedReport(null)}
                                            className="text-slate-400 hover:text-slate-600 p-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="p-6 overflow-y-auto">
                                        <PremiumTable
                                            columns={[
                                                { header: "Worker Name", render: (att: Attendance) => <span className="font-medium">{att.worker?.name || att.workerName || "Unknown"}</span> },
                                                {
                                                    header: "Status",
                                                    accessorKey: "status" as const,
                                                    render: (att: Attendance) => (
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${att.status === 'Present' ? 'bg-green-100 text-green-700' :
                                                                att.status === 'Absent' ? 'bg-red-100 text-red-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                            {att.status}
                                                        </span>
                                                    )
                                                },
                                                { header: "Notes", accessorKey: "notes" as const },
                                                { header: "Supervisor", accessorKey: "supervisor" as const }
                                            ]}
                                            data={data.allAttendance.filter(att => {
                                                const attDate = new Date(att.date).toLocaleDateString();
                                                const attRegion = att.worker?.region || "Unknown";
                                                const attShift = (att.shiftId || "General").toString();

                                                // Robust matching key
                                                const reportId = `${attDate}-${attRegion}-${attShift}`;
                                                return reportId === selectedReport.id;
                                            })}
                                        />
                                    </div>
                                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                                        <button
                                            onClick={() => setSelectedReport(null)}
                                            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === "mark_attendance" && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr key="header-row">
                                    <th className="px-4 py-3">Worker</th>
                                    <th className="px-4 py-3">Region / Shift</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {attendanceWorkers.map(worker => (
                                    <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{worker.name}</div>
                                            <div className="text-xs text-slate-400">{worker.empId}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-slate-700">{worker.region}</div>
                                            <div className="text-xs text-slate-500">{worker.shiftName}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {["Present", "Absent", "Vacation", "Day Off", "Sick Leave"].map(status => (
                                                    <button
                                                        key={status}
                                                        onClick={() => handleStatusChange(worker.id, status)}
                                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${getWorkerStatus(worker.id) === status
                                                            ? status === "Present"
                                                                ? "bg-green-100 text-green-700 border-green-200"
                                                                : status === "Absent"
                                                                    ? "bg-red-100 text-red-700 border-red-200"
                                                                    : "bg-blue-100 text-blue-700 border-blue-200"
                                                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                                            }`}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                placeholder="Add notes..."
                                                value={getWorkerNotes(worker.id)}
                                                onChange={(e) => handleNotesChange(worker.id, e.target.value)}
                                                className="w-full px-3 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {attendanceWorkers.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                No workers found matching filters. Please select a Region and Shift.
                            </div>
                        )}
                    </div>
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

                {activeTab === "users" && data.allUsers && (
                    <UserManagement
                        users={data.allUsers}
                        shifts={data.shifts}
                        regions={data.regions}
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
