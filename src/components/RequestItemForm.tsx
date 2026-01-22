"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InventoryItem } from "@/types";
import { createRequest } from "@/app/actions/inventory";

interface Props {
    inventory: InventoryItem[];
    supervisorName: string;
    region: string;
}

export function RequestItemForm({ inventory, supervisorName, region }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

    const uniqueItems = Array.from(new Set(inventory.map(i => i.nameEn)))
        .map(name => inventory.find(i => i.nameEn === name)!);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const qty = parseInt(formData.get("qty") as string);
        const unit = formData.get("unit") as string;

        if (!selectedItem) {
            toast.error("Please select an item");
            setIsLoading(false);
            return;
        }

        try {
            const result = await createRequest(
                supervisorName,
                region,
                selectedItem.nameEn,
                selectedItem.category || "General",
                qty,
                unit
            );

            if (result.success) {
                toast.success(result.message);
                router.refresh();
                (e.target as HTMLFormElement).reset();
                setSelectedItem(null);
            } else {
                toast.error(result.message);
            }
        } catch {
            toast.error("Failed to submit request");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Select Item</label>
                    <select
                        name="itemName"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        onChange={(e) => {
                            const item = inventory.find(i => i.nameEn === e.target.value);
                            setSelectedItem(item || null);
                        }}
                    >
                        <option value="">Select Item</option>
                        {uniqueItems.map((item) => (
                            <option key={item.id} value={item.nameEn}>
                                {item.nameEn}
                            </option>
                        ))}
                    </select>
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
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Unit</label>
                    <select
                        name="unit"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        defaultValue={selectedItem?.unit || "PCS"}
                    >
                        <option value="PCS">PCS</option>
                        <option value="KG">KG</option>
                        <option value="BOX">BOX</option>
                        <option value="SET">SET</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">From Region</label>
                    <input
                        type="text"
                        value={region}
                        disabled
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70"
                >
                    {isLoading ? "Submitting..." : "Submit Request"}
                </button>
            </div>
        </form>
    );
}
