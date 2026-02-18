"use client";

import { useState, useMemo, useEffect } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { ManpowerData, Attendance, DailyReport, Worker, User } from "@/types";
import { WorkerModal } from "@/components/WorkerModal";
import { deleteWorker, submitBulkAttendance } from "@/app/actions/manpower";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserManagement } from "@/components/UserManagement";
import { AttendanceActionControls } from "@/components/AttendanceActionControls";
import { AttendanceTable } from "@/components/AttendanceTable";
import { StaffManagement } from "@/components/StaffManagement";
import { ExportButton } from "@/components/ExportButton";
import { useAsyncAction } from "@/lib/useDebounce";

interface Props {
    data: ManpowerData & { allUsers?: User[] };
    userRole?: string;
    userName?: string;
    userRegion?: string | null;
    userShiftId?: number | null;
    userShiftName?: string | null;
    userAllowedShifts?: string | null;
}

export function ManpowerClient({
    data,
    userRole = "manager",
    userName = "Admin",
    userRegion,
    userShiftId
}: Props) {
    const router = useRouter();
    // Default tab based on role? Or just default to Reports
    const [activeTab, setActiveTab] = useState("reports");
    const [searchTerm, setSearchTerm] = useState("");

    // Attendance Marking State
    const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
    // Initialize region: if multiple regions, default to "All", otherwise specific region or "All"
    const [selectedRegion, setSelectedRegion] = useState<string>(
        userRegion && !userRegion.includes(",") ? userRegion : "All"
    );
    const [selectedShift, setSelectedShift] = useState<string>(userShiftId ? userShiftId.toString() : "All");

    // Filter available regions for dropdown
    const availableRegions = useMemo(() => {
        return data.regions;
    }, [data.regions]);

    // Derived available shifts
    const availableShifts = useMemo(() => {
        return data.shifts;
    }, [data.shifts]);

    // [FIX] Sync selectedShift with availableShifts
    useEffect(() => {
        if (selectedShift === "All") {
            return;
        }

        const isValid = availableShifts.some((shift) => shift.id.toString() === selectedShift);
        if (!isValid) {
            setSelectedShift("All");
        }
    }, [availableShifts, selectedShift]);

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
            if (selectedRegion !== "All") {
                if (!w.region) {
                    return false;
                }
                if (w.region.toLowerCase().trim() !== selectedRegion.toLowerCase().trim()) {
                    return false;
                }
            }

            // 2. Shift Filter (Smart Parent/Child)
            if (selectedShift !== "All") {
                const shiftObj = data.shifts.find(s => s.id.toString() === selectedShift);
                if (shiftObj) {
                    // Strict filter for the current view
                    if (shiftObj.name === "A" || shiftObj.name === "B") {
                        // If filtering by "A", show "A", "A1", "A2" etc.
                        if (!w.shiftName || !w.shiftName.startsWith(shiftObj.name)) return false;
                    } else {
                        // Regular specific shift match
                        if (w.shiftId?.toString() !== selectedShift) return false;
                    }
                }
            }

            // 3. Search
            if (searchTerm && !w.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !(w.empId && w.empId.includes(searchTerm))) return false;

            return true;
        });
    }, [data.workers, selectedRegion, selectedShift, searchTerm, data.shifts]);




    // ...

    const [isSubmitting, handleSubmitAttendance] = useAsyncAction(async () => {
        if (!confirm(`Submit attendance for ${attendanceDate}? Previous records for this date/shift/region will be overwritten.`)) return;

        const currentWorkers = attendanceWorkers;

        if (currentWorkers.length === 0) {
            toast.error("No workers to submit attendance for.");
            return;
        }

        const attendanceData = currentWorkers.map(w => ({
            workerId: w.id,
            status: getWorkerStatus(w.id) || "Present",
            notes: getWorkerNotes(w.id),
            shiftId: w.shiftId // Pass the worker's assigned shift
        }));

        try {
            const targetShiftId = parseInt(selectedShift);
            // If All shifts selected (isNaN), we pass 0/null to action, but relying on record per day
            const globalShiftId = isNaN(targetShiftId) ? 0 : targetShiftId;

            const res = await submitBulkAttendance(
                attendanceData,
                attendanceDate,
                globalShiftId,
                userName
            );

            if (res.success) {
                toast.success(res.message);
                router.refresh();
                // Clear buffer after success if desired, or keep it.
                // setAttendanceBuffer({});
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to submit attendance");
        }
    });


    // Aggregate attendance data for the table
    const dailyReports = useMemo(() => {
        if (!data.allAttendance) return [];

        const grouped = new Map<string, DailyReport>();

        data.allAttendance.forEach((record: Attendance) => {
            // Global Date Filter
            const recordDateStr = new Date(record.date).toISOString().split('T')[0];
            if (recordDateStr !== attendanceDate) return;

            // Global Region Filter
            const region = record.worker?.region || "Unknown";
            if (selectedRegion !== "All" && region !== selectedRegion) return;

            // Filter: If supervisor, only show their own reports (if they want to see only theirs)
            // But usually reports tab shows all they are allowed to see
            if ((userRole === "supervisor" || userRole === "night_supervisor") && record.supervisor !== userName) {
                // If we want supervisors to only see what they submitted
                // return; 
            }

            const dateStr = new Date(record.date).toLocaleDateString();
            const shiftId = (record.shiftId || "General").toString();
            // Global Shift Filter
            if (selectedShift !== "All" && shiftId !== selectedShift) return;

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

    }, [data.allAttendance, userRole, userName, attendanceDate, selectedRegion, selectedShift]);

    const handleEditReport = (report: DailyReport) => {
        // Convert date back to YYYY-MM-DD for input
        // report.date is locale string (e.g. 1/22/2026), need to parse carefully or rely on stored date
        // Ideally DailyReport should store raw date string too, but let's try to parse
        const parts = report.date.split('/');
        if (parts.length === 3) {
            const date = new Date(report.date);
            // Adjust for timezone offset to keep the same day
            const offset = date.getTimezoneOffset();
            const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
            setAttendanceDate(adjustedDate.toISOString().split('T')[0]);
        }

        // Better approach: find a sample record from this report to get the raw date
        const sampleRecord = data.allAttendance.find(a => {
            const dateStr = new Date(a.date).toLocaleDateString();
            const region = a.worker?.region || "Unknown";
            const shiftId = (a.shiftId || "General").toString();
            return `${dateStr}-${region}-${shiftId}` === report.id;
        });

        if (sampleRecord) {
            setAttendanceDate(new Date(sampleRecord.date).toISOString().split('T')[0]);
        }

        setSelectedRegion(report.region);
        setSelectedShift(report.shift);
        setActiveTab("mark_attendance");
        toast.info("Edit mode: Attendance data loaded.");
    };



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
    const [isDeleting, setIsDeleting] = useState(false);

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
        if (isDeleting) return;
        if (confirm("Are you sure you want to delete this worker? This will also delete their attendance records.")) {
            setIsDeleting(true);
            const toastId = toast.loading("Deleting worker...");
            try {
                const res = await deleteWorker(id);
                if (res.success) {
                    toast.success("Worker deleted successfully", { id: toastId });
                    router.refresh();
                } else {
                    toast.error(res.message, { id: toastId });
                }
            } catch {
                toast.error("Failed to delete worker", { id: toastId });
            } finally {
                setIsDeleting(false);
            }
        }
    };

    // Filter workers based on search (for Management Tab)
    const filteredWorkers = data.workers.filter(w => {
        // Search Filter
        const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (w.empId && w.empId.includes(searchTerm));
        if (!matchesSearch) return false;

        // Global Region Filter
        if (selectedRegion !== "All" && w.region !== selectedRegion) return false;

        // Global Shift Filter
        if (selectedShift !== "All" && w.shiftId?.toString() !== selectedShift) return false;

        return true;
    });

    const tabs = ["reports", "mark_attendance"];
    const isManager = userRole === "manager";

    if (isManager) {
        tabs.push("workers", "users", "staff");
    }

    // Helper data for specific lists to export
    const flatAttendanceList = useMemo(() => {
        return data.allAttendance?.map(a => ({
            Date: new Date(a.date).toLocaleDateString(),
            Worker: a.worker?.name || a.workerName || "Unknown",
            Role: a.worker?.role || "-",
            Region: a.worker?.region || "-",
            Shift: data.shifts.find(s => s.id === a.shiftId)?.name || a.shiftId || "-",
            Status: a.status,
            Notes: a.notes || "-",
            Supervisor: a.supervisor || "-"
        })) || [];
    }, [data.allAttendance, data.shifts]);

    const flatWorkersList = useMemo(() => {
        return filteredWorkers.map(w => ({
            Name: w.name,
            ID: w.empId || "-",
            Role: w.role || "-",
            Region: w.region || "-",
            Shift: w.shiftName || "-",
            Status: w.status
        }));
    }, [filteredWorkers]);

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Manpower Reports</h1>
                    <p className="text-slate-500 text-sm">Track attendance and workforce dynamics</p>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                    <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm min-w-max">
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
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <AttendanceActionControls
                        activeTab={activeTab}
                        userRole={userRole}
                        attendanceDate={attendanceDate}
                        setAttendanceDate={setAttendanceDate}
                        selectedRegion={selectedRegion}
                        setSelectedRegion={setSelectedRegion}
                        availableRegions={availableRegions}
                        selectedShift={selectedShift}
                        setSelectedShift={setSelectedShift}
                        shifts={availableShifts}
                        onSubmit={handleSubmitAttendance}
                        onAddWorker={handleAddWorker}
                        isLoading={isSubmitting}
                        mode="filters"
                    />
                    <div className="flex justify-end">
                        <AttendanceActionControls
                            activeTab={activeTab}
                            userRole={userRole}
                            attendanceDate={attendanceDate}
                            setAttendanceDate={setAttendanceDate}
                            selectedRegion={selectedRegion}
                            setSelectedRegion={setSelectedRegion}
                            availableRegions={availableRegions}
                            selectedShift={selectedShift}
                            setSelectedShift={setSelectedShift}
                            shifts={availableShifts}
                            onSubmit={handleSubmitAttendance}
                            onAddWorker={handleAddWorker}
                            isLoading={isSubmitting}
                            mode="actions"
                        />
                    </div>
                </div>
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
                        {(() => {
                            // Group reports by Date
                            const groupedReports = dailyReports.reduce((acc, report) => {
                                const dateKey = report.date;
                                if (!acc[dateKey]) acc[dateKey] = [];
                                acc[dateKey].push(report);
                                return acc;
                            }, {} as Record<string, DailyReport[]>);

                            return Object.entries(groupedReports).map(([date, reports]) => (
                                <div key={date} className="mb-8">
                                    <div className="flex items-center gap-2 mb-3">
                                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                            {date}
                                        </h3>
                                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                                            {reports.length} Regions
                                        </span>
                                    </div>
                                    <div className="flex justify-end gap-2 mb-2">
                                        <ExportButton
                                            data={reports.map(r => ({
                                                Date: r.date,
                                                Region: r.region,
                                                Shift: r.shift,
                                                Total_Workers: r.totalWorkers,
                                                Present: r.presentCount,
                                                Absent: r.absentCount
                                            }))}
                                            fileName={`Daily_Reports_${date.replace(/\//g, '-')}`}
                                            label="Export Summary"
                                        />
                                        <ExportButton
                                            data={flatAttendanceList.filter(a => a.Date === date)}
                                            fileName={`Detailed_Attendance_${date.replace(/\//g, '-')}`}
                                            label="Export Detailed"
                                            className="bg-slate-800 hover:bg-slate-900"
                                        />
                                    </div>
                                    <PremiumTable
                                        columns={[
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
                                            {
                                                header: "Actions",
                                                render: (row: DailyReport) => (
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => setSelectedReport(row)}
                                                            className="text-blue-600 hover:text-blue-800 font-medium text-sm underline"
                                                        >
                                                            View Details
                                                        </button>
                                                        {/* Allow Edit if Supervisor or Manager */}
                                                        {(userRole === 'supervisor' || userRole === 'night_supervisor' || userRole === 'manager') ? (
                                                            <button
                                                                onClick={() => handleEditReport(row)}
                                                                className="text-amber-600 hover:text-amber-800 font-medium text-sm flex items-center gap-1"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                                </svg>
                                                                Edit
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                )
                                            }
                                        ]}
                                        data={reports}
                                    />
                                </div>
                            ));
                        })()}

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
                                            aria-label="Close details"
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
                    <AttendanceTable
                        workers={attendanceWorkers}
                        getWorkerStatus={getWorkerStatus}
                        getWorkerNotes={getWorkerNotes}
                        onStatusChange={handleStatusChange}
                        onNotesChange={handleNotesChange}
                    />
                )}

                {activeTab === "workers" && (
                    <div className="space-y-8">
                        <div className="flex justify-end">
                            <ExportButton
                                data={flatWorkersList}
                                fileName={`Workers_List_${new Date().toISOString().split('T')[0]}`}
                                label="Export All Workers"
                            />
                        </div>
                        {(() => {
                            // Group workers by Region -> Shift
                            const groupedWorkers: Record<string, Record<string, Worker[]>> = {};

                            filteredWorkers.forEach(w => {
                                const region = w.region || "Unassigned";
                                const shift = w.shiftName || "No Shift";

                                if (!groupedWorkers[region]) groupedWorkers[region] = {};
                                if (!groupedWorkers[region][shift]) groupedWorkers[region][shift] = [];

                                groupedWorkers[region][shift].push(w);
                            });

                            // render
                            return Object.entries(groupedWorkers).sort().map(([region, shifts]) => (
                                <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                            {region} Region
                                        </h2>
                                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500">
                                            {Object.values(shifts).reduce((acc, curr) => acc + curr.length, 0)} Workers
                                        </span>
                                    </div>

                                    <div className="p-6 space-y-8">
                                        {Object.entries(shifts).sort().map(([shift, workers]) => (
                                            <div key={shift}>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <h3 className="font-bold text-slate-700">{shift} Shift</h3>
                                                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        {workers.length}
                                                    </span>
                                                </div>
                                                <PremiumTable
                                                    columns={workerColumns}
                                                    data={workers}
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
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                )}

                {activeTab === "users" && data.allUsers && (
                    <UserManagement
                        users={data.allUsers}
                        shifts={data.shifts}
                        regions={data.regions}
                    />
                )}

                {activeTab === "staff" && (
                    <StaffManagement
                        date={attendanceDate}
                        selectedRegion={selectedRegion}
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
