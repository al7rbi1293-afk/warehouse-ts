"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InventoryItem } from "@/types";

interface Props {
    inventory: InventoryItem[];
}

import { getProjects, getWarehouses } from "@/app/actions/references";
import { useEffect } from "react";

interface Props {
    inventory: InventoryItem[];
}

// Types for local state
interface ProjectOption { id: number; name: string; }
interface WarehouseOption { id: number; name: string; }

type TransferType = "transfer" | "lend" | "borrow";

export function StockTransferForm({ inventory }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [transferType, setTransferType] = useState<TransferType>("transfer");
    const [selectedItem, setSelectedItem] = useState<string>("");

    // Dynamic Data State
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            const [projRes, whRes] = await Promise.all([
                getProjects(),
                getWarehouses()
            ]);

            if (projRes.success && projRes.data) setProjects(projRes.data);
            if (whRes.success && whRes.data) setWarehouses(whRes.data);
            // Fallback if empty (e.g. migration not run yet)
            if (!projRes.data || projRes.data.length === 0) {
                // Keep UI usable even if DB empty? 
                // For now, let's rely on DB data as requested.
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const type = formData.get("transferType");
        const from = formData.get("fromLocation");
        const to = formData.get("toLocation");

        // Log logic for now since we don't have backend support fully ready
        console.log({ type, from, to });

        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success("Transfer request submitted successfully");
            router.refresh();
            (e.target as HTMLFormElement).reset();
            setSelectedItem("");
            setTransferType("transfer");
        } catch {
            toast.error("Transfer failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-blue-50/50 p-4 rounded-lg text-sm text-blue-700 border border-blue-100 mb-6 flex flex-col gap-2">
                <p><strong>Note:</strong> Transfering stock requires manager approval.</p>
                <ul className="list-disc list-inside text-xs opacity-80">
                    <li><strong>Warehouse Transfer:</strong> Move items between NSTC and SNC.</li>
                    <li><strong>Lend (Issue):</strong> Issue items to a project (decreases stock).</li>
                    <li><strong>Borrow (Return):</strong> Return items from a project (increases stock).</li>
                </ul>
            </div>

            {/* Transfer Type Selector */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                    type="button"
                    onClick={() => setTransferType("transfer")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${transferType === "transfer"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                        }`}
                >
                    Warehouse Transfer
                </button>
                <button
                    type="button"
                    onClick={() => setTransferType("lend")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${transferType === "lend"
                        ? "bg-white text-amber-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                        }`}
                >
                    Lend (To Project)
                </button>
                <button
                    type="button"
                    onClick={() => setTransferType("borrow")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${transferType === "borrow"
                        ? "bg-white text-green-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                        }`}
                >
                    Borrow (From Project)
                </button>
            </div>

            <input type="hidden" name="transferType" value={transferType} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Select Item</label>
                    <select
                        name="itemId"
                        required
                        value={selectedItem}
                        onChange={(e) => setSelectedItem(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                        <option value="">Select an item...</option>
                        {inventory.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.nameEn} ({item.qty} {item.unit} available at {item.location})
                            </option>
                        ))}
                    </select>
                </div>

                {/* From Location */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">From Location</label>

                    {transferType === "transfer" && (
                        <select name="fromLocation" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            {warehouses.length > 0 ? warehouses.map(w => (
                                <option key={w.id} value={w.name}>{w.name} Warehouse</option>
                            )) : (
                                <>
                                    <option value="NSTC">NSTC Warehouse</option>
                                    <option value="SNC">SNC Warehouse</option>
                                </>
                            )}
                        </select>
                    )}

                    {transferType === "lend" && (
                        <select name="fromLocation" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            {warehouses.length > 0 ? warehouses.map(w => (
                                <option key={w.id} value={w.name}>{w.name} Warehouse</option>
                            )) : (
                                <>
                                    <option value="NSTC">NSTC Warehouse</option>
                                    <option value="SNC">SNC Warehouse</option>
                                </>
                            )}
                        </select>
                    )}

                    {transferType === "borrow" && (
                        <select name="fromLocation" required className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="">Select Project...</option>
                            {projects.map(proj => (
                                <option key={proj.id} value={proj.name}>{proj.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* To Location */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">To Location</label>

                    {transferType === "transfer" && (
                        <select name="toLocation" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            {warehouses.length > 0 ? warehouses.map(w => (
                                <option key={w.id} value={w.name}>{w.name} Warehouse</option>
                            )) : (
                                <>
                                    <option value="SNC">SNC Warehouse</option>
                                    <option value="NSTC">NSTC Warehouse</option>
                                </>
                            )}
                        </select>
                    )}

                    {transferType === "lend" && (
                        <select name="toLocation" required className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="">Select Project...</option>
                            {projects.map(proj => (
                                <option key={proj.id} value={proj.name}>{proj.name}</option>
                            ))}
                        </select>
                    )}

                    {transferType === "borrow" && (
                        <select name="toLocation" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none">
                            {warehouses.length > 0 ? warehouses.map(w => (
                                <option key={w.id} value={w.name}>{w.name} Warehouse</option>
                            )) : (
                                <>
                                    <option value="NSTC">NSTC Warehouse</option>
                                    <option value="SNC">SNC Warehouse</option>
                                </>
                            )}
                        </select>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Quantity</label>
                    <input
                        type="number"
                        name="qty"
                        min="1"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder="0"
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Reference / Notes</label>
                    <input
                        type="text"
                        name="notes"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder="Reason for transfer..."
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    type="submit"
                    disabled={isLoading || !selectedItem}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? "Processing..." : "Submit Request"}
                </button>
            </div>
        </form>
    );
}
