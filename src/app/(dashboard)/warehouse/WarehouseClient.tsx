"use client";

import { useState } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { AddInventoryItemForm } from "@/components/AddInventoryItemForm";
import { StockTransferForm } from "@/components/StockTransferForm";
import { EditInventoryModal } from "@/components/EditInventoryModal";
import { BulkRequestForm } from "@/components/BulkRequestForm";
import { InventoryItem, Request, StockLog, LocalInventoryItem, Warehouse } from "@/types";
import { deleteInventoryItem, confirmReceipt } from "@/app/actions/inventory";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
        regions: { id: number; name: string }[];
    };
    userRole?: string;
    userName: string;
    userRegion?: string | null;
}

export function WarehouseClient({ data, userName, userRole = "manager", userRegion = "Riyadh" }: Props) {
    const router = useRouter();

    // Determine default tab based on role
    const defaultTab = userRole === "supervisor" ? "my_requests" :
        userRole === "storekeeper" ? "requests" : "stock";

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [searchTerm, setSearchTerm] = useState("");
    // Default to first warehouse if available, else empty or generic
    const [warehouseFilter, setWarehouseFilter] = useState<string>(data.warehouses[0]?.name || "NSTC");
    const [selectedLocalRegion, setSelectedLocalRegion] = useState<string>("All");

    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const handleEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setIsEditModalOpen(true);
    };

    const handleConfirmReceipt = async (reqId: number) => {
        try {
            const res = await confirmReceipt(reqId);
            if (res.success) {
                toast.success(res.message);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to confirm receipt");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this item?")) return;

        try {
            const res = await deleteInventoryItem(id);
            if (res.success) {
                toast.success(res.message);
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to delete item");
        }
    };

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
        { header: "Category", accessorKey: "category" as const },
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

    const logColumns = [
        { header: "Date", render: (log: StockLog) => new Date(log.logDate).toLocaleString() },
        { header: "Item", accessorKey: "itemName" as const },
        {
            header: "Change", accessorKey: "changeAmount" as const, render: (log: StockLog) => (
                <span className={`font-semibold ${log.changeAmount && log.changeAmount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {log.changeAmount && log.changeAmount > 0 ? "+" : ""}{log.changeAmount} {log.unit}
                </span>
            )
        },
        { header: "New Qty", accessorKey: "newQty" as const },
        { header: "Action", accessorKey: "actionType" as const },
        { header: "User", accessorKey: "actionBy" as const },
    ];

    const localInventoryColumns = [
        { header: "Item Name", accessorKey: "itemName" as const },
        {
            header: "Quantity", accessorKey: "qty" as const, render: (item: LocalInventoryItem) => (
                <span className="font-bold text-slate-700">{item.qty}</span>
            )
        },
        {
            header: "Region", accessorKey: "region" as const, render: (item: LocalInventoryItem) => (
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                    {item.region}
                </span>
            )
        },
        { header: "Last Updated", render: (item: LocalInventoryItem) => item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : "-" },
    ];

    // Parse allowed regions for supervisor
    const allowedRegions = userRegion
        ? userRegion.split(",").map(r => r.trim())
        : [];

    // Filter local inventory based on role and selection
    const myLocalStock = data.localInventory.filter(item => {
        // 1. Role-based filtering
        if (userRole === "supervisor") {
            if (!allowedRegions.includes(item.region)) return false;
        }

        // 2. Tab-based filtering
        if (selectedLocalRegion !== "All" && item.region !== selectedLocalRegion) return false;

        return true;
    });

    // Determine regions to show in tabs
    const regionTabs = userRole === "supervisor"
        ? allowedRegions
        : data.regions.map(r => r.name);


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
                {(() => {
                    let tabs: string[] = [];
                    if (userRole === "manager") {
                        tabs = ["stock", "add", "transfer", "requests", "approved", "logs"];
                    } else if (userRole === "storekeeper") {
                        tabs = ["requests", "approved", "stock"];
                    } else if (userRole === "supervisor") {
                        tabs = ["my_requests", "new_request", "local_stock"];
                    }

                    return tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                        >
                            {tab.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </button>
                    ));
                })()}
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
                        actions={(item) => (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(item as InventoryItem)}
                                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete((item as InventoryItem).id)}
                                    className="text-red-600 hover:text-red-800 font-medium text-sm"
                                >
                                    Delete
                                </button>
                            </div>
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
                        <AddInventoryItemForm warehouses={data.warehouses} />
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
                    <PremiumTable
                        columns={logColumns}
                        data={data.stockLogs}
                    />
                )}

                {/* Supervisor Views */}
                {activeTab === "new_request" && (
                    <div className="max-w-3xl mx-auto py-4">
                        <div className="mb-6 border-b border-slate-100 pb-4">
                            <h2 className="text-lg font-bold text-slate-800">New Supply Request</h2>
                            <p className="text-sm text-slate-500">Request items for your region</p>
                        </div>
                        <BulkRequestForm
                            inventory={data.inventory}
                            supervisorName={userName}
                            defaultRegion={userRegion || ""}
                            regions={data.regions}
                        />
                    </div>
                )}

                {activeTab === "my_requests" && (
                    <div className="space-y-8">
                        {/* Ready for Pickup Section */}
                        {data.readyForPickup.length > 0 && (
                            <div>
                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-green-700 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        Ready for Pickup
                                    </h3>
                                    <p className="text-sm text-slate-500">Please collect these items and confirm receipt</p>
                                </div>
                                <PremiumTable
                                    columns={requestColumns}
                                    data={data.readyForPickup}
                                    actions={(item) => (
                                        <button
                                            onClick={() => handleConfirmReceipt((item as Request).reqId)}
                                            className="px-3 py-1 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                                        >
                                            Confirm Receipt
                                        </button>
                                    )}
                                />
                            </div>
                        )}

                        {/* Pending Requests Section */}
                        <div>
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-slate-700">Pending Requests</h3>
                            </div>
                            <PremiumTable
                                columns={requestColumns}
                                data={data.myPendingRequests || []}
                            />
                        </div>
                    </div>
                )}

                {activeTab === "local_stock" && (
                    <div>
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">
                                        Local Stock - {selectedLocalRegion === "All" ? "All Regions" : selectedLocalRegion}
                                    </h2>
                                    <p className="text-sm text-slate-500">Current inventory in your region</p>
                                </div>
                            </div>

                            {/* Region Tabs */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedLocalRegion("All")}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedLocalRegion === "All"
                                        ? "bg-slate-800 text-white border-slate-800"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                        }`}
                                >
                                    All
                                </button>
                                {regionTabs.map(region => (
                                    <button
                                        key={region}
                                        onClick={() => setSelectedLocalRegion(region)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedLocalRegion === region
                                            ? "bg-slate-800 text-white border-slate-800"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        {region}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <PremiumTable
                            columns={localInventoryColumns}
                            data={myLocalStock}
                        />
                    </div>
                )}
            </div>
            {/* Edit Modal */}
            {editingItem && (
                <EditInventoryModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    item={editingItem}
                    userName={userName}
                />
            )}
        </div>
    );
}
