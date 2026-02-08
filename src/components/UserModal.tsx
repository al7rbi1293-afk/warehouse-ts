"use client";

import { useState, useEffect } from "react";
import { User, Shift, Region } from "@/types";
import { createUser, updateUser } from "@/app/actions/users";
import { USER_ROLES } from "@/lib/constants";

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    shifts: Shift[];
    regions: Region[];
    onSuccess: () => void;
}

export function UserModal({ isOpen, onClose, user, shifts, regions, onSuccess }: UserModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [formData, setFormData] = useState({
        username: "",
        password: "",
        name: "",
        empId: "",
        role: "supervisor",
        region: "",
        regions: "",
        shiftId: "",
        attendanceShiftId: "",
        allowedShifts: "",
    });

    useEffect(() => {
        if (user) {
            setFormData({
                username: user.username,
                password: "", // Don't fill password on edit
                name: user.name || "",
                empId: user.empId || "",
                role: user.role || "supervisor",
                region: user.region || user.regions || "", // Support both legacy and new
                regions: user.regions || user.region || "",
                shiftId: user.shiftId?.toString() || "",
                attendanceShiftId: user.attendanceShiftId?.toString() || "",
                allowedShifts: user.allowedShifts || "",
            });
        } else {
            setFormData({
                username: "",
                password: "",
                name: "",
                empId: "",
                role: "supervisor",
                region: "",
                regions: "",
                shiftId: "",
                attendanceShiftId: "",
                allowedShifts: "",
            });
        }
        setError("");
    }, [user, isOpen]);

    const handleRegionToggle = (regionName: string) => {
        // Use regions field as primary source of truth if available, otherwise fallback to region
        const sourceRegions = formData.regions || formData.region || "";
        const currentRegions = sourceRegions.split(",").map(r => r.trim()).filter(Boolean);

        let newRegionsList;
        if (currentRegions.includes(regionName)) {
            newRegionsList = currentRegions.filter(r => r !== regionName);
        } else {
            newRegionsList = [...currentRegions, regionName];
        }

        const newRegionsString = newRegionsList.join(",");
        setFormData({
            ...formData,
            region: newRegionsString, // Keep for backward compatibility
            regions: newRegionsString
        });
    };

    const handleShiftToggle = (shiftName: string) => {
        const currentShifts = formData.allowedShifts ? formData.allowedShifts.split(",").map(s => s.trim()).filter(Boolean) : [];
        let newShifts;
        if (currentShifts.includes(shiftName)) {
            newShifts = currentShifts.filter(s => s !== shiftName);
        } else {
            newShifts = [...currentShifts, shiftName];
        }
        setFormData({ ...formData, allowedShifts: newShifts.join(",") });
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            if (user) {
                const res = await updateUser(user.username, formData);
                if (res.success) {
                    onSuccess();
                    onClose();
                } else {
                    setError(res.message || "Failed to update user");
                }
            } else {
                const res = await createUser(formData);
                if (res.success) {
                    onSuccess();
                    onClose();
                } else {
                    setError(res.message || "Failed to create user");
                }
            }
        } catch {
            setError("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">
                        {user ? "Edit User" : "New User"}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input
                            type="text"
                            required
                            disabled={!!user}
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Password {user && <span className="text-slate-400 font-normal">(Leave blank to keep current)</span>}
                        </label>
                        <input
                            type="password"
                            required={!user}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID</label>
                        <input
                            type="text"
                            value={formData.empId}
                            onChange={(e) => setFormData({ ...formData, empId: e.target.value })}
                            placeholder="e.g., EMP001"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                        <select
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        >
                            {Object.values(USER_ROLES).map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-4 pt-2 border-t border-slate-50">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Responsible Zones (Multi-select)</label>
                            <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-slate-50 max-h-40 overflow-y-auto">
                                {regions.map((r) => {
                                    // Handle both legacy single region and new multi-region format
                                    const currentRegions = formData.region.split(",").map(item => item.trim()).filter(Boolean);
                                    const isSelected = currentRegions.includes(r.name);
                                    return (
                                        <label key={r.id} className="flex items-center gap-2 cursor-pointer group hover:bg-white p-1 rounded transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleRegionToggle(r.name)}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 transition-all"
                                            />
                                            <span className={`text-sm transition-colors ${isSelected ? 'text-blue-700 font-medium' : 'text-slate-600 group-hover:text-slate-900'}`}>
                                                {r.name}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {formData.region === "" && (
                                <p className="mt-1 text-[10px] text-amber-600">No zones selected. Supervisor won&apos;t see any workers.</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Primary Shift</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all text-sm"
                                    value={formData.shiftId}
                                    onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                                >
                                    <option value="">Select Shift</option>
                                    {shifts.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Attendance Shift
                                    <span className="text-slate-400 font-normal ml-1" title="If different from Primary Shift">(Optional)</span>
                                </label>
                                <select
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all text-sm"
                                    value={formData.attendanceShiftId || ""}
                                    onChange={(e) => setFormData({ ...formData, attendanceShiftId: e.target.value })}
                                >
                                    <option value="">Same as Primary</option>
                                    {shifts.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Can Attend Shifts</label>
                            <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-slate-50">
                                {shifts.map((s) => {
                                    const isSelected = formData.allowedShifts.split(",").map(item => item.trim()).filter(Boolean).includes(s.name);
                                    return (
                                        <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleShiftToggle(s.name)}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 transition-all"
                                            />
                                            <span className={`text-sm transition-colors ${isSelected ? 'text-blue-700 font-medium' : 'text-slate-600 group-hover:text-slate-900'}`}>
                                                {s.name}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {formData.allowedShifts === "" && (
                                <p className="mt-1 text-[10px] text-slate-400 italic">Default: Own shift only</p>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                        >
                            {isLoading ? "Saving..." : "Save User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
