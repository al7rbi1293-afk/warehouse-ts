"use client";

import { useState, useEffect, useCallback } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { getStaffList, getStaffAttendance, markStaffAttendance } from "@/app/actions/staff";
import { toast } from "sonner";

interface StaffUser {
    id: number;
    name: string;
    username: string;
    role: string;
    region: string | null;
    shift: { name: string } | null;
}

interface StaffAttendanceRecord {
    userId: number;
    status: string;
    coveredBy: number | null;
    coverUser?: { name: string };
    notes?: string;
}

export function StaffManagement({ date: globalDate, selectedRegion }: { date?: string; selectedRegion?: string }) {
    const [date, setDate] = useState(globalDate || new Date().toISOString().split("T")[0]);
    const [staff, setStaff] = useState<StaffUser[]>([]);
    const [attendance, setAttendance] = useState<Record<number, StaffAttendanceRecord>>({});
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [staffRes, attendanceRes] = await Promise.all([
                getStaffList(),
                getStaffAttendance(date)
            ]);

            if (staffRes.success && staffRes.data) {
                setStaff(staffRes.data);
            }

            if (attendanceRes.success && attendanceRes.data) {
                const attMap: Record<number, StaffAttendanceRecord> = {};
                attendanceRes.data.forEach(r => {
                    attMap[r.userId] = {
                        userId: r.userId,
                        status: r.status || "Absent",
                        coveredBy: r.coveredBy,
                        coverUser: r.coverUser || undefined,
                        notes: r.notes || undefined
                    };
                });
                setAttendance(attMap);
            }
        } catch {
            toast.error("Failed to load staff data");
        } finally {
            setLoading(false);
        }
    }, [date]);

    // Load initial data
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Sync with global date
    useEffect(() => {
        if (globalDate) {
            setDate(globalDate);
        }
    }, [globalDate]);

    const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

    const handleStatusChange = async (userId: number, status: string) => {
        if (busyIds.has(userId)) return;

        setBusyIds(prev => new Set(prev).add(userId));
        // Optimistic update
        setAttendance(prev => ({
            ...prev,
            [userId]: { ...prev[userId], status, userId }
        }));

        try {
            await markStaffAttendance(userId, status, date, attendance[userId]?.coveredBy, attendance[userId]?.notes);
            toast.success("Attendance marked");
        } catch {
            toast.error("Failed to update");
            loadData(); // Revert
        } finally {
            setBusyIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const handleCoverChange = async (userId: number, coveredBy: string) => {
        if (busyIds.has(userId)) return;
        setBusyIds(prev => new Set(prev).add(userId));

        const coverId = coveredBy ? parseInt(coveredBy) : null;

        setAttendance(prev => ({
            ...prev,
            [userId]: { ...prev[userId], coveredBy: coverId, userId }
        }));

        try {
            await markStaffAttendance(userId, "Absent", date, coverId, attendance[userId]?.notes);
            toast.success("Coverage assigned");
        } catch {
            toast.error("Failed to update coverage");
        } finally {
            setBusyIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const filteredStaff = staff.filter(s => {
        if (selectedRegion && selectedRegion !== "All" && s.region !== selectedRegion) return false;
        return true;
    });

    const supervisors = filteredStaff.filter(s => s.role === "supervisor");

    const columns = [
        { header: "Name", accessorKey: "name" as const, render: (row: StaffUser) => <span className="font-medium text-slate-900">{row.name}</span> },
        { header: "Role", accessorKey: "role" as const, render: (row: StaffUser) => <span className="capitalize">{row.role}</span> },
        { header: "Region", accessorKey: "region" as const, render: (row: StaffUser) => row.region || "-" },
        {
            header: "Status",
            render: (row: StaffUser) => (
                <div className="flex gap-2">
                    {["Present", "Absent", "Vacation", "Day Off", "Sick Leave"].map((status) => (
                        <button
                            key={status}
                            disabled={busyIds.has(row.id)}
                            onClick={() => handleStatusChange(row.id, status)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${attendance[row.id]?.status === status
                                ? (status === "Present" ? "bg-green-100 text-green-700 border border-green-200" :
                                    status === "Absent" ? "bg-red-100 text-red-700 border border-red-200" :
                                        status === "Vacation" ? "bg-blue-100 text-blue-700 border border-blue-200" :
                                            status === "Day Off" ? "bg-indigo-100 text-indigo-700 border border-indigo-200" :
                                                "bg-amber-100 text-amber-700 border border-amber-200")
                                : "bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                                }`}
                        >
                            {status === "Sick Leave" ? "Sick" : status}
                        </button>
                    ))}
                </div>
            )
        },
        {
            header: "Covered By",
            render: (row: StaffUser) => {
                const status = attendance[row.id]?.status;
                const needsCoverage = ["Absent", "Vacation", "Sick Leave"].includes(status || "");
                if (!needsCoverage || row.role !== 'supervisor') return <span className="text-slate-400 text-xs">-</span>;

                return (
                    <select
                        disabled={busyIds.has(row.id)}
                        value={attendance[row.id]?.coveredBy?.toString() || ""}
                        onChange={(e) => handleCoverChange(row.id, e.target.value)}
                        className="px-2 py-1 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-48 disabled:bg-slate-50"
                    >
                        <option value="">Select Cover...</option>
                        {supervisors
                            .filter(s => s.id !== row.id) // Can't cover self
                            .map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.region || "No Region"})
                                </option>
                            ))
                        }
                    </select>
                );
            }
        }
    ];

    if (loading && staff.length === 0) return <div className="p-6 text-center">Loading staff data...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Staff Attendance</h2>
                    <p className="text-sm text-slate-500">Mark attendance for supervisors and management</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <PremiumTable
                    columns={columns}
                    data={filteredStaff}
                />
            </div>
        </div>
    );
}
