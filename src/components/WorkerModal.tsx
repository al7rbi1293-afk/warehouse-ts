"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Worker, Shift, Region } from "@/types";
import { createWorker, updateWorker } from "@/app/actions/manpower";

interface WorkerModalProps {
    isOpen: boolean;
    onClose: () => void;
    worker?: Worker | null;
    shifts: Shift[];
    regions: Region[];
    onSuccess: () => void;
}

export function WorkerModal({ isOpen, onClose, worker, shifts, regions, onSuccess }: WorkerModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);

        // Sanitize shiftId
        const shiftId = formData.get("shiftId");
        if (shiftId === "") formData.delete("shiftId");

        try {
            if (worker) {
                // Update existing worker
                const data = {
                    name: formData.get("name") as string,
                    empId: formData.get("empId") as string,
                    role: formData.get("role") as string,
                    region: formData.get("region") as string,
                    shiftId: shiftId ? parseInt(shiftId as string) : null,
                    status: formData.get("status") as string,
                };

                const result = await updateWorker(worker.id, data);
                if (result.success) {
                    toast.success("Worker updated successfully");
                    onSuccess();
                    onClose();
                } else {
                    toast.error(result.message);
                }
            } else {
                // Create new worker
                const result = await createWorker(formData);
                if (result.success) {
                    toast.success("Worker added successfully");
                    onSuccess();
                    onClose();
                } else {
                    toast.error(result.message);
                }
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
                <div className="bg-slate-50 border-b border-slate-100 p-6 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">
                        {worker ? "Edit Worker" : "Add New Worker"}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                            <input
                                type="text"
                                name="name"
                                defaultValue={worker?.name}
                                required
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                                placeholder="Worker Name"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Employee ID</label>
                            <input
                                type="text"
                                name="empId"
                                defaultValue={worker?.empId || ""}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                                placeholder="e.g. EMP-001"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                            <input
                                type="text"
                                name="role"
                                defaultValue={worker?.role || ""}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                                placeholder="e.g. Labor"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Region</label>
                            <select
                                name="region"
                                defaultValue={worker?.region || "Riyadh"}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                            >
                                {regions.map(region => (
                                    <option key={region.id} value={region.name}>{region.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Shift</label>
                            <select
                                name="shiftId"
                                defaultValue={worker?.shiftId || ""}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                            >
                                <option value="">No Shift</option>
                                {shifts.map(shift => (
                                    <option key={shift.id} value={shift.id}>{shift.name}</option>
                                ))}
                            </select>
                        </div>

                        {worker && (
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                                <select
                                    name="status"
                                    defaultValue={worker.status || "Active"}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="On Leave">On Leave</option>
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70"
                        >
                            {isLoading ? "Saving..." : "Save Worker"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
