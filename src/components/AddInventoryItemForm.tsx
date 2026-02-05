"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Warehouse } from "@/types";
import { createInventoryItem } from "@/app/actions/inventory";

interface Props {
    warehouses: Warehouse[];
}

export function AddInventoryItemForm({ warehouses }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);

        try {
            const result = await createInventoryItem(formData);

            if (result.success) {
                toast.success(result.message);
                router.refresh();
                (e.target as HTMLFormElement).reset();
            } else {
                toast.error(result.message);
            }
        } catch {
            toast.error("Failed to add item");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Item Name (English)</label>
                    <input
                        type="text"
                        name="nameEn"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder="e.g. Safety Helmet"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Item Name (Arabic)</label>
                    <input
                        type="text"
                        name="nameAr"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-right"
                        placeholder="مثال: خوذة سلامة"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                    <select
                        name="category"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                        <option value="">Select Category</option>
                        <option value="PPE">PPE</option>
                        <option value="Tools">Tools</option>
                        <option value="Electrical">Electrical</option>
                        <option value="Mechanical">Mechanical</option>
                        <option value="Consumables">Consumables</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">SKU / Material Code</label>
                    <input
                        type="text"
                        name="materialCode"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder="e.g. MAT-001"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Initial Quantity</label>
                    <input
                        type="number"
                        name="qty"
                        min="0"
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
                    >
                        <option value="PCS">PCS</option>
                        <option value="KG">KG</option>
                        <option value="BOX">BOX</option>
                        <option value="SET">SET</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Warehouse Location</label>
                    <select
                        name="location"
                        required
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                        <option value="">Select Warehouse</option>
                        {warehouses.map((wh) => (
                            <option key={wh.id} value={wh.name}>
                                {wh.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70"
                >
                    {isLoading ? "Adding Item..." : "Add Item"}
                </button>
            </div>
        </form>
    );
}
