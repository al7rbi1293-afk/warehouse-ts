"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InventoryItem, StockLog } from "@/types";
import { getProjects, getWarehouses } from "@/app/actions/references";
import { transferStock, lendStock, returnStock } from "@/app/actions/inventory";
import { PremiumTable } from "@/components/PremiumTable";

interface Props {
    inventory: InventoryItem[];
    userName: string;
    stockLogs: StockLog[];
}

// Types for local state
interface ProjectOption { id: number; name: string; }
interface WarehouseOption { id: number; name: string; }

type TransferType = "transfer" | "lend" | "borrow";

export function StockTransferForm({ inventory, userName, stockLogs }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [transferType, setTransferType] = useState<TransferType>("transfer");
    const [selectedItem, setSelectedItem] = useState<string>("");
    // Manual From Location State (Default to NSTC or first warehouse)
    const [fromLocation, setFromLocation] = useState<string>("NSTC");

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
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const itemId = parseInt(selectedItem);
        // Use state for fromLocation if in lend mode to ensure consistency, else use form data
        const formFromLocation = formData.get("fromLocation") as string;
        const finalFromLocation = transferType === "lend" ? fromLocation : formFromLocation;

        const toLocation = formData.get("toLocation") as string;
        const qty = parseInt(formData.get("qty") as string);
        const notes = formData.get("notes") as string;

        // Find item to get current unit
        const item = inventory.find(i => i.id === itemId);
        const unit = item?.unit || "PCS"; // Fallback

        try {
            let res;

            if (transferType === "transfer") {
                res = await transferStock(itemId, qty, finalFromLocation, toLocation, userName, unit, notes);
            } else if (transferType === "lend") {
                res = await lendStock(itemId, qty, toLocation, userName, unit, notes);
            } else if (transferType === "borrow") {
                // Return stock
                res = await returnStock(itemId, qty, finalFromLocation, toLocation, userName, unit, notes);
            }

            if (res?.success) {
                toast.success(res.message);
                router.refresh();
                (e.target as HTMLFormElement).reset();
                setSelectedItem("");
            } else {
                toast.error(res?.message || "Operation failed");
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    // Filter relevant logs for the table below
    const relevantLogs = stockLogs.filter(log =>
        log.actionType && (
            log.actionType.includes("Transfer") ||
            log.actionType.includes("Lent") ||
            log.actionType.includes("Returned")
        )
    ).slice(0, 10); // Show last 10

    const logColumns = [
        { header: "Date", render: (log: StockLog) => log.logDate ? new Date(log.logDate).toLocaleString() : "-" },
        { header: "Item", accessorKey: "itemName" as const },
        { header: "Action", accessorKey: "actionType" as const },
        {
            header: "Change",
            render: (log: StockLog) => (
                <span className={log.changeAmount && log.changeAmount > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                    {log.changeAmount && log.changeAmount > 0 ? "+" : ""}{log.changeAmount} {log.unit}
                </span>
            )
        },
        { header: "Location", accessorKey: "location" as const },
        { header: "User", accessorKey: "actionBy" as const },
    ];

    return (
        <div className="space-y-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-blue-50/50 p-4 rounded-lg text-sm text-blue-700 border border-blue-100 mb-6 flex flex-col gap-2">
                    <p><strong>Order Execution:</strong> These actions are executed immediately.</p>
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
                            {inventory
                                .filter(item => {
                                    // If Lending, filter by selected From Location
                                    if (transferType === "lend") {
                                        return item.location === fromLocation;
                                    }
                                    // If Transferring, filter by selected From Location (need to read form value? usually we'd bind it to state too)
                                    // ideally we should bind fromLocation state to Transfer mode too, but for now let's strict check on Lend as requested.
                                    return true;
                                })
                                .map(item => (
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
                                        <option value="CWW">CWW Warehouse</option>
                                    </>
                                )}
                            </select>
                        )}

                        {transferType === "lend" && (
                            <select
                                name="fromLocation"
                                value={fromLocation}
                                onChange={(e) => {
                                    setFromLocation(e.target.value);
                                    setSelectedItem(""); // Reset item on location change
                                }}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                            >
                                <option value="NSTC">NSTC Warehouse</option>
                                <option value="SNC">SNC Warehouse</option>
                                <option value="CWW">CWW Warehouse</option>
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
                                        <option value="CWW">CWW Warehouse</option>
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
                                        <option value="CWW">CWW Warehouse</option>
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
                            placeholder="Reason for transfer, PO number, etc..."
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={isLoading || !selectedItem}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M12 5l7 7-7 7" /></svg>
                                Execute Order
                            </>
                        )}
                    </button>
                </div>
            </form>

            <div className="border-t border-slate-200 pt-8">
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Recent Movements</h3>
                    <p className="text-sm text-slate-500">History of transfers and project issues</p>
                </div>
                <PremiumTable
                    columns={logColumns}
                    data={relevantLogs}
                />
            </div>
        </div>
    );
}
