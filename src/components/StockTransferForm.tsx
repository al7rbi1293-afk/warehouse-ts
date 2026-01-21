"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InventoryItem } from "@/types";

interface Props {
    inventory: InventoryItem[];
    userName: string;
}

export function StockTransferForm({ inventory }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<string>("");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success("Transfer request submitted");
            router.refresh();
            (e.target as HTMLFormElement).reset();
            setSelectedItem("");
        } catch {
            toast.error("Transfer failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-blue-50/50 p-4 rounded-lg text-sm text-blue-700 border border-blue-100 mb-6">
                Transfering stock between warehouses requires approval from the manager.
            </div>

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
                        <option value="">Select an item to transfer...</option>
                        {inventory.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.nameEn} ({item.qty} {item.unit} available at {item.location})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">From Location</label>
                    <select
                        name="fromLocation"
                        required
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 outline-none cursor-not-allowed"
                    >
                        <option value="NSTC">NSTC</option>
                        <option value="SNC">SNC</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">To Location</label>
                    <select
                        name="toLocation"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                        <option value="SNC">SNC</option>
                        <option value="NSTC">NSTC</option>
                        <option value="Project">External Project</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Quantity to Transfer</label>
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
                    {isLoading ? "Submit Request..." : "Request Transfer"}
                </button>
            </div>
        </form>
    );
}
