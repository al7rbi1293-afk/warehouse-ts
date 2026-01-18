"use client";

import { useState } from "react";
import { CATEGORIES, LOCATIONS, UNITS, AREAS, TEXT } from "@/lib/constants";
import { createInventoryItem, updateBulkStock, transferStock } from "@/app/actions/inventory";
import { toast } from "sonner";

interface InventoryItem {
    id: number;
    nameEn: string;
    category: string | null;
    unit: string | null;
    qty: number;
    location: string;
    status: string | null;
    lastUpdated: Date | null;
}

interface Request {
    reqId: number;
    supervisorName: string | null;
    region: string | null;
    itemName: string | null;
    category: string | null;
    qty: number | null;
    unit: string | null;
    status: string | null;
    requestDate: Date;
    notes: string | null;
}

interface StockLog {
    id: number;
    logDate: Date;
    itemName: string | null;
    changeAmount: number | null;
    location: string | null;
    actionBy: string | null;
    actionType: string | null;
    unit: string | null;
    newQty: number | null;
}

interface LocalInventory {
    region: string;
    itemName: string;
    qty: number | null;
    lastUpdated: Date | null;
    updatedBy: string | null;
}

interface WarehouseData {
    nstcInventory: InventoryItem[];
    sncInventory: InventoryItem[];
    pendingRequests: Request[];
    approvedRequests: Request[];
    stockLogs: StockLog[];
    localInventory: LocalInventory[];
    myPendingRequests: Request[];
    readyForPickup: Request[];
}

interface Props {
    data: WarehouseData;
    userRole: string;
    userName: string;
    userRegion: string;
}

export function WarehouseClient({ data, userRole, userName, userRegion }: Props) {
    const [activeTab, setActiveTab] = useState("stock");
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Manager tabs
    const managerTabs = [
        { id: "stock", label: "📦 Stock Management" },
        { id: "transfer", label: "🔄 Internal Transfer" },
        { id: "review", label: "⏳ Bulk Review" },
        { id: "local", label: TEXT.local_inv },
        { id: "logs", label: "📜 Logs" },
    ];

    // Storekeeper tabs
    const storekeeperTabs = [
        { id: "issue", label: TEXT.approved_reqs },
        { id: "today", label: "📋 Issued Today" },
        { id: "nstc", label: "NSTC Stock Take" },
        { id: "snc", label: "SNC Stock Take" },
    ];

    // Supervisor tabs
    const supervisorTabs = [
        { id: "order", label: TEXT.req_form },
        { id: "pickup", label: "🚚 Ready for Pickup" },
        { id: "pending", label: "⏳ My Pending" },
        { id: "local", label: TEXT.local_inv },
    ];

    const tabs = userRole === "manager"
        ? managerTabs
        : userRole === "storekeeper"
            ? storekeeperTabs
            : supervisorTabs;

    const regions = userRegion.includes(",") ? userRegion.split(",") : [userRegion];
    const [selectedRegion, setSelectedRegion] = useState(regions[0]);

    const handleCreateItem = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);

        const result = await createInventoryItem(formData);
        if (result.success) {
            toast.success(result.message);
            (e.target as HTMLFormElement).reset();
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const filteredNstc = data.nstcInventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSnc = data.sncInventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">
                {userRole === "manager" ? TEXT.manager_role : userRole === "storekeeper" ? TEXT.storekeeper_role : TEXT.supervisor_role}
            </h1>

            {/* Region Selector for Supervisors */}
            {userRole === "supervisor" && regions.length > 1 && (
                <div className="mb-4">
                    <label className="form-label">📂 Select Active Region</label>
                    <select
                        className="form-input w-auto"
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                    >
                        {regions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Tabs */}
            <div className="tabs mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Manager: Stock Management */}
            {userRole === "manager" && activeTab === "stock" && (
                <div>
                    {/* Search */}
                    <input
                        type="text"
                        className="form-input mb-4"
                        placeholder="🔍 Search Inventory..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    {/* Create Item Form */}
                    <details className="card mb-6">
                        <summary className="cursor-pointer font-bold">{TEXT.create_item_title}</summary>
                        <form onSubmit={handleCreateItem} className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                                <label className="form-label">Name</label>
                                <input type="text" name="nameEn" className="form-input" required />
                            </div>
                            <div>
                                <label className="form-label">Category</label>
                                <select name="category" className="form-input">
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Location</label>
                                <select name="location" className="form-input">
                                    {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Qty</label>
                                <input type="number" name="qty" className="form-input" min="0" defaultValue="0" />
                            </div>
                            <div>
                                <label className="form-label">Unit</label>
                                <select name="unit" className="form-input">
                                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div className="col-span-full">
                                <button type="submit" className="btn" disabled={isLoading}>
                                    {TEXT.create_btn}
                                </button>
                            </div>
                        </form>
                    </details>

                    {/* Inventory Tables */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* NSTC */}
                        <div className="card">
                            <h3 className="font-bold text-lg mb-4">📦 NSTC Stock</h3>
                            <div className="overflow-x-auto max-h-96">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Category</th>
                                            <th>Qty</th>
                                            <th>Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredNstc.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.nameEn}</td>
                                                <td>{item.category}</td>
                                                <td>
                                                    <span className={`badge ${item.qty < 10 ? "badge-warning" : "badge-success"}`}>
                                                        {item.qty}
                                                    </span>
                                                </td>
                                                <td>{item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* SNC */}
                        <div className="card">
                            <h3 className="font-bold text-lg mb-4">📦 SNC Stock</h3>
                            <div className="overflow-x-auto max-h-96">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Category</th>
                                            <th>Qty</th>
                                            <th>Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSnc.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.nameEn}</td>
                                                <td>{item.category}</td>
                                                <td>
                                                    <span className={`badge ${item.qty < 10 ? "badge-warning" : "badge-success"}`}>
                                                        {item.qty}
                                                    </span>
                                                </td>
                                                <td>{item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Manager: Internal Transfer */}
            {userRole === "manager" && activeTab === "transfer" && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">🔄 Internal Stock Transfer (SNC ➡️ NSTC)</h3>
                    <p className="text-gray-500 mb-4">Pull stock from SNC warehouse to NSTC warehouse.</p>

                    {data.sncInventory.length > 0 ? (
                        <StockTransferForm items={data.sncInventory} userName={userName} />
                    ) : (
                        <p className="text-gray-500">SNC Inventory is empty.</p>
                    )}
                </div>
            )}

            {/* Manager: Bulk Review */}
            {userRole === "manager" && activeTab === "review" && (
                <div>
                    {data.pendingRequests.length === 0 ? (
                        <div className="card text-center text-gray-500 py-8">No pending requests</div>
                    ) : (
                        <RequestReviewList requests={data.pendingRequests} inventory={data.nstcInventory} />
                    )}
                </div>
            )}

            {/* Manager: Local Inventory */}
            {(userRole === "manager" && activeTab === "local") && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📊 Branch Inventory (By Area)</h3>
                    <div className="tabs mb-4">
                        {AREAS.map((area) => (
                            <button
                                key={area}
                                className={`tab ${selectedRegion === area ? "active" : ""}`}
                                onClick={() => setSelectedRegion(area)}
                            >
                                {area}
                            </button>
                        ))}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Last Updated</th>
                                    <th>Updated By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.localInventory
                                    .filter((item) => item.region === selectedRegion)
                                    .map((item, idx) => (
                                        <tr key={idx}>
                                            <td>{item.itemName}</td>
                                            <td>{item.qty}</td>
                                            <td>{item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : "-"}</td>
                                            <td>{item.updatedBy || "-"}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Manager: Logs */}
            {userRole === "manager" && activeTab === "logs" && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📜 Stock Logs</h3>
                    <div className="overflow-x-auto max-h-96">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Item</th>
                                    <th>Change</th>
                                    <th>New Qty</th>
                                    <th>Location</th>
                                    <th>Action</th>
                                    <th>By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.stockLogs.map((log) => (
                                    <tr key={log.id}>
                                        <td>{new Date(log.logDate).toLocaleString()}</td>
                                        <td>{log.itemName}</td>
                                        <td>
                                            <span className={log.changeAmount && log.changeAmount > 0 ? "text-green-600" : "text-red-600"}>
                                                {log.changeAmount && log.changeAmount > 0 ? "+" : ""}{log.changeAmount}
                                            </span>
                                        </td>
                                        <td>{log.newQty}</td>
                                        <td>{log.location}</td>
                                        <td>{log.actionType}</td>
                                        <td>{log.actionBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Storekeeper tabs would go here */}
            {userRole === "storekeeper" && (
                <div className="card text-center text-gray-500 py-8">
                    Storekeeper view - {activeTab}
                </div>
            )}

            {/* Supervisor tabs would go here */}
            {userRole === "supervisor" && (
                <div className="card text-center text-gray-500 py-8">
                    Supervisor view for {selectedRegion} - {activeTab}
                </div>
            )}
        </div>
    );
}

// Stock Transfer Form Component
function StockTransferForm({ items, userName }: { items: InventoryItem[]; userName: string }) {
    const [transfers, setTransfers] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);

    const handleTransfer = async () => {
        setIsLoading(true);
        const toTransfer = Object.entries(transfers).filter(([, qty]) => qty > 0);

        if (toTransfer.length === 0) {
            toast.warning("Please enter quantity for at least one item.");
            setIsLoading(false);
            return;
        }

        let successCount = 0;
        for (const [itemName, qty] of toTransfer) {
            const item = items.find((i) => i.nameEn === itemName);
            if (item && qty <= item.qty) {
                const result = await transferStock(itemName, qty, userName, item.unit || "Piece");
                if (result.success) successCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`Successfully transferred ${successCount} items!`);
            setTransfers({});
        }
        setIsLoading(false);
    };

    return (
        <div>
            <div className="overflow-x-auto max-h-96 mb-4">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Available</th>
                            <th>Unit</th>
                            <th>Transfer Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id}>
                                <td>{item.nameEn}</td>
                                <td>{item.category}</td>
                                <td>{item.qty}</td>
                                <td>{item.unit}</td>
                                <td>
                                    <input
                                        type="number"
                                        className="form-input w-24"
                                        min="0"
                                        max={item.qty}
                                        value={transfers[item.nameEn] || 0}
                                        onChange={(e) => setTransfers({ ...transfers, [item.nameEn]: parseInt(e.target.value) || 0 })}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button className="btn" onClick={handleTransfer} disabled={isLoading}>
                {isLoading ? "Processing..." : "Execute Bulk Transfer"}
            </button>
        </div>
    );
}

// Request Review List Component
function RequestReviewList({ requests, inventory }: { requests: Request[]; inventory: InventoryItem[] }) {
    const regions = [...new Set(requests.map((r) => r.region))];
    const [selectedRegion, setSelectedRegion] = useState(regions[0] || "");
    const stockMap = Object.fromEntries(inventory.map((i) => [i.nameEn, i.qty]));

    const regionRequests = requests.filter((r) => r.region === selectedRegion);

    return (
        <div>
            <div className="tabs mb-4">
                {regions.map((region) => (
                    <button
                        key={region}
                        className={`tab ${selectedRegion === region ? "active" : ""}`}
                        onClick={() => setSelectedRegion(region || "")}
                    >
                        {region}
                    </button>
                ))}
            </div>

            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Supervisor</th>
                            <th>Req Qty</th>
                            <th>Available</th>
                            <th>Unit</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {regionRequests.map((req) => (
                            <tr key={req.reqId}>
                                <td>{req.itemName}</td>
                                <td>{req.supervisorName}</td>
                                <td>{req.qty}</td>
                                <td>
                                    <span className={`badge ${(stockMap[req.itemName || ""] || 0) >= (req.qty || 0) ? "badge-success" : "badge-error"}`}>
                                        {stockMap[req.itemName || ""] || 0}
                                    </span>
                                </td>
                                <td>{req.unit}</td>
                                <td>
                                    <button className="btn btn-success text-xs mr-2">Approve</button>
                                    <button className="btn btn-danger text-xs">Reject</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
