"use client";

import { useState } from "react";
import { TEXT, CATEGORIES, UNITS, LOCATIONS } from "@/lib/constants";
import { updateRequestStatus, issueRequest, updateBulkStock, addInventoryItem, updateInventoryItem, deleteInventoryItem, createBulkRequest, confirmReceipt, bulkUpdateLocalInventory } from "@/app/actions/inventory";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
    const [activeTab, setActiveTab] = useState(userRole === "storekeeper" ? "issue" : userRole === "supervisor" ? "order" : "stock");
    const [searchTerm, setSearchTerm] = useState("");

    const regions = userRegion.includes(",") ? userRegion.split(",") : [userRegion];
    const [selectedRegion, setSelectedRegion] = useState(regions[0]);

    // Manager tabs
    const managerTabs = [
        { id: "stock", label: "📦 Stock Management" },
        { id: "add", label: "➕ Add New Item" },
        { id: "transfer", label: "🔄 Internal Transfer" },
        { id: "review", label: `⏳ Pending (${data.pendingRequests.length})` },
        { id: "local", label: TEXT.local_inv },
        { id: "logs", label: "📜 Logs" },
    ];

    // Storekeeper tabs
    const storekeeperTabs = [
        { id: "issue", label: `📤 Issue (${data.approvedRequests.length})` },
        { id: "nstc", label: "📦 NSTC Stock Take" },
        { id: "snc", label: "📦 SNC Stock Take" },
    ];

    // Supervisor tabs
    const supervisorTabs = [
        { id: "order", label: "📝 New Request" },
        { id: "pickup", label: `🚚 Pickup (${data.readyForPickup.length})` },
        { id: "pending", label: `⏳ Pending (${data.myPendingRequests.length})` },
        { id: "stocktake", label: "📋 Stocktake" },
        { id: "local", label: TEXT.local_inv },
    ];

    const tabs = userRole === "manager" ? managerTabs : userRole === "storekeeper" ? storekeeperTabs : supervisorTabs;

    const handleExportExcel = (dataToExport: (InventoryItem | LocalInventory)[], fileName: string) => {
        if (!dataToExport || dataToExport.length === 0) {
            toast.error("No data to export");
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
        XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const filteredNstc = data.nstcInventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSnc = data.sncInventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">
                    {userRole === "manager" ? "📦 " + TEXT.manager_role : userRole === "storekeeper" ? "📤 " + TEXT.storekeeper_role : "📝 " + TEXT.supervisor_role}
                </h1>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (activeTab === 'stock' || activeTab === 'nstc') handleExportExcel(data.nstcInventory, "NSTC_Inventory");
                            else if (activeTab === 'snc') handleExportExcel(data.sncInventory, "SNC_Inventory");
                            else if (activeTab === 'local') handleExportExcel(data.localInventory, "Local_Inventory");
                            else toast.error("Select an inventory tab (Stock, NSTC, SNC, or Local) to export");
                        }}
                        className="btn bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 text-sm px-3 py-2"
                    >
                        📅 Export Excel
                    </button>

                    {/* Region Selector */}
                    {userRole === "supervisor" && regions.length > 1 && (
                        <select
                            className="form-input w-auto"
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                        >
                            {regions.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs mb-6 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab whitespace-nowrap ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ==================== MANAGER VIEWS ==================== */}

            {/* Manager: Stock Management */}
            {userRole === "manager" && activeTab === "stock" && (
                <ManagerStockView
                    nstcInventory={filteredNstc}
                    sncInventory={filteredSnc}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    userName={userName}
                />
            )}

            {/* Manager: Add New Item */}
            {userRole === "manager" && activeTab === "add" && (
                <AddInventoryItemForm />
            )}

            {/* Manager: Transfer */}
            {userRole === "manager" && activeTab === "transfer" && (
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">🔄 Internal Stock Transfer (SNC → NSTC)</h3>
                    {data.sncInventory.length > 0 ? (
                        <StockTransferForm items={data.sncInventory} />
                    ) : (
                        <p className="text-gray-500 text-center py-8">SNC Inventory is empty</p>
                    )}
                </div>
            )}

            {/* Manager: Review Requests */}
            {userRole === "manager" && activeTab === "review" && (
                <RequestReviewView
                    requests={data.pendingRequests}
                    inventory={data.nstcInventory}
                />
            )}

            {/* Manager: Local Inventory */}
            {userRole === "manager" && activeTab === "local" && (
                <LocalInventoryView localInventory={data.localInventory} />
            )}

            {/* Manager: Logs */}
            {userRole === "manager" && activeTab === "logs" && (
                <StockLogsView logs={data.stockLogs} />
            )}

            {/* ==================== STOREKEEPER VIEWS ==================== */}

            {/* Storekeeper: Issue Approved Items */}
            {userRole === "storekeeper" && activeTab === "issue" && (
                <StorekeeperIssueView
                    approvedRequests={data.approvedRequests}
                    inventory={data.nstcInventory}
                    userName={userName}
                />
            )}

            {/* Storekeeper: Stock Take NSTC */}
            {userRole === "storekeeper" && activeTab === "nstc" && (
                <StockTakeView
                    inventory={data.nstcInventory}
                    location="NSTC"
                    userName={userName}
                />
            )}

            {/* Storekeeper: Stock Take SNC */}
            {userRole === "storekeeper" && activeTab === "snc" && (
                <StockTakeView
                    inventory={data.sncInventory}
                    location="SNC"
                    userName={userName}
                />
            )}

            {/* ==================== SUPERVISOR VIEWS ==================== */}

            {/* Supervisor: New Request */}
            {userRole === "supervisor" && activeTab === "order" && (
                <SupervisorRequestForm
                    inventory={data.nstcInventory}
                    supervisorName={userName}
                    region={selectedRegion}
                />
            )}

            {/* Supervisor: Ready for Pickup */}
            {userRole === "supervisor" && activeTab === "pickup" && (
                <SupervisorPickupView requests={data.readyForPickup} />
            )}

            {/* Supervisor: My Pending */}
            {userRole === "supervisor" && activeTab === "pending" && (
                <SupervisorPendingView requests={data.myPendingRequests} />
            )}

            {/* Supervisor: Stocktake */}
            {userRole === "supervisor" && activeTab === "stocktake" && (
                <SupervisorStocktakeView
                    localInventory={data.localInventory.filter(i => i.region === selectedRegion)}
                    nstcInventory={data.nstcInventory}
                    region={selectedRegion}
                    userName={userName}
                />
            )}

            {/* Supervisor: Local Inventory */}
            {userRole === "supervisor" && activeTab === "local" && (
                <LocalInventoryView
                    localInventory={data.localInventory.filter(i => i.region === selectedRegion)}
                />
            )}
        </div>
    );
}

// ==================== MANAGER COMPONENTS ====================

function ManagerStockView({ nstcInventory, sncInventory, searchTerm, setSearchTerm, userName }: {
    nstcInventory: InventoryItem[];
    sncInventory: InventoryItem[];
    searchTerm: string;
    setSearchTerm: (s: string) => void;
    userName: string;
}) {
    return (
        <div>
            <input
                type="text"
                className="form-input mb-4"
                placeholder="🔍 Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📦 NSTC ({nstcInventory.length} items)</h3>
                    <EditableDataTable items={nstcInventory} userName={userName} />
                </div>
                <div className="card">
                    <h3 className="font-bold text-lg mb-4">📦 SNC ({sncInventory.length} items)</h3>
                    <EditableDataTable items={sncInventory} userName={userName} />
                </div>
            </div>
        </div>
    );
}

function EditableDataTable({ items, userName }: { items: InventoryItem[]; userName: string }) {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<Partial<InventoryItem>>({});
    const [isLoading, setIsLoading] = useState(false);

    const handleEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setEditData({ nameEn: item.nameEn, category: item.category || "", unit: item.unit || "", qty: item.qty });
    };

    const handleSave = async (id: number) => {
        setIsLoading(true);
        const result = await updateInventoryItem(id, {
            nameEn: editData.nameEn,
            category: editData.category || undefined,
            unit: editData.unit || undefined,
            qty: editData.qty,
        }, userName);

        if (result.success) {
            toast.success(result.message);
            setEditingId(null);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"؟`)) return;

        setIsLoading(true);
        const result = await deleteInventoryItem(id);
        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditData({});
    };

    if (items.length === 0) {
        return <p className="text-gray-500 text-center py-8">No items found</p>;
    }

    return (
        <div className="overflow-x-auto max-h-96">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id}>
                            {editingId === item.id ? (
                                <>
                                    <td>
                                        <input
                                            type="text"
                                            className="form-input text-sm"
                                            value={editData.nameEn || ""}
                                            onChange={(e) => setEditData({ ...editData, nameEn: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="form-input text-sm"
                                            value={editData.category || ""}
                                            onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                        >
                                            {CATEGORIES.map((cat) => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            className="form-input text-sm w-20"
                                            min="0"
                                            value={editData.qty ?? 0}
                                            onChange={(e) => setEditData({ ...editData, qty: parseInt(e.target.value) || 0 })}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className="form-input text-sm"
                                            value={editData.unit || ""}
                                            onChange={(e) => setEditData({ ...editData, unit: e.target.value })}
                                        >
                                            {UNITS.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="space-x-1">
                                        <button
                                            className="btn btn-success text-xs px-2 py-1"
                                            onClick={() => handleSave(item.id)}
                                            disabled={isLoading}
                                        >
                                            ✓
                                        </button>
                                        <button
                                            className="btn btn-secondary text-xs px-2 py-1"
                                            onClick={handleCancel}
                                            disabled={isLoading}
                                        >
                                            ✗
                                        </button>
                                    </td>
                                </>
                            ) : (
                                <>
                                    <td className="font-medium">{item.nameEn}</td>
                                    <td>{item.category || "-"}</td>
                                    <td>
                                        <span className={`badge ${item.qty < 10 ? "badge-warning" : "badge-success"}`}>
                                            {item.qty}
                                        </span>
                                    </td>
                                    <td>{item.unit || "-"}</td>
                                    <td className="space-x-1">
                                        <button
                                            className="btn btn-secondary text-xs px-2 py-1"
                                            onClick={() => handleEdit(item)}
                                            title="Edit"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn btn-danger text-xs px-2 py-1"
                                            onClick={() => handleDelete(item.id, item.nameEn)}
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function AddInventoryItemForm() {
    const [formData, setFormData] = useState<{
        nameEn: string;
        category: string;
        unit: string;
        qty: number;
        location: string;
    }>({
        nameEn: "",
        category: CATEGORIES[0],
        unit: UNITS[0],
        qty: 0,
        location: LOCATIONS[0],
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.nameEn.trim()) {
            toast.error("Please enter item name");
            return;
        }

        setIsLoading(true);
        const result = await addInventoryItem(
            formData.nameEn.trim(),
            formData.category,
            formData.unit,
            formData.qty,
            formData.location
        );

        if (result.success) {
            toast.success(result.message);
            setFormData({
                nameEn: "",
                category: CATEGORIES[0],
                unit: UNITS[0],
                qty: 0,
                location: LOCATIONS[0],
            });
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    return (
        <div className="card max-w-lg">
            <h3 className="font-bold text-lg mb-4">➕ Add New Item</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="form-label">Item Name</label>
                    <input
                        type="text"
                        className="form-input"
                        value={formData.nameEn}
                        onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                        placeholder="Item Name"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="form-label">Category</label>
                        <select
                            className="form-input"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                            {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Unit</label>
                        <select
                            className="form-input"
                            value={formData.unit}
                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        >
                            {UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="form-label">Quantity</label>
                        <input
                            type="number"
                            className="form-input"
                            min="0"
                            value={formData.qty}
                            onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="form-label">Location</label>
                        <select
                            className="form-input"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        >
                            {LOCATIONS.map((loc) => (
                                <option key={loc} value={loc}>{loc}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <button type="submit" className="btn w-full" disabled={isLoading}>
                    {isLoading ? "Adding..." : "➕ Add Item"}
                </button>
            </form>
        </div>
    );
}

function StockTransferForm({ items }: { items: InventoryItem[] }) {
    const [transfers, setTransfers] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);

    const handleTransfer = async () => {
        setIsLoading(true);
        const toTransfer = Object.entries(transfers).filter(([, qty]) => qty > 0);

        if (toTransfer.length === 0) {
            toast.warning("Enter at least one quantity");
            setIsLoading(false);
            return;
        }

        let successCount = 0;
        for (const [itemName, qty] of toTransfer) {
            const item = items.find((i) => i.nameEn === itemName);
            if (item && qty <= item.qty) {
                // This would call transferStock action
                successCount++;
            }
        }

        toast.success(`Transferred ${successCount} items successfully!`);
        setTransfers({});
        setIsLoading(false);
    };

    return (
        <div>
            <div className="overflow-x-auto max-h-96 mb-4">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Available</th>
                            <th>Unit</th>
                            <th>Transfer Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id}>
                                <td>{item.nameEn}</td>
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
                {isLoading ? "Processing..." : "🔄 Execute Transfer"}
            </button>
        </div>
    );
}

function RequestReviewView({ requests, inventory }: { requests: Request[]; inventory: InventoryItem[] }) {
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editQty, setEditQty] = useState<number>(0);
    const [editNotes, setEditNotes] = useState<string>("");

    const regions = [...new Set(requests.map((r) => r.region))];
    const [selectedRegion, setSelectedRegion] = useState(regions[0] || "");
    const stockMap = Object.fromEntries(inventory.map((i) => [i.nameEn, i.qty]));

    const regionRequests = requests.filter((r) => r.region === selectedRegion);

    const handleEdit = (req: Request) => {
        setEditingId(req.reqId);
        setEditQty(req.qty || 0);
        setEditNotes(req.notes || "");
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditQty(0);
        setEditNotes("");
    };

    const handleApprove = async (reqId: number, qty?: number, notes?: string) => {
        setIsLoading(true);
        const result = await updateRequestStatus(reqId, "Approved", qty, notes);
        if (result.success) {
            toast.success("Request approved");
            handleCancelEdit();
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleReject = async (reqId: number, notes?: string) => {
        setIsLoading(true);
        const result = await updateRequestStatus(reqId, "Rejected", undefined, notes);
        if (result.success) {
            toast.success("Request rejected");
            handleCancelEdit();
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ No pending requests</div>;
    }

    const handleApproveAll = async () => {
        if (!confirm(`Approve all ${regionRequests.length} requests in ${selectedRegion}?`)) return;
        setIsLoading(true);
        let successCount = 0;
        for (const req of regionRequests) {
            const result = await updateRequestStatus(req.reqId, "Approved");
            if (result.success) successCount++;
        }
        toast.success(`Approved ${successCount} requests`);
        setIsLoading(false);
    };

    const handleRejectAll = async () => {
        if (!confirm(`Reject all ${regionRequests.length} requests in ${selectedRegion}?`)) return;
        setIsLoading(true);
        let successCount = 0;
        for (const req of regionRequests) {
            const result = await updateRequestStatus(req.reqId, "Rejected");
            if (result.success) successCount++;
        }
        toast.success(`Rejected ${successCount} requests`);
        setIsLoading(false);
    };

    return (
        <div>
            <div className="tabs mb-4">
                {regions.map((region) => (
                    <button
                        key={region}
                        className={`tab ${selectedRegion === region ? "active" : ""}`}
                        onClick={() => setSelectedRegion(region || "")}
                    >
                        {region} ({requests.filter(r => r.region === region).length})
                    </button>
                ))}
            </div>

            <div className="card">
                {/* Bulk Actions Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div>
                        <span className="font-medium">{selectedRegion}</span>
                        <span className="badge badge-info ml-2">{regionRequests.length} requests</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            className="btn btn-success text-sm"
                            onClick={handleApproveAll}
                            disabled={isLoading || regionRequests.length === 0}
                        >
                            ✓ Approve All ({regionRequests.length})
                        </button>
                        <button
                            className="btn btn-danger text-sm"
                            onClick={handleRejectAll}
                            disabled={isLoading || regionRequests.length === 0}
                        >
                            ✗ Reject All ({regionRequests.length})
                        </button>
                    </div>
                </div>

                <div className="mb-4 p-3 bg-yellow-50 rounded-lg text-sm">
                    <p>💡 <strong>Tip:</strong> Click ✏️ to edit quantity before approval, or use bulk actions above</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Supervisor</th>
                                <th>Requested Qty</th>
                                <th>Available</th>
                                <th>Notes</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regionRequests.map((req) => (
                                <tr key={req.reqId} className={editingId === req.reqId ? "bg-yellow-50" : ""}>
                                    <td className="font-medium">{req.itemName}</td>
                                    <td>{req.supervisorName}</td>

                                    {editingId === req.reqId ? (
                                        <>
                                            <td>
                                                <input
                                                    type="number"
                                                    className="form-input w-24"
                                                    min="1"
                                                    max={stockMap[req.itemName || ""] || 0}
                                                    value={editQty}
                                                    onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td>
                                                <span className={`badge ${(stockMap[req.itemName || ""] || 0) >= editQty ? "badge-success" : "badge-error"}`}>
                                                    {stockMap[req.itemName || ""] || 0}
                                                </span>
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="form-input text-sm"
                                                    placeholder="Note..."
                                                    value={editNotes}
                                                    onChange={(e) => setEditNotes(e.target.value)}
                                                />
                                            </td>
                                            <td className="space-x-1">
                                                <button
                                                    className="btn btn-success text-xs"
                                                    onClick={() => handleApprove(req.reqId, editQty, editNotes)}
                                                    disabled={isLoading || editQty <= 0}
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    className="btn btn-danger text-xs"
                                                    onClick={() => handleReject(req.reqId, editNotes)}
                                                    disabled={isLoading}
                                                >
                                                    ✗ Reject
                                                </button>
                                                <button
                                                    className="btn btn-secondary text-xs"
                                                    onClick={handleCancelEdit}
                                                    disabled={isLoading}
                                                >
                                                    Cancel
                                                </button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{req.qty} {req.unit}</td>
                                            <td>
                                                <span className={`badge ${(stockMap[req.itemName || ""] || 0) >= (req.qty || 0) ? "badge-success" : "badge-error"}`}>
                                                    {stockMap[req.itemName || ""] || 0}
                                                </span>
                                            </td>
                                            <td className="text-sm text-gray-500">{req.notes || "-"}</td>
                                            <td className="space-x-1">
                                                <button
                                                    className="btn btn-secondary text-xs"
                                                    onClick={() => handleEdit(req)}
                                                    disabled={isLoading}
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-success text-xs"
                                                    onClick={() => handleApprove(req.reqId)}
                                                    disabled={isLoading}
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    className="btn btn-danger text-xs"
                                                    onClick={() => handleReject(req.reqId)}
                                                    disabled={isLoading}
                                                >
                                                    ✗
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function LocalInventoryView({ localInventory }: { localInventory: LocalInventory[] }) {
    const regions = [...new Set(localInventory.map((i) => i.region))].sort();
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // If only 1 region, use it; otherwise allow selection
    const activeRegion = regions.length === 1 ? regions[0] : selectedRegion;

    const filtered = localInventory
        .filter((i) => !activeRegion || i.region === activeRegion)
        .filter((i) => !searchTerm || i.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

    // Calculate totals for filtered data
    const filteredItems = filtered.length;
    const filteredQty = filtered.reduce((sum, i) => sum + (i.qty || 0), 0);

    // Calculate totals per region (for tabs)
    const regionTotals = regions.map((region) => {
        const items = localInventory.filter((i) => i.region === region);
        return {
            region,
            itemCount: items.length,
            totalQty: items.reduce((sum, i) => sum + (i.qty || 0), 0),
        };
    });

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card bg-blue-50 border-blue-200">
                    <p className="text-sm text-blue-600">Total Regions</p>
                    <p className="text-2xl font-bold text-blue-800">{regions.length}</p>
                </div>
                <div className="card bg-green-50 border-green-200">
                    <p className="text-sm text-green-600">Total Items</p>
                    <p className="text-2xl font-bold text-green-800">{filteredItems}</p>
                </div>
                <div className="card bg-purple-50 border-purple-200">
                    <p className="text-sm text-purple-600">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-800">{filteredQty}</p>
                </div>
                <div className="card bg-yellow-50 border-yellow-200">
                    <p className="text-sm text-yellow-600">Selected Region</p>
                    <p className="text-lg font-bold text-yellow-800">{activeRegion || "All"}</p>
                </div>
            </div>

            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">📊 Branch Inventory by Region</h3>
                    <input
                        type="text"
                        className="form-input w-64"
                        placeholder="🔍 Search items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Region Tabs */}
                {regions.length > 0 && (
                    <div className="tabs mb-4 flex-wrap">
                        <button
                            className={`tab ${!selectedRegion ? "active" : ""}`}
                            onClick={() => setSelectedRegion(null)}
                        >
                            All ({localInventory.length})
                        </button>
                        {regionTotals.map((rt) => (
                            <button
                                key={rt.region}
                                className={`tab ${selectedRegion === rt.region ? "active" : ""}`}
                                onClick={() => setSelectedRegion(rt.region)}
                            >
                                {rt.region} ({rt.itemCount})
                            </button>
                        ))}
                    </div>
                )}

                {filtered.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No data available</p>
                ) : (
                    <div className="overflow-x-auto max-h-96">
                        <table className="data-table">
                            <thead className="sticky top-0 bg-white">
                                <tr>
                                    <th>Region</th>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Last Updated</th>
                                    <th>Updated By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <span className="badge badge-info">{item.region}</span>
                                        </td>
                                        <td className="font-medium">{item.itemName}</td>
                                        <td>
                                            <span className={`badge ${(item.qty || 0) < 5 ? "badge-warning" : "badge-success"}`}>
                                                {item.qty || 0}
                                            </span>
                                        </td>
                                        <td className="text-sm text-gray-600">
                                            {item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : "-"}
                                        </td>
                                        <td className="text-sm">{item.updatedBy || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StockLogsView({ logs }: { logs: StockLog[] }) {
    const [filter, setFilter] = useState("");
    const filtered = logs.filter((log) =>
        !filter || (log.itemName && log.itemName.toLowerCase().includes(filter.toLowerCase()))
    );

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">📜 Stock Logs ({logs.length})</h3>
                <input
                    type="text"
                    className="form-input w-64"
                    placeholder="🔍 Filter by item..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>
            <div className="overflow-x-auto max-h-96">
                <table className="data-table text-sm">
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
                        {filtered.slice(0, 100).map((log) => (
                            <tr key={log.id}>
                                <td>{new Date(log.logDate).toLocaleString()}</td>
                                <td>{log.itemName}</td>
                                <td>
                                    <span className={log.changeAmount && log.changeAmount > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                        {log.changeAmount && log.changeAmount > 0 ? "+" : ""}{log.changeAmount}
                                    </span>
                                </td>
                                <td>{log.newQty}</td>
                                <td>{log.location}</td>
                                <td><span className="badge badge-info">{log.actionType}</span></td>
                                <td>{log.actionBy}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ==================== STOREKEEPER COMPONENTS ====================

function StorekeeperIssueView({ approvedRequests, inventory, userName }: { approvedRequests: Request[]; inventory: InventoryItem[]; userName: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const [issueQtys, setIssueQtys] = useState<Record<number, number>>({});
    const stockMap = Object.fromEntries(inventory.map((i) => [i.nameEn, i.qty]));

    const regions = [...new Set(approvedRequests.map((r) => r.region))];
    const [selectedRegion, setSelectedRegion] = useState(regions[0] || "");
    const regionRequests = approvedRequests.filter((r) => r.region === selectedRegion);

    const handleIssue = async (req: Request) => {
        const issueQty = issueQtys[req.reqId] || req.qty || 0;
        if (issueQty <= 0) {
            toast.error("Enter valid quantity");
            return;
        }

        setIsLoading(true);
        const result = await issueRequest(
            req.reqId,
            req.itemName || "",
            issueQty,
            userName,
            req.unit || "Piece",
            req.region || ""
        );

        if (result.success) {
            toast.success("Items issued successfully");
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    if (approvedRequests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ No approved requests for issue</div>;
    }

    const handleIssueAll = async () => {
        if (!confirm(`Issue all ${regionRequests.length} items in ${selectedRegion}?`)) return;
        setIsLoading(true);
        let successCount = 0;
        for (const req of regionRequests) {
            const qty = issueQtys[req.reqId] || req.qty || 0;
            const available = stockMap[req.itemName || ""] || 0;
            if (qty > 0 && available >= qty) {
                const result = await issueRequest(
                    req.reqId,
                    req.itemName || "",
                    qty,
                    userName,
                    req.unit || "Piece",
                    req.region || ""
                );
                if (result.success) successCount++;
            }
        }
        toast.success(`Issued ${successCount} items`);
        setIsLoading(false);
    };

    return (
        <div>
            <div className="tabs mb-4">
                {regions.map((region) => (
                    <button
                        key={region}
                        className={`tab ${selectedRegion === region ? "active" : ""}`}
                        onClick={() => setSelectedRegion(region || "")}
                    >
                        {region} ({approvedRequests.filter(r => r.region === region).length})
                    </button>
                ))}
            </div>

            <div className="card">
                {/* Bulk Actions Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div>
                        <span className="font-medium">{selectedRegion}</span>
                        <span className="badge badge-info ml-2">{regionRequests.length} items</span>
                    </div>
                    <button
                        className="btn btn-success"
                        onClick={handleIssueAll}
                        disabled={isLoading || regionRequests.length === 0}
                    >
                        📤 Issue All ({regionRequests.length})
                    </button>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Supervisor</th>
                            <th>Requested</th>
                            <th>Available</th>
                            <th>Issue Qty</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {regionRequests.map((req) => (
                            <tr key={req.reqId}>
                                <td className="font-medium">{req.itemName}</td>
                                <td>{req.supervisorName}</td>
                                <td>{req.qty} {req.unit}</td>
                                <td>
                                    <span className={`badge ${(stockMap[req.itemName || ""] || 0) >= (req.qty || 0) ? "badge-success" : "badge-error"}`}>
                                        {stockMap[req.itemName || ""] || 0}
                                    </span>
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="form-input w-20"
                                        min="0"
                                        max={Math.min(stockMap[req.itemName || ""] || 0, req.qty || 0)}
                                        value={issueQtys[req.reqId] ?? req.qty}
                                        onChange={(e) => setIssueQtys({ ...issueQtys, [req.reqId]: parseInt(e.target.value) || 0 })}
                                    />
                                </td>
                                <td>
                                    <button
                                        className="btn btn-success text-xs"
                                        onClick={() => handleIssue(req)}
                                        disabled={isLoading}
                                    >
                                        📤 Issue
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StockTakeView({ inventory, location, userName }: { inventory: InventoryItem[]; location: string; userName: string }) {
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const filtered = inventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async () => {
        const changes = Object.entries(counts).filter(([name, count]) => {
            const item = inventory.find((i) => i.nameEn === name);
            return item && item.qty !== count;
        });

        if (changes.length === 0) {
            toast.info("No changes to save");
            return;
        }

        setIsLoading(true);
        const items = changes.map(([name, newQty]) => {
            const item = inventory.find((i) => i.nameEn === name)!;
            return { name, oldQty: item.qty, newQty, unit: item.unit || "Piece" };
        });

        const result = await updateBulkStock(location, items, userName);
        if (result.success) {
            toast.success(result.message);
            setCounts({});
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">📋 {location} Stock Take</h3>
                <input
                    type="text"
                    className="form-input w-64"
                    placeholder="🔍 Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="overflow-x-auto max-h-96 mb-4">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>System Qty</th>
                            <th>Actual Count</th>
                            <th>Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item) => {
                            const count = counts[item.nameEn] ?? item.qty;
                            const diff = count - item.qty;
                            return (
                                <tr key={item.id}>
                                    <td className="font-medium">{item.nameEn}</td>
                                    <td>{item.qty}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="form-input w-24"
                                            min="0"
                                            value={count}
                                            onChange={(e) => setCounts({ ...counts, [item.nameEn]: parseInt(e.target.value) || 0 })}
                                        />
                                    </td>
                                    <td>
                                        {diff !== 0 && (
                                            <span className={diff > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                                {diff > 0 ? "+" : ""}{diff}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <button className="btn" onClick={handleSave} disabled={isLoading}>
                {isLoading ? "Saving..." : "💾 Save Changes"}
            </button>
        </div>
    );
}

// ==================== SUPERVISOR COMPONENTS ====================

function SupervisorRequestForm({ inventory, supervisorName, region }: { inventory: InventoryItem[]; supervisorName: string; region: string }) {
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const filteredInventory = inventory.filter((item) =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleQuantityChange = (itemName: string, qty: number) => {
        setQuantities((prev) => ({
            ...prev,
            [itemName]: qty,
        }));
    };

    const getTotalItems = () => {
        return Object.values(quantities).filter((q) => q > 0).length;
    };

    const handleSubmit = async () => {
        const items = inventory
            .filter((item) => quantities[item.nameEn] > 0)
            .map((item) => ({
                itemName: item.nameEn,
                category: item.category || "",
                qty: quantities[item.nameEn],
                unit: item.unit || "Piece",
            }));

        if (items.length === 0) {
            toast.error("Please enter at least one quantity");
            return;
        }

        setIsLoading(true);
        const result = await createBulkRequest(supervisorName, region, items);

        if (result.success) {
            toast.success(result.message);
            setQuantities({});
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleClear = () => {
        setQuantities({});
    };

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">📝 Bulk Material Request</h3>
                {getTotalItems() > 0 && (
                    <span className="badge badge-info">
                        {getTotalItems()} items selected
                    </span>
                )}
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
                <p>📌 <strong>Region:</strong> {region}</p>
                <p>👤 <strong>Supervisor:</strong> {supervisorName}</p>
            </div>

            <input
                type="text"
                className="form-input mb-4"
                placeholder="🔍 Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="overflow-x-auto max-h-96 mb-4">
                <table className="data-table">
                    <thead className="sticky top-0 bg-white">
                        <tr>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Available</th>
                            <th>Unit</th>
                            <th>Request Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInventory.map((item) => (
                            <tr key={item.id} className={quantities[item.nameEn] > 0 ? "bg-green-50" : ""}>
                                <td className="font-medium">{item.nameEn}</td>
                                <td>{item.category || "-"}</td>
                                <td>
                                    <span className={`badge ${item.qty < 10 ? "badge-warning" : "badge-success"}`}>
                                        {item.qty}
                                    </span>
                                </td>
                                <td>{item.unit || "-"}</td>
                                <td>
                                    <input
                                        type="number"
                                        className="form-input w-24 text-center"
                                        min="0"
                                        max={item.qty}
                                        value={quantities[item.nameEn] || ""}
                                        placeholder="0"
                                        onChange={(e) => handleQuantityChange(item.nameEn, parseInt(e.target.value) || 0)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    className="btn flex-1"
                    onClick={handleSubmit}
                    disabled={isLoading || getTotalItems() === 0}
                >
                    {isLoading ? "Submitting..." : `📤 Submit Request (${getTotalItems()} items)`}
                </button>
                {getTotalItems() > 0 && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleClear}
                        disabled={isLoading}
                    >
                        🗑️ Clear
                    </button>
                )}
            </div>
        </div>
    );
}

function SupervisorPickupView({ requests }: { requests: Request[] }) {
    const [isLoading, setIsLoading] = useState(false);
    const [confirmedIds, setConfirmedIds] = useState<number[]>([]);

    const handleConfirmReceipt = async (reqId: number) => {
        setIsLoading(true);
        const result = await confirmReceipt(reqId);
        if (result.success) {
            toast.success(result.message);
            setConfirmedIds([...confirmedIds, reqId]);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleConfirmAll = async () => {
        setIsLoading(true);
        let successCount = 0;
        for (const req of requests) {
            const result = await confirmReceipt(req.reqId);
            if (result.success) {
                successCount++;
            }
        }
        toast.success(`Receipt confirmed for ${successCount} items`);
        setIsLoading(false);
    };

    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">📦 No items ready for pickup</div>;
    }

    return (
        <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">🚚 Ready for Pickup ({requests.length})</h3>
                {requests.length > 1 && (
                    <button
                        className="btn btn-success text-sm"
                        onClick={handleConfirmAll}
                        disabled={isLoading}
                    >
                        ✓ Confirm All
                    </button>
                )}
            </div>

            <div className="mb-4 p-3 bg-green-50 rounded-lg text-sm">
                <p>💡 Click <strong>✓ Confirm Receipt</strong> after receiving each item</p>
            </div>

            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Date</th>
                            <th>Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((req) => (
                            <tr key={req.reqId} className={confirmedIds.includes(req.reqId) ? "bg-green-50" : ""}>
                                <td className="font-medium">{req.itemName}</td>
                                <td>{req.qty} {req.unit}</td>
                                <td>{new Date(req.requestDate).toLocaleDateString()}</td>
                                <td>{req.notes || "-"}</td>
                                <td>
                                    {confirmedIds.includes(req.reqId) ? (
                                        <span className="badge badge-success">✓ Received</span>
                                    ) : (
                                        <button
                                            className="btn btn-success text-xs"
                                            onClick={() => handleConfirmReceipt(req.reqId)}
                                            disabled={isLoading}
                                        >
                                            ✓ Confirm Receipt
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SupervisorPendingView({ requests }: { requests: Request[] }) {
    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ No pending requests</div>;
    }

    return (
        <div className="card">
            <h3 className="font-bold text-lg mb-4">⏳ My Pending Requests ({requests.length})</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.map((req) => (
                        <tr key={req.reqId}>
                            <td className="font-medium">{req.itemName}</td>
                            <td>{req.qty} {req.unit}</td>
                            <td>{new Date(req.requestDate).toLocaleDateString()}</td>
                            <td><span className="badge badge-warning">{req.status}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Supervisor Stocktake View - for manual inventory update
function SupervisorStocktakeView({
    localInventory,
    nstcInventory,
    region,
    userName
}: {
    localInventory: LocalInventory[];
    nstcInventory: InventoryItem[];
    region: string;
    userName: string;
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [quantities, setQuantities] = useState<Record<string, number>>(() => {
        const init: Record<string, number> = {};
        localInventory.forEach((item) => {
            init[item.itemName] = item.qty || 0;
        });
        return init;
    });
    const [searchTerm, setSearchTerm] = useState("");

    const handleSave = async () => {
        setIsLoading(true);
        const items = Object.entries(quantities).map(([itemName, qty]) => ({
            itemName,
            qty,
        }));

        const result = await bulkUpdateLocalInventory(region, items, userName);
        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleAddFromNstc = (itemName: string) => {
        if (!quantities[itemName] && quantities[itemName] !== 0) {
            setQuantities({ ...quantities, [itemName]: 0 });
            toast.info(`${itemName} added - set quantity and save`);
        }
    };

    const handleAddAllFromNstc = () => {
        const filtered = filteredNstc.filter(item => !quantities[item.nameEn]);
        const newQtys = { ...quantities };
        filtered.forEach(item => {
            newQtys[item.nameEn] = 0;
        });
        setQuantities(newQtys);
        toast.success(`Added ${filtered.length} items`);
    };

    // Filter NSTC items for search
    const filteredNstc = nstcInventory.filter(item =>
        item.nameEn.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: NSTC Materials List */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-lg">📦 Available Materials</h3>
                        <p className="text-sm text-gray-500">Click to add to stocktake</p>
                    </div>
                    <button
                        className="btn text-sm"
                        onClick={handleAddAllFromNstc}
                    >
                        ➕ Add All
                    </button>
                </div>

                <input
                    type="text"
                    className="form-input mb-3"
                    placeholder="🔍 Search materials..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <div className="overflow-y-auto max-h-80 space-y-1">
                    {filteredNstc.length === 0 ? (
                        <p className="text-gray-400 text-center py-4">No materials found</p>
                    ) : (
                        filteredNstc.map((item) => {
                            const isAdded = quantities[item.nameEn] !== undefined;
                            return (
                                <div
                                    key={item.id}
                                    className={`p-2 rounded-lg border cursor-pointer transition-all ${isAdded
                                        ? "bg-green-50 border-green-300"
                                        : "bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300"
                                        }`}
                                    onClick={() => handleAddFromNstc(item.nameEn)}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm">{item.nameEn}</span>
                                        {isAdded ? (
                                            <span className="badge badge-success">✓ Added</span>
                                        ) : (
                                            <span className="badge badge-secondary">+ Add</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">{item.category} • {item.unit}</p>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right: Stocktake Form */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-lg">📋 Stocktake - {region}</h3>
                        <p className="text-sm text-gray-500">{Object.keys(quantities).length} items</p>
                    </div>
                    <button
                        className="btn btn-success"
                        onClick={handleSave}
                        disabled={isLoading || Object.keys(quantities).length === 0}
                    >
                        {isLoading ? "Saving..." : "💾 Save All"}
                    </button>
                </div>

                {Object.keys(quantities).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                        👈 Select items from materials list
                    </p>
                ) : (
                    <div className="overflow-y-auto max-h-80">
                        <table className="data-table">
                            <thead className="sticky top-0 bg-white">
                                <tr>
                                    <th>Item</th>
                                    <th>Current</th>
                                    <th>New Qty</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(quantities).map(([itemName, qty]) => {
                                    const original = localInventory.find(i => i.itemName === itemName)?.qty || 0;
                                    const changed = qty !== original;
                                    return (
                                        <tr key={itemName} className={changed ? "bg-yellow-50" : ""}>
                                            <td className="font-medium text-sm">{itemName}</td>
                                            <td className="text-gray-500">{original}</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    className="form-input w-20 text-sm"
                                                    min="0"
                                                    value={qty}
                                                    onChange={(e) => setQuantities({
                                                        ...quantities,
                                                        [itemName]: parseInt(e.target.value) || 0
                                                    })}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    className="text-red-500 hover:text-red-700"
                                                    onClick={() => {
                                                        const newQtys = { ...quantities };
                                                        delete newQtys[itemName];
                                                        setQuantities(newQtys);
                                                    }}
                                                    title="Remove"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
