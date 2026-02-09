"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InventoryItem } from "@/types";
import { createBulkRequest } from "@/app/actions/inventory";

interface Props {
    inventory: InventoryItem[];
    supervisorName: string;
    defaultRegion: string;
    regions: { id: number; name: string }[];
}

export function BulkRequestForm({ inventory, supervisorName, defaultRegion, regions }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [selectedRequestRegion, setSelectedRequestRegion] = useState(defaultRegion);

    // Track request quantities: { [itemName]: quantity }
    const [requestQuantities, setRequestQuantities] = useState<Record<string, number>>({});

    // Extract unique categories
    const categories = useMemo(() => {
        const cats = new Set(inventory.map(i => i.category || "Other"));
        return ["All", ...Array.from(cats)];
    }, [inventory]);

    // Filter and deduplicate items (we only need the definition, not the stock)
    // We distinct by nameEn to avoid duplicates if items exist in multiple warehouses
    const filteredItems = useMemo(() => {
        const uniqueItems = new Map<string, InventoryItem>();

        inventory.forEach(item => {
            if (!uniqueItems.has(item.nameEn)) {
                // Check filters
                const matchesSearch = item.nameEn.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;

                if (matchesSearch && matchesCategory) {
                    uniqueItems.set(item.nameEn, item);
                }
            }
        });

        return Array.from(uniqueItems.values());
    }, [inventory, searchTerm, selectedCategory]);

    // Handle quantity change
    const handleQuantityChange = (itemName: string, value: string) => {
        const qty = parseInt(value);
        setRequestQuantities(prev => {
            const next = { ...prev };
            if (!isNaN(qty) && qty > 0) {
                next[itemName] = qty;
            } else {
                delete next[itemName];
            }
            return next;
        });
    };

    const handleSubmit = async () => {
        const itemsToRequest = Object.entries(requestQuantities).map(([name, qty]) => {
            const item = inventory.find(i => i.nameEn === name);
            return {
                itemName: name,
                category: item?.category || "General",
                qty: qty,
                unit: item?.unit || "PCS"
            };
        });

        if (itemsToRequest.length === 0) {
            toast.error("Please add at least one item to your request");
            return;
        }

        setIsLoading(true);

        try {
            const result = await createBulkRequest(
                supervisorName,
                selectedRequestRegion,
                itemsToRequest
            );

            if (result.success) {
                toast.success(result.message);
                setRequestQuantities({}); // Clear form
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch {
            toast.error("Failed to submit request");
        } finally {
            setIsLoading(false);
        }
    };

    const totalItems = Object.keys(requestQuantities).length;

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="md:w-48">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                        {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div className="md:w-48">
                    <select
                        value={selectedRequestRegion}
                        onChange={(e) => setSelectedRequestRegion(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium text-slate-700"
                    >
                        <option value="">Select Region</option>
                        {regions.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Items List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-600">Item Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Category</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Unit</th>
                            <th className="px-6 py-4 font-semibold text-slate-600 w-32">Order Qty</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredItems.length > 0 ? (
                            filteredItems.map((item) => {
                                const qty = requestQuantities[item.nameEn] || "";
                                return (
                                    <tr key={item.nameEn} className={`transition-colors ${qty ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}>
                                        <td className="px-6 py-3 font-medium text-slate-900">{item.nameEn}</td>
                                        <td className="px-6 py-3 text-slate-600">{item.category}</td>
                                        <td className="px-6 py-3 text-slate-600">{item.unit}</td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={qty}
                                                onChange={(e) => handleQuantityChange(item.nameEn, e.target.value)}
                                                className={`w-full px-3 py-1.5 border rounded-md focus:ring-2 outline-none transition-all ${qty
                                                    ? "border-blue-500 ring-2 ring-blue-500/20 bg-white"
                                                    : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                                                    }`}
                                            />
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                    No items found matching your filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer / Submit */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-sm font-medium text-slate-600">
                    <span className="text-slate-900 font-bold text-lg">{totalItems}</span> items selected
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || totalItems === 0}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                    {isLoading ? "Submitting..." : "Submit Bulk Order"}
                </button>
            </div>
        </div>
    );
}
