"use client";

/**
 * WarehouseClient Component
 * 
 * Provides a unified interface for managing warehouse operations, including:
 * - Inventory tracking (NSTC vs SNC warehouses)
 * - Supply request lifecycle (Pending -> Approved -> Issued -> Received)
 * - Supervisor-led stocktake (Manual entry of regional stock)
 * - Role-based access control (Manager, Storekeeper, Supervisor)
 */

import { useState } from "react";
import { PremiumTable } from "@/components/PremiumTable";
import { AddInventoryItemForm } from "@/components/AddInventoryItemForm";
import { StockTransferForm } from "@/components/StockTransferForm";
import { EditInventoryModal } from "@/components/EditInventoryModal";
import { BulkRequestForm } from "@/components/BulkRequestForm";
import { InventoryItem, Request, StockLog, LocalInventoryItem, Warehouse, AuditLog, LoanRecord } from "@/types";
import { ReviewRequestModal } from "@/components/ReviewRequestModal";
import { IssueRequestModal } from "@/components/IssueRequestModal";
import { EditRequestModal } from "@/components/EditRequestModal";
import { BulkDispatchModal } from "@/components/BulkDispatchModal";
import { deleteInventoryItem, confirmReceipt, bulkUpdateLocalInventory, bulkConfirmReceipt } from "@/app/actions/inventory";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WarehouseExportButton } from "@/components/WarehouseExportButton";

// Define simplified props matching what the page actually sends
interface Props {
    data: {
        inventory: InventoryItem[];
        pendingRequests: Request[];
        approvedRequests: Request[];
        loans: LoanRecord[];
        stockLogs: StockLog[];
        localInventory: LocalInventoryItem[];
        myPendingRequests: Request[];
        readyForPickup: Request[];
        warehouses: Warehouse[];
        regions: { id: number; name: string }[];
        auditLogs: AuditLog[];
        allRequests?: Request[];
        myRejectedRequests?: Request[];
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

    // Stocktake State
    const [isStocktakeMode, setIsStocktakeMode] = useState(false);
    const [stocktakeBuffer, setStocktakeBuffer] = useState<Record<string, number>>({});
    const [stocktakeSearch, setStocktakeSearch] = useState("");
    const [stocktakeCategory, setStocktakeCategory] = useState("All");

    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const handleEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setIsEditModalOpen(true);
    };

    const [reviewRequest, setReviewRequest] = useState<Request | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

    const [issueRequest, setIssueRequest] = useState<Request | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [bulkDispatchRequests, setBulkDispatchRequests] = useState<Request[] | null>(null);

    const [editingRequest, setEditingRequest] = useState<Request | null>(null);
    const [isEditRequestModalOpen, setIsEditRequestModalOpen] = useState(false);

    const [requestSearch, setRequestSearch] = useState("");
    const [requestRegionFilter, setRequestRegionFilter] = useState("All");
    const [requestDateFrom, setRequestDateFrom] = useState("");
    const [requestDateTo, setRequestDateTo] = useState("");
    const [trackingStatusFilter, setTrackingStatusFilter] = useState("All");
    const [stockCategoryFilter, setStockCategoryFilter] = useState("All");
    const [logSearch, setLogSearch] = useState("");
    const [logActionFilter, setLogActionFilter] = useState("All");
    const [logDateFrom, setLogDateFrom] = useState("");
    const [logDateTo, setLogDateTo] = useState("");

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

    const handleStocktakeSubmit = async () => {
        if (selectedLocalRegion === "All") {
            toast.error("Please select a specific region for stocktake");
            return;
        }

        if (!confirm(`Submit stocktake for ${selectedLocalRegion}?`)) return;

        const itemsToUpdate = Object.entries(stocktakeBuffer).map(([itemName, qty]) => ({
            itemName,
            qty
        }));

        if (itemsToUpdate.length === 0) {
            toast.info("No changes to submit");
            return;
        }

        try {
            const res = await bulkUpdateLocalInventory(selectedLocalRegion, itemsToUpdate, userName);
            if (res.success) {
                toast.success(res.message);
                setIsStocktakeMode(false);
                setStocktakeBuffer({});
                router.refresh();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to submit stocktake");
        }
    };

    // Initialize stocktake buffer with current values
    const startStocktake = () => {
        if (selectedLocalRegion === "All") {
            toast.error("Please select a specific region to start stocktake");
            return;
        }

        const buffer: Record<string, number> = {};
        // Pre-fill with existing local inventory
        data.localInventory
            .filter(i => i.region === selectedLocalRegion)
            .forEach(i => {
                buffer[i.itemName] = i.qty ?? 0;
            });

        setStocktakeBuffer(buffer);
        setIsStocktakeMode(true);
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
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (stockCategoryFilter === "All" || (item.category || "Uncategorized") === stockCategoryFilter)
    );

    // Combined inventory for transfer dropdown
    const allInventory = data.inventory;

    const categoryOptions = Array.from(new Set(data.inventory.map(item => item.category || "Uncategorized"))).sort();
    const requestRegionOptions = Array.from(
        new Set(
            [
                ...data.pendingRequests.map(request => request.region || ""),
                ...data.approvedRequests.map(request => request.region || ""),
                ...(data.allRequests || []).map(request => request.region || ""),
            ].filter(Boolean)
        )
    ).sort();

    const requestMatchesFilters = (request: Request) => {
        const searchValue = requestSearch.trim().toLowerCase();
        const requestDate = request.requestDate ? new Date(request.requestDate) : null;
        const withinFrom = !requestDateFrom || (requestDate && requestDate >= new Date(requestDateFrom));
        const dateToValue = requestDateTo ? new Date(requestDateTo) : null;
        if (dateToValue) {
            dateToValue.setHours(23, 59, 59, 999);
        }
        const withinTo = !dateToValue || (requestDate && requestDate <= dateToValue);

        const searchMatch = !searchValue || [
            request.itemName,
            request.region,
            request.supervisorName,
            request.notes,
            request.category,
        ]
            .filter(Boolean)
            .some((value) => `${value}`.toLowerCase().includes(searchValue));

        return searchMatch &&
            (requestRegionFilter === "All" || request.region === requestRegionFilter) &&
            withinFrom &&
            withinTo;
    };

    const filteredPendingRequests = data.pendingRequests.filter(requestMatchesFilters);
    const filteredApprovedRequests = data.approvedRequests.filter(requestMatchesFilters);
    const filteredAllRequests = (data.allRequests || [])
        .filter(requestMatchesFilters)
        .filter(request => trackingStatusFilter === "All" || request.status === trackingStatusFilter);

    const filteredStockLogs = data.stockLogs.filter(log => {
        const logDate = log.logDate ? new Date(log.logDate) : null;
        const from = logDateFrom ? new Date(logDateFrom) : null;
        const to = logDateTo ? new Date(logDateTo) : null;
        if (to) {
            to.setHours(23, 59, 59, 999);
        }

        const searchValue = logSearch.trim().toLowerCase();
        const searchMatch = !searchValue || [
            log.itemName,
            log.actionType,
            log.location,
            log.actionBy,
        ]
            .filter(Boolean)
            .some((value) => `${value}`.toLowerCase().includes(searchValue));

        return searchMatch &&
            (logActionFilter === "All" || (log.actionType || "").includes(logActionFilter)) &&
            (!from || (logDate && logDate >= from)) &&
            (!to || (logDate && logDate <= to));
    });

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
        {
            header: "Item Details",
            render: (item: Request) => (
                <div>
                    <div className="font-bold text-slate-800">{item.itemName}</div>
                    <div className="text-xs text-slate-500">{item.category}</div>
                </div>
            )
        },
        {
            header: "Quantity",
            render: (item: Request) => (
                <span className="font-semibold text-slate-700">
                    {item.qty} {item.unit}
                </span>
            )
        },
        { header: "Supervisor", accessorKey: "supervisorName" as const },
        { header: "Date", render: (item: Request) => item.requestDate ? new Date(item.requestDate).toLocaleDateString() : "-" },
        ...(userRole === "storekeeper" ? [{
            header: "Approved By",
            render: (item: Request) => (
                <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{item.approvedBy || "-"}</span>
                    {item.approvedAt && (
                        <span className="text-xs text-slate-500">
                            {new Date(item.approvedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            )
        }] : []),
        {
            header: "Status", render: (item: Request) => (
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                    item.status === "Approved" ? "bg-green-100 text-green-800" :
                        item.status === "Issued" ? "bg-blue-100 text-blue-800" :
                            "bg-slate-100 text-slate-800"
                    }`}>
                    {item.status}
                </span>
            )
        },
    ];

    const logColumns = [
        { header: "Date", render: (log: StockLog) => log.logDate ? new Date(log.logDate).toLocaleString() : "-" },
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

    const filteredRegionsForRequest = userRole === "supervisor" && allowedRegions.length > 0
        ? data.regions.filter(r => allowedRegions.includes(r.name))
        : data.regions;

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
                {userRole === "manager" && (
                    <Link
                        href="/warehouse/kpi"
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        Open Supply Reports
                    </Link>
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm overflow-x-auto max-w-full">
                {(() => {
                    let tabs: string[] = [];
                    if (userRole === "manager") {
                        tabs = ["stock", "add", "transfer", "requests", "tracking", "approved", "audit", "regional_stock", "logs"];
                    } else if (userRole === "storekeeper") {
                        tabs = ["requests", "approved", "transfer", "stock"];
                    } else if (userRole === "supervisor") {
                        tabs = ["my_requests", "rejected", "new_request", "local_stock"];
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

            {/* Add Item Tab */}
            {activeTab === "add" && (
                <div className="max-w-2xl mx-auto">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-slate-800">Add New Inventory Item</h2>
                        <p className="text-sm text-slate-500">Create a new item in the warehouse</p>
                    </div>
                    <div className="card-premium p-6">
                        <AddInventoryItemForm warehouses={data.warehouses} />
                    </div>
                </div>
            )}

            {/* Requests Tab */}
            {activeTab === "requests" && (
                <div className="space-y-8">
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">
                                    {userRole === "storekeeper" ? "Approved Requests Queue" : "Pending Requests"}
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {userRole === "storekeeper" ? "Review and dispatch approved requests by region" : "Review and approve supervisor requests"}
                                </p>
                            </div>
                            <WarehouseExportButton
                                module="requests"
                                filters={{
                                    search: requestSearch,
                                    region: requestRegionFilter === "All" ? "" : requestRegionFilter,
                                    dateFrom: requestDateFrom,
                                    dateTo: requestDateTo,
                                }}
                            />
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                            <input
                                type="text"
                                value={requestSearch}
                                onChange={(event) => setRequestSearch(event.target.value)}
                                placeholder="Search item, region, supervisor"
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <select
                                value={requestRegionFilter}
                                onChange={(event) => setRequestRegionFilter(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                                <option value="All">All regions</option>
                                {requestRegionOptions.map((region) => (
                                    <option key={region} value={region}>
                                        {region}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={requestDateFrom}
                                onChange={(event) => setRequestDateFrom(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <input
                                type="date"
                                value={requestDateTo}
                                onChange={(event) => setRequestDateTo(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                        </div>
                    </div>
                    {(() => {
                        // Select data based on role
                        const requestsToShow = userRole === "storekeeper" ? filteredApprovedRequests : filteredPendingRequests;

                        if (requestsToShow.length === 0) {
                            return (
                                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                                    {userRole === "storekeeper" ? "No approved requests to issue" : "No pending requests"}
                                </div>
                            );
                        }

                        // Group requests by region
                        const groupedRequests = requestsToShow.reduce((acc, req) => {
                            const region = req.region || "Unassigned";
                            if (!acc[region]) acc[region] = [];
                            acc[region].push(req);
                            return acc;
                        }, {} as Record<string, Request[]>);

                        const handleBulkApprove = async (region: string, reqs: Request[]) => {
                            if (!confirm(`Approve all ${reqs.length} requests for ${region}?`)) return;
                            try {
                                const reqIds = reqs.map(r => r.reqId);
                                const { bulkApproveRequests } = await import("@/app/actions/inventory");
                                const res = await bulkApproveRequests(reqIds);
                                if (res.success) {
                                    toast.success(res.message);
                                    router.refresh();
                                } else {
                                    toast.error(res.message);
                                }
                            } catch {
                                toast.error("Failed to approve requests");
                            }
                        };

                        const handleBulkReject = async (region: string, reqs: Request[]) => {
                            const reason = prompt(`Reject all ${reqs.length} requests for ${region}? Enter reason:`);
                            if (reason === null) return; // User cancelled

                            try {
                                const reqIds = reqs.map(r => r.reqId);
                                const { bulkRejectRequests } = await import("@/app/actions/inventory");
                                const res = await bulkRejectRequests(reqIds, reason || "No reason provided");
                                if (res.success) {
                                    toast.success(res.message);
                                    router.refresh();
                                } else {
                                    toast.error(res.message);
                                }
                            } catch {
                                toast.error("Failed to reject requests");
                            }
                        };

                        return Object.entries(groupedRequests).sort().map(([region, requests]) => (
                            <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${userRole === "storekeeper" ? "bg-green-500" : "bg-yellow-400"}`}></span>
                                        {region}
                                    </h3>
                                    <div className="flex gap-2 items-center">
                                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200 mr-2">
                                            {requests.length} Requests
                                        </span>

                                        {userRole === "storekeeper" ? (
                                            <button
                                                onClick={() => setBulkDispatchRequests(requests)}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
                                            >
                                                Bulk Dispatch
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleBulkReject(region, requests)}
                                                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-md text-xs font-medium hover:bg-red-50 transition-colors shadow-sm"
                                                >
                                                    Reject All
                                                </button>
                                                <button
                                                    onClick={() => handleBulkApprove(region, requests)}
                                                    className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 transition-colors shadow-sm"
                                                >
                                                    Approve All
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <PremiumTable
                                    columns={requestColumns}
                                    data={requests}
                                    actions={(item) => (
                                        userRole === "storekeeper" ? (
                                            <button
                                                onClick={() => {
                                                    setIssueRequest(item as Request);
                                                    setIsIssueModalOpen(true);
                                                }}
                                                className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm"
                                            >
                                                Issue
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setReviewRequest(item as Request);
                                                    setIsReviewModalOpen(true);
                                                }}
                                                className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm"
                                            >
                                                Review
                                            </button>
                                        )
                                    )}
                                />
                            </div>
                        ));
                    })()}
                </div>
            )}

            {/* Approved Tab */}
            {activeTab === "approved" && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Approved Requests</h2>
                            <p className="text-sm text-slate-500">History of approved supply requests</p>
                        </div>
                        <WarehouseExportButton
                            module="approved"
                            filters={{
                                search: requestSearch,
                                region: requestRegionFilter === "All" ? "" : requestRegionFilter,
                                dateFrom: requestDateFrom,
                                dateTo: requestDateTo,
                            }}
                        />
                    </div>
                    {filteredApprovedRequests.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                            No approved requests found
                        </div>
                    ) : (
                        <PremiumTable
                            columns={requestColumns}
                            data={filteredApprovedRequests}
                        />
                    )}
                </div>
            )}

            {/* Tracking Tab (Manager) */}
            {activeTab === "tracking" && (
                <div className="space-y-8">
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Request Tracking</h2>
                                <p className="text-sm text-slate-500">Lifecycle view of all requests</p>
                            </div>
                            <WarehouseExportButton
                                module="tracking"
                                filters={{
                                    search: requestSearch,
                                    region: requestRegionFilter === "All" ? "" : requestRegionFilter,
                                    status: trackingStatusFilter === "All" ? "" : trackingStatusFilter,
                                    dateFrom: requestDateFrom,
                                    dateTo: requestDateTo,
                                }}
                            />
                        </div>

                        <div className="grid gap-3 md:grid-cols-5">
                            <input
                                type="text"
                                value={requestSearch}
                                onChange={(event) => setRequestSearch(event.target.value)}
                                placeholder="Search item, region, supervisor"
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <select
                                value={requestRegionFilter}
                                onChange={(event) => setRequestRegionFilter(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                                <option value="All">All regions</option>
                                {requestRegionOptions.map((region) => (
                                    <option key={region} value={region}>
                                        {region}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={trackingStatusFilter}
                                onChange={(event) => setTrackingStatusFilter(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                                <option value="All">All statuses</option>
                                {["Pending", "Approved", "Rejected", "Issued", "Received"].map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={requestDateFrom}
                                onChange={(event) => setRequestDateFrom(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <input
                                type="date"
                                value={requestDateTo}
                                onChange={(event) => setRequestDateTo(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                        </div>
                    </div>
                    {filteredAllRequests.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                            No requests found
                        </div>
                    ) : (
                        (() => {
                            const groupedAll = filteredAllRequests.reduce((acc, req) => {
                                const region = req.region || "Unassigned";
                                if (!acc[region]) acc[region] = [];
                                acc[region].push(req);
                                return acc;
                            }, {} as Record<string, Request[]>);

                            return Object.entries(groupedAll).sort().map(([region, requests]) => (
                                <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                            {region}
                                        </h3>
                                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                                            {requests.length} Requests
                                        </span>
                                    </div>
                                    <PremiumTable
                                        columns={[
                                            ...requestColumns,
                                            { header: "Approver", accessorKey: "approvedBy" as const },
                                            { header: "Issued By", accessorKey: "issuedBy" as const }
                                        ]}
                                        data={requests}
                                    />
                                </div>
                            ));
                        })()
                    )}
                </div>
            )}

            {/* Rejected Tab (Supervisor) */}
            {activeTab === "rejected" && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-red-600">Rejected Requests</h2>
                            <p className="text-sm text-slate-500">Requests rejected by management</p>
                        </div>
                    </div>
                    {(!data.myRejectedRequests || data.myRejectedRequests.length === 0) ? (
                        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                            No rejected requests
                        </div>
                    ) : (
                        <PremiumTable
                            columns={[
                                { header: "Item", accessorKey: "itemName" as const },
                                {
                                    header: "Quantity",
                                    render: (item: Request) => (
                                        <span className="font-semibold text-slate-700">{item.qty} {item.unit}</span>
                                    )
                                },
                                { header: "Date", render: (item: Request) => item.requestDate ? new Date(item.requestDate).toLocaleDateString() : "-" },
                                {
                                    header: "Reason",
                                    render: (item: Request) => (
                                        <div className="text-red-600 font-medium bg-red-50 p-2 rounded-md border border-red-100 text-sm">
                                            {item.notes || "No reason provided"}
                                        </div>
                                    )
                                }
                            ]}
                            data={data.myRejectedRequests}
                        />
                    )}
                </div>
            )}

            {/* Audit Tab */}
            {activeTab === "audit" && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Audit Logs</h2>
                            <p className="text-sm text-slate-500">System activities and tracked actions</p>
                        </div>
                        <WarehouseExportButton module="audit" />
                    </div>
                    <PremiumTable
                        columns={[
                            { header: "Timestamp", render: (log: AuditLog) => new Date(log.timestamp).toLocaleString() },
                            { header: "User", accessorKey: "userName" },
                            { header: "Action", accessorKey: "action" },
                            { header: "Module", accessorKey: "module" },
                            { header: "Details", accessorKey: "details" },
                        ]}
                        data={data.auditLogs}
                    />
                </div>
            )}

            {/* Stock Transfer Tab */}
            {activeTab === "transfer" && (
                <StockTransferForm
                    inventory={allInventory}
                    loans={data.loans}
                    stockLogs={data.stockLogs}
                />
            )}
            {["stock", "logs", "new_request", "my_requests", "regional_stock", "local_stock"].includes(activeTab) && (
            <div className="card-premium p-6 min-h-[500px]">

                {/* Stock View Controls */}
                {activeTab === "stock" && (
                    <div className="flex flex-col gap-4 mb-6 md:flex-row">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search items by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <select
                            value={stockCategoryFilter}
                            onChange={(event) => setStockCategoryFilter(event.target.value)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                        >
                            <option value="All">All categories</option>
                            {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                        <div className="flex rounded-lg bg-slate-100 p-1">
                            {data.warehouses.length > 0 ? (
                                data.warehouses.filter(w => w.name !== "CWW").map(wh => (
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
                    <div className="space-y-8">
                        <div className="flex justify-end">
                            <WarehouseExportButton
                                module="stock"
                                filters={{
                                    search: searchTerm,
                                    warehouse: warehouseFilter,
                                    category: stockCategoryFilter === "All" ? "" : stockCategoryFilter,
                                }}
                            />
                        </div>

                        {(() => {
                            if (filteredInventory.length === 0) {
                                return (
                                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                                        No items found
                                    </div>
                                );
                            }

                            // Group by Category
                            const groupedInventory: Record<string, InventoryItem[]> = {};
                            filteredInventory.forEach(item => {
                                const category = item.category || "Uncategorized";
                                if (!groupedInventory[category]) groupedInventory[category] = [];
                                groupedInventory[category].push(item);
                            });

                            return Object.entries(groupedInventory).sort().map(([category, items]) => (
                                <div key={category} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                            {category}
                                        </h3>
                                        <div className="flex gap-2">
                                            <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200 flex items-center">
                                                {items.length} Items
                                            </span>
                                        </div>
                                    </div>
                                    <PremiumTable
                                        columns={inventoryColumns}
                                        data={items}
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
                                </div>
                            ));
                        })()}
                    </div>
                )}

                {activeTab === "logs" && (
                    <div className="space-y-4">
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-5">
                            <input
                                type="text"
                                value={logSearch}
                                onChange={(event) => setLogSearch(event.target.value)}
                                placeholder="Search item, action, user"
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <select
                                value={logActionFilter}
                                onChange={(event) => setLogActionFilter(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                                <option value="All">All actions</option>
                                {["Transfer", "Lent", "Returned", "Issued", "Stock Take", "Manual Edit"].map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={logDateFrom}
                                onChange={(event) => setLogDateFrom(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <input
                                type="date"
                                value={logDateTo}
                                onChange={(event) => setLogDateTo(event.target.value)}
                                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <div className="flex justify-end">
                                <WarehouseExportButton
                                    module="movements"
                                    filters={{
                                        search: logSearch,
                                        action: logActionFilter === "All" ? "" : logActionFilter,
                                        dateFrom: logDateFrom,
                                        dateTo: logDateTo,
                                    }}
                                />
                            </div>
                        </div>
                        <PremiumTable
                            columns={logColumns}
                            data={filteredStockLogs}
                        />
                    </div>
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
                            regions={filteredRegionsForRequest}
                        />
                    </div>
                )}

                {activeTab === "my_requests" && (
                    <div className="space-y-8">
                        <div className="flex justify-end">
                            <WarehouseExportButton module="tracking" label="Export My Request History" />
                        </div>
                        {/* Ready for Pickup Section */}
                        {data.readyForPickup.length > 0 && (
                            <div className="space-y-6">
                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-green-700 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        Ready for Pickup
                                    </h3>
                                    <p className="text-sm text-slate-500">Please collect these items and confirm receipt</p>
                                </div>

                                {(() => {
                                    // Helper for Bulk Confirm
                                    const handleBulkConfirm = async (region: string, reqs: Request[]) => {
                                        if (!confirm(`Confirm receipt for all ${reqs.length} items in ${region}?`)) return;

                                        try {
                                            const reqIds = reqs.map(r => r.reqId);
                                            const res = await bulkConfirmReceipt(reqIds);

                                            if (res.success) {
                                                toast.success(res.message);
                                                router.refresh();
                                            } else {
                                                toast.error(res.message);
                                            }
                                        } catch {
                                            toast.error("Failed to confirm receipts");
                                        }
                                    };

                                    const groupedReady = data.readyForPickup.reduce((acc, req) => {
                                        const region = req.region || "Unassigned";
                                        if (!acc[region]) acc[region] = [];
                                        acc[region].push(req);
                                        return acc;
                                    }, {} as Record<string, Request[]>);

                                    return Object.entries(groupedReady).sort().map(([region, requests]) => (
                                        <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                    {region}
                                                </h3>
                                                <div className="flex gap-2 items-center">
                                                    <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                                                        {requests.length} Items
                                                    </span>
                                                    <button
                                                        onClick={() => handleBulkConfirm(region, requests)}
                                                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-green-700 transition-colors shadow-sm"
                                                    >
                                                        Confirm All
                                                    </button>
                                                </div>
                                            </div>
                                            <PremiumTable
                                                columns={requestColumns}
                                                data={requests}
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
                                    ));
                                })()}
                            </div>
                        )}

                        <div>
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-slate-700">Pending Requests</h3>
                            </div>

                            {(() => {
                                if (!data.myPendingRequests || data.myPendingRequests.length === 0) {
                                    return (
                                        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 italic">
                                            No pending requests
                                        </div>
                                    );
                                }

                                // Group by Region for Supervisor too (User requested all grouped)
                                const groupedPending = data.myPendingRequests.reduce((acc, req) => {
                                    const region = req.region || "Unassigned";
                                    if (!acc[region]) acc[region] = [];
                                    acc[region].push(req);
                                    return acc;
                                }, {} as Record<string, Request[]>);

                                return Object.entries(groupedPending).sort().map(([region, requests]) => (
                                    <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
                                        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                                                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                                {region}
                                            </h3>
                                            <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                                                {requests.length} Requests
                                            </span>
                                        </div>
                                        <PremiumTable
                                            columns={requestColumns}
                                            data={requests}
                                            actions={(item) => (
                                                <button
                                                    onClick={() => {
                                                        setEditingRequest(item as Request);
                                                        setIsEditRequestModalOpen(true);
                                                    }}
                                                    className="px-3 py-1 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md text-xs font-medium transition-colors"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                        />
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                )}

                {/* Regional Stock View */}
                {activeTab === "regional_stock" && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Regional Stock Overview</h2>
                                <p className="text-sm text-slate-500">Inventory levels across all project regions</p>
                            </div>
                            <WarehouseExportButton module="regional-stock" />
                        </div>

                        {data.localInventory.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 italic">
                                No regional stock data available
                            </div>
                        ) : (
                            (() => {
                                // Group by Region (Filtered by Role)
                                // Use myLocalStock logic but without the TAB filter (selectedLocalRegion)
                                // We want "All Allowed Regions" here
                                const visibleStock = data.localInventory.filter(item => {
                                    if (userRole === "supervisor") {
                                        return allowedRegions.includes(item.region);
                                    }
                                    return true;
                                });

                                const groupedStock: Record<string, LocalInventoryItem[]> = {};
                                visibleStock.forEach(item => {
                                    const region = item.region || "Unassigned";
                                    if (!groupedStock[region]) groupedStock[region] = [];
                                    groupedStock[region].push(item);
                                });

                                return Object.entries(groupedStock).sort().map(([region, items]) => (
                                    <div key={region} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                                {region} Region
                                            </h3>
                                            <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500">
                                                {items.reduce((acc, curr) => acc + (curr.qty || 0), 0)} Total Items
                                            </span>
                                        </div>
                                        <PremiumTable
                                            columns={localInventoryColumns}
                                            data={items}
                                        />
                                    </div>
                                ));
                            })()
                        )}
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
                                <WarehouseExportButton
                                    module="regional-stock"
                                    filters={{
                                        region: selectedLocalRegion === "All" ? "" : selectedLocalRegion,
                                    }}
                                />
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


                        {!isStocktakeMode ? (
                            <>
                                <div className="flex justify-end mb-4">
                                    <button
                                        onClick={startStocktake}
                                        disabled={selectedLocalRegion === "All"}
                                        className={`px-4 py-2 rounded-lg font-medium text-sm shadow-sm transition-all flex items-center gap-2 ${selectedLocalRegion === "All"
                                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                            : "bg-blue-600 text-white hover:bg-blue-700"
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                        Manual Stocktake
                                    </button>
                                </div>
                                <PremiumTable
                                    columns={localInventoryColumns}
                                    data={myLocalStock}
                                />
                            </>
                        ) : (
                            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                <div className="flex flex-col gap-4 mb-6">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800">Stocktake: {selectedLocalRegion}</h3>
                                            <p className="text-sm text-slate-500">Enter current counts for all items.</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setIsStocktakeMode(false)}
                                                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleStocktakeSubmit}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm shadow-sm"
                                            >
                                                Submit Stocktake
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stocktake Filters */}
                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            placeholder="Search items..."
                                            value={stocktakeSearch}
                                            onChange={(e) => setStocktakeSearch(e.target.value)}
                                            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <select
                                            value={stocktakeCategory}
                                            onChange={(e) => setStocktakeCategory(e.target.value)}
                                            aria-label="Filter by category"
                                            className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="All">All Categories</option>
                                            {Array.from(new Set(data.inventory.map(i => i.category || "Uncategorized"))).sort().map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* Get unique items filter by search and category */}
                                    {Array.from(new Set(data.inventory.map(i => i.nameEn)))
                                        .filter(itemName => {
                                            // 1. Search Filter
                                            if (stocktakeSearch && !itemName.toLowerCase().includes(stocktakeSearch.toLowerCase())) return false;

                                            // 2. Category Filter
                                            if (stocktakeCategory !== "All") {
                                                const item = data.inventory.find(i => i.nameEn === itemName);
                                                // Determine category... use the first item found with this name
                                                if (item?.category !== stocktakeCategory) return false;
                                            }
                                            return true;
                                        })
                                        .sort()
                                        .map(itemName => {
                                            const currentVal = stocktakeBuffer[itemName] ?? 0;
                                            return (
                                                <div key={itemName} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                                                    <span className="font-medium text-slate-700 truncate mr-2" title={itemName}>{itemName}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={currentVal}
                                                        aria-label={`Quantity for ${itemName}`}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            setStocktakeBuffer(prev => ({
                                                                ...prev,
                                                                [itemName]: val
                                                            }));
                                                        }}
                                                        className="w-24 px-3 py-1 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono"
                                                    />
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Edit Modal */}
                {editingItem && (
                    <EditInventoryModal
                        isOpen={isEditModalOpen}
                        onClose={() => setIsEditModalOpen(false)}
                        item={editingItem}
                        userName={userName}
                    />
                )}

                {/* Review Request Modal */}
                {reviewRequest && (
                    <ReviewRequestModal
                        isOpen={isReviewModalOpen}
                        onClose={() => {
                            setIsReviewModalOpen(false);
                            router.refresh();
                        }}
                        request={reviewRequest}
                    />
                )}

                {/* Issue Request Modal */}
                {issueRequest && (
                    <IssueRequestModal
                        isOpen={isIssueModalOpen}
                        onClose={() => {
                            setIsIssueModalOpen(false);
                            router.refresh();
                        }}
                        request={issueRequest}
                        userName={userName}
                    />
                )}

                {bulkDispatchRequests && (
                    <BulkDispatchModal
                        isOpen={!!bulkDispatchRequests}
                        onClose={() => {
                            setBulkDispatchRequests(null);
                            router.refresh();
                        }}
                        approvedRequests={bulkDispatchRequests}
                        inventory={data.inventory}
                        userName={userName}
                    />
                )}

                {/* Supervisor Edit Request Modal */}
                {editingRequest && (
                    <EditRequestModal
                        isOpen={isEditRequestModalOpen}
                        onClose={() => {
                            setIsEditRequestModalOpen(false);
                            router.refresh();
                        }}
                        request={editingRequest}
                    />
                )}
            </div>
            )}
        </div>
    );
}
