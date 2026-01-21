"use client";

import { useState } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { AddInventoryItemForm } from "@/components/AddInventoryItemForm";
import { StockTransferForm } from "@/components/StockTransferForm";
import { InventoryItem, Request, StockLog, LocalInventoryItem, Warehouse } from "@/types";

// Define simplified props matching what the page actually sends
interface Props {
    data: {
        inventory: InventoryItem[];
        pendingRequests: Request[];
        approvedRequests: Request[];
        stockLogs: StockLog[];
        localInventory: LocalInventoryItem[];
        myPendingRequests: Request[];
        readyForPickup: Request[];
        warehouses: Warehouse[];
    };
    userRole?: string;
    userName: string;
    userRegion?: string | null;
}

export function WarehouseClient({ data }: Props) {
    const [activeTab, setActiveTab] = useState("stock");
    const [searchTerm, setSearchTerm] = useState("");
    // Default to first warehouse if available, else empty or generic
    const [warehouseFilter, setWarehouseFilter] = useState<string>(data.warehouses[0]?.name || "NSTC");

    // Filter Logic
    const currentInventory = data.inventory.filter(item => item.location === warehouseFilter);
    const filteredInventory = currentInventory.filter(item =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.nameAr && item.nameAr.includes(searchTerm))
    );

    // Combined inventory for transfer dropdown
    const allInventory = data.inventory;

    const inventoryColumns = [
        {
            header: "Item Name", accessorKey: "nameEn" as const, render: (item: InventoryItem) => (
                <div>
                    <div className="font-medium text-slate-900">{item.nameEn}</div>
                </div>
            )
        },
        { header: "SKU / Code", accessorKey: "materialCode" as const }, // Note: materialCode not in interface? Check InventoryItem
        {
            header: "Quantity", accessorKey: "qty" as const, render: (item: InventoryItem) => (
                <span className={`font-bold ${item.qty < 10 ? "text-red-500" : "text-slate-700"}`}>
                    {item.qty} {item.unit}
                </span>
            )
        },
        {
            header: "Warehouse", render: () => (
                <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                    {warehouseFilter}
                </span>
            )
        },
    ];

    const requestColumns = [
        { header: "Region", accessorKey: "region" as const },
        { header: "Requester", accessorKey: "supervisorName" as const },
        { header: "Date", render: (item: Request) => new Date(item.requestDate).toLocaleDateString() },
        {
            header: "Status", render: (item: Request) => (
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                    item.status === "Approved" ? "bg-green-100 text-green-800" :
                        "bg-slate-100 text-slate-800"
                    }`}>
                    {item.status}
                </span>
            )
        },
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
                    <p className="text-slate-500 text-sm">Manage stock, transfers, and warehouse operations</p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm overflow-x-auto max-w-full">
                {["stock", "add", "transfer", "requests", "approved", "logs"].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="card-premium p-6 min-h-[500px]">

                {/* Stock View Controls */}
                {activeTab === "stock" && (
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search items by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex rounded-lg bg-slate-100 p-1">
                            {data.warehouses.length > 0 ? (
                                data.warehouses.map(wh => (
                                    <button
                                        key={wh.id}
                                        onClick={() => setWarehouseFilter(wh.name)}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${warehouseFilter === wh.name
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                            }`}
                                    >
                                        {wh.name} Warehouse
                                    </button>
                                ))
                            ) : (
                                // Fallback if no warehouses in DB yet
                                <>
                                    <button
                                        onClick={() => setWarehouseFilter("NSTC")}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${warehouseFilter === "NSTC" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                                    >NSTC Warehouse</button>
                                    <button
                                        onClick={() => setWarehouseFilter("SNC")}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${warehouseFilter === "SNC" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                                    >SNC Warehouse</button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Table Views */}
                {activeTab === "stock" && (
                    <PremiumTable
                        columns={inventoryColumns}
                        data={filteredInventory}
                        actions={() => (
                            <button className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        )}
                    />
                )}

                {/* Add Item Form */}
                {activeTab === "add" && (
                    <div className="max-w-3xl mx-auto py-4">
                        <div className="mb-6 border-b border-slate-100 pb-4">
                            <h2 className="text-lg font-bold text-slate-800">Add New Inventory Item</h2>
                            <p className="text-sm text-slate-500">Register new stock into the system</p>
                        </div>
                        <AddInventoryItemForm />
                    </div>
                )}

                {/* Transfer Form */}
                {activeTab === "transfer" && (
                    <div className="max-w-3xl mx-auto py-4">
                        <div className="mb-6 border-b border-slate-100 pb-4">
                            <h2 className="text-lg font-bold text-slate-800">Transfer Stock</h2>
                            <p className="text-sm text-slate-500">Move inventory between warehouses or projects</p>
                        </div>
                        <StockTransferForm inventory={allInventory} />
                    </div>
                )}

                {activeTab === "requests" && (
                    <PremiumTable
                        columns={requestColumns}
                        data={data.pendingRequests}
                        actions={() => (
                            <button className="text-blue-600 hover:text-blue-800 font-medium">Review</button>
                        )}
                    />
                )}

                {activeTab === "approved" && (
                    <PremiumTable
                        columns={requestColumns}
                        data={data.approvedRequests}
                    />
                )}

                {activeTab === "logs" && (
                    <div className="text-center py-8 text-slate-500">
                        Stock logs view (Coming Soon)
                    </div>
                )}
            </div>
        </div>
    );
}
