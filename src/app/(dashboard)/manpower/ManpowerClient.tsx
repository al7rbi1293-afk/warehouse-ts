"use client";

import { useState } from "react";
import { AREAS, ATTENDANCE_STATUSES } from "@/lib/constants";
import { createWorker, createShift, submitBulkAttendance } from "@/app/actions/manpower";
import { toast } from "sonner";

interface Worker {
    id: number;
    name: string;
    empId: string | null;
    role: string | null;
    region: string | null;
    status: string;
    shiftId: number | null;
    createdAt: Date;
    shiftName?: string | null;
}

interface Shift {
    id: number;
    name: string;
    startTime: string | null;
    endTime: string | null;
}

interface Supervisor {
    username: string;
    name: string | null;
    region: string | null;
    role: string | null;
    shiftId: number | null;
}

interface Attendance {
    id: number;
    workerId: number;
    date: Date;
    status: string | null;
    shiftId: number | null;
    notes: string | null;
    supervisor: string | null;
    worker: {
        id: number;
        name: string;
        empId: string | null;
        role: string | null;
        region: string | null;
        status: string;
        shiftId: number | null;
        createdAt: Date;
    };
}

interface ManpowerData {
    workers: Worker[];
    shifts: Shift[];
    supervisors: Supervisor[];
    allAttendance: Attendance[];
}

interface Props {
    data: ManpowerData;
    userRole: string;
    userName: string;
    userRegion: string;
    userShiftId: number | null;
    userShiftName: string | null;
}

export function ManpowerClient({ data, userRole, userName, userRegion, userShiftId, userShiftName }: Props) {
    const [activeTab, setActiveTab] = useState(userRole === "manager" ? "reports" : "attendance");
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const regions = userRegion.includes(",") ? userRegion.split(",") : [userRegion];
    const [selectedRegion, setSelectedRegion] = useState(regions[0]);

    // Manager tabs
    const managerTabs = [
        { id: "reports", label: "📊 Reports" },
        { id: "workers", label: "👥 Worker Database" },
        { id: "shifts", label: "⏰ Duty Roster / Shifts" },
        { id: "supervisors", label: "📍 Supervisors" },
    ];

    // Supervisor tabs
    const supervisorTabs = [
        { id: "attendance", label: "📝 Daily Attendance" },
        { id: "myworkers", label: "👥 My Workers" },
    ];

    const tabs = userRole === "manager" ? managerTabs : supervisorTabs;

    // Determine target shift for attendance
    const getTargetShift = () => {
        if (!userShiftName) return null;
        if (["A", "A2"].includes(userShiftName)) return data.shifts.find((s) => s.name === "A1");
        if (["B", "B2"].includes(userShiftName)) return data.shifts.find((s) => s.name === "B1");
        return data.shifts.find((s) => s.id === userShiftId);
    };

    const targetShift = getTargetShift();

    // Filter workers for attendance
    const attendanceWorkers = data.workers.filter(
        (w) => w.region === selectedRegion && w.shiftId === targetShift?.id && w.status === "Active"
    );

    // Attendance form state
    const [attendanceRecords, setAttendanceRecords] = useState<Record<number, { status: string; notes: string }>>({});

    const handleAttendanceChange = (workerId: number, field: "status" | "notes", value: string) => {
        setAttendanceRecords((prev) => ({
            ...prev,
            [workerId]: {
                ...prev[workerId],
                [field]: value,
                ...(field === "status" && !prev[workerId] ? { notes: "" } : {}),
            },
        }));
    };

    const handleSubmitAttendance = async () => {
        if (!targetShift) {
            toast.error("No target shift found");
            return;
        }

        setIsLoading(true);
        const records = attendanceWorkers.map((w) => ({
            workerId: w.id,
            status: attendanceRecords[w.id]?.status || "Present",
            notes: attendanceRecords[w.id]?.notes || "",
        }));

        const result = await submitBulkAttendance(records, selectedDate, targetShift.id, userName);
        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleAddWorker = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);
        const result = await createWorker(formData);
        if (result.success) {
            toast.success(result.message);
            (e.target as HTMLFormElement).reset();
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleAddShift = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);
        const result = await createShift(formData);
        if (result.success) {
            toast.success(result.message);
            (e.target as HTMLFormElement).reset();
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const filteredWorkers = data.workers.filter((w) =>
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.empId && w.empId.includes(searchTerm))
    );

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">
                👷‍♂️ {userRole === "manager" ? "Manpower Project Management" : `Supervisor: ${userName}`}
            </h1>

            {/* Region Selector for Supervisors */}
            {userRole !== "manager" && regions.length > 1 && (
                <div className="mb-4">
                    <label className="form-label">📂 Select Region</label>
                    <select
                        className="form-input w-auto"
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                    >
                        {regions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Tabs */}
            <div className="tabs mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Manager: Reports */}
            {userRole === "manager" && activeTab === "reports" && (
                <div>
                    <h3 className="font-bold text-lg mb-4">📊 Daily Attendance Report</h3>
                    <input
                        type="date"
                        className="form-input w-auto mb-4"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />

                    {data.allAttendance.length === 0 ? (
                        <div className="card text-center text-gray-500 py-8">
                            No attendance records for {selectedDate}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="metric-card">
                                <div className="metric-value text-green-600">
                                    {data.allAttendance.filter((a) => a.status === "Present").length}
                                </div>
                                <div className="metric-label">Present</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-value text-red-600">
                                    {data.allAttendance.filter((a) => a.status === "Absent").length}
                                </div>
                                <div className="metric-label">Absent</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-value text-yellow-600">
                                    {data.allAttendance.filter((a) => a.status === "Vacation").length}
                                </div>
                                <div className="metric-label">On Leave</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Manager: Workers */}
            {userRole === "manager" && activeTab === "workers" && (
                <div>
                    <input
                        type="text"
                        className="form-input mb-4"
                        placeholder="🔍 Search Workers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    {/* Add Worker Form */}
                    <details className="card mb-6">
                        <summary className="cursor-pointer font-bold">➕ Add New Worker</summary>
                        <form onSubmit={handleAddWorker} className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                                <label className="form-label">Name</label>
                                <input type="text" name="name" className="form-input" required />
                            </div>
                            <div>
                                <label className="form-label">EMP ID</label>
                                <input type="text" name="empId" className="form-input" pattern="[0-9]+" required />
                            </div>
                            <div>
                                <label className="form-label">Role</label>
                                <input type="text" name="role" className="form-input" />
                            </div>
                            <div>
                                <label className="form-label">Region</label>
                                <select name="region" className="form-input">
                                    {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Shift</label>
                                <select name="shiftId" className="form-input">
                                    <option value="">Select Shift</option>
                                    {data.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-full">
                                <button type="submit" className="btn" disabled={isLoading}>Add Worker</button>
                            </div>
                        </form>
                    </details>

                    {/* Workers Table */}
                    <div className="card overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>EMP ID</th>
                                    <th>Role</th>
                                    <th>Region</th>
                                    <th>Shift</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWorkers.map((w) => (
                                    <tr key={w.id}>
                                        <td>{w.id}</td>
                                        <td>{w.name}</td>
                                        <td>{w.empId || "-"}</td>
                                        <td>{w.role || "-"}</td>
                                        <td>{w.region || "-"}</td>
                                        <td>{w.shiftName || "-"}</td>
                                        <td>
                                            <span className={`badge ${w.status === "Active" ? "badge-success" : "badge-error"}`}>
                                                {w.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Manager: Shifts */}
            {userRole === "manager" && activeTab === "shifts" && (
                <div>
                    <details className="card mb-6">
                        <summary className="cursor-pointer font-bold">➕ Add New Shift</summary>
                        <form onSubmit={handleAddShift} className="mt-4 grid grid-cols-3 gap-4">
                            <div>
                                <label className="form-label">Shift Name</label>
                                <input type="text" name="name" className="form-input" placeholder="e.g. Morning A" required />
                            </div>
                            <div>
                                <label className="form-label">Start Time</label>
                                <input type="time" name="startTime" className="form-input" />
                            </div>
                            <div>
                                <label className="form-label">End Time</label>
                                <input type="time" name="endTime" className="form-input" />
                            </div>
                            <div className="col-span-full">
                                <button type="submit" className="btn" disabled={isLoading}>Add Shift</button>
                            </div>
                        </form>
                    </details>

                    <div className="card overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.shifts.map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.id}</td>
                                        <td>{s.name}</td>
                                        <td>{s.startTime || "-"}</td>
                                        <td>{s.endTime || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Manager: Supervisors */}
            {userRole === "manager" && activeTab === "supervisors" && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📍 Supervisor Management</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Region</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.supervisors.map((s) => (
                                <tr key={s.username}>
                                    <td>{s.username}</td>
                                    <td>{s.name || "-"}</td>
                                    <td>{s.role || "-"}</td>
                                    <td>{s.region || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Supervisor: Attendance */}
            {userRole !== "manager" && activeTab === "attendance" && (
                <div>
                    <div className="flex items-center gap-4 mb-4">
                        <div>
                            <label className="form-label">Select Date</label>
                            <input
                                type="date"
                                className="form-input"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <h3 className="text-lg font-bold mb-2">📅 Attendance for {selectedDate} - {selectedRegion}</h3>

                    {!targetShift ? (
                        <div className="card text-center text-red-500 py-8">
                            You are not assigned to a Shift. Please contact Manager.
                        </div>
                    ) : (
                        <>
                            <div className="card mb-4 bg-blue-50">
                                <p>Supervisor Shift: <strong>{userShiftName}</strong> → Taking Attendance for: <strong>{targetShift.name}</strong> Workers</p>
                            </div>

                            {attendanceWorkers.length === 0 ? (
                                <div className="card text-center text-gray-500 py-8">
                                    No active workers found in {selectedRegion} for {targetShift.name} Shift.
                                </div>
                            ) : (
                                <div className="card">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Name</th>
                                                <th>Role</th>
                                                <th>Status</th>
                                                <th>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {attendanceWorkers.map((w) => (
                                                <tr key={w.id}>
                                                    <td>{w.id}</td>
                                                    <td>{w.name}</td>
                                                    <td>{w.role || "-"}</td>
                                                    <td>
                                                        <select
                                                            className="form-input"
                                                            value={attendanceRecords[w.id]?.status || "Present"}
                                                            onChange={(e) => handleAttendanceChange(w.id, "status", e.target.value)}
                                                        >
                                                            {ATTENDANCE_STATUSES.map((s) => (
                                                                <option key={s} value={s}>{s}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="Notes..."
                                                            value={attendanceRecords[w.id]?.notes || ""}
                                                            onChange={(e) => handleAttendanceChange(w.id, "notes", e.target.value)}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="mt-4">
                                        <button className="btn" onClick={handleSubmitAttendance} disabled={isLoading}>
                                            {isLoading ? "Submitting..." : "💾 Submit Attendance"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Supervisor: My Workers */}
            {userRole !== "manager" && activeTab === "myworkers" && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">👥 Workers in {selectedRegion}</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Shift</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.workers
                                .filter((w) => w.region === selectedRegion)
                                .map((w) => (
                                    <tr key={w.id}>
                                        <td>{w.id}</td>
                                        <td>{w.name}</td>
                                        <td>{w.role || "-"}</td>
                                        <td>{w.shiftName || "-"}</td>
                                        <td>
                                            <span className={`badge ${w.status === "Active" ? "badge-success" : "badge-error"}`}>
                                                {w.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
