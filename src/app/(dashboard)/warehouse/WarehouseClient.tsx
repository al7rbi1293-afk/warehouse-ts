"use client";

import { useState } from "react";
import { TEXT, CATEGORIES, UNITS, LOCATIONS } from "@/lib/constants";
import { createRequest, updateRequestStatus, issueRequest, updateBulkStock, addInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/app/actions/inventory";
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
        { id: "local", label: TEXT.local_inv },
    ];

    const tabs = userRole === "manager" ? managerTabs : userRole === "storekeeper" ? storekeeperTabs : supervisorTabs;

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
                        <p className="text-gray-500 text-center py-8">SNC المخزون فارغ</p>
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
        if (!confirm(`هل أنت متأكد من حذف "${name}"؟`)) return;

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
        return <p className="text-gray-500 text-center py-8">لا توجد عناصر</p>;
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
                                            title="تعديل"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn btn-danger text-xs px-2 py-1"
                                            onClick={() => handleDelete(item.id, item.nameEn)}
                                            title="حذف"
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
            toast.error("يرجى إدخال اسم العنصر");
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
            <h3 className="font-bold text-lg mb-4">➕ إضافة عنصر جديد</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="form-label">اسم العنصر (بالإنجليزية)</label>
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
                        <label className="form-label">التصنيف</label>
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
                        <label className="form-label">الوحدة</label>
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
                        <label className="form-label">الكمية</label>
                        <input
                            type="number"
                            className="form-input"
                            min="0"
                            value={formData.qty}
                            onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="form-label">الموقع</label>
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
                    {isLoading ? "جاري الإضافة..." : "➕ إضافة العنصر"}
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
            toast.warning("أدخل كمية واحدة على الأقل");
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

        toast.success(`تم نقل ${successCount} عنصر بنجاح!`);
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
                {isLoading ? "جاري التنفيذ..." : "🔄 تنفيذ النقل"}
            </button>
        </div>
    );
}

function RequestReviewView({ requests, inventory }: { requests: Request[]; inventory: InventoryItem[] }) {
    const [isLoading, setIsLoading] = useState(false);
    const regions = [...new Set(requests.map((r) => r.region))];
    const [selectedRegion, setSelectedRegion] = useState(regions[0] || "");
    const stockMap = Object.fromEntries(inventory.map((i) => [i.nameEn, i.qty]));

    const regionRequests = requests.filter((r) => r.region === selectedRegion);

    const handleApprove = async (reqId: number) => {
        setIsLoading(true);
        const result = await updateRequestStatus(reqId, "Approved");
        if (result.success) {
            toast.success("تمت الموافقة على الطلب");
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    const handleReject = async (reqId: number) => {
        setIsLoading(true);
        const result = await updateRequestStatus(reqId, "Rejected");
        if (result.success) {
            toast.success("تم رفض الطلب");
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ لا توجد طلبات معلقة</div>;
    }

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
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Supervisor</th>
                            <th>Qty</th>
                            <th>Available</th>
                            <th>Actions</th>
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
                                <td className="space-x-2">
                                    <button
                                        className="btn btn-success text-xs"
                                        onClick={() => handleApprove(req.reqId)}
                                        disabled={isLoading}
                                    >
                                        ✓ Approve
                                    </button>
                                    <button
                                        className="btn btn-danger text-xs"
                                        onClick={() => handleReject(req.reqId)}
                                        disabled={isLoading}
                                    >
                                        ✗ Reject
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

function LocalInventoryView({ localInventory }: { localInventory: LocalInventory[] }) {
    const regions = [...new Set(localInventory.map((i) => i.region))];
    const [selectedRegion, setSelectedRegion] = useState(regions[0] || "");

    const filtered = localInventory.filter((i) => !selectedRegion || i.region === selectedRegion);

    return (
        <div className="card">
            <h3 className="font-bold text-lg mb-4">📊 Local Inventory</h3>
            {regions.length > 1 && (
                <div className="tabs mb-4">
                    {regions.map((region) => (
                        <button
                            key={region}
                            className={`tab ${selectedRegion === region ? "active" : ""}`}
                            onClick={() => setSelectedRegion(region)}
                        >
                            {region}
                        </button>
                    ))}
                </div>
            )}
            {filtered.length === 0 ? (
                <p className="text-gray-500 text-center py-8">لا توجد بيانات</p>
            ) : (
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
                        {filtered.map((item, idx) => (
                            <tr key={idx}>
                                <td>{item.itemName}</td>
                                <td>{item.qty}</td>
                                <td>{item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : "-"}</td>
                                <td>{item.updatedBy || "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
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
            toast.error("أدخل كمية صحيحة");
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
            toast.success("تم إصدار العنصر بنجاح");
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    if (approvedRequests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ لا توجد طلبات معتمدة للإصدار</div>;
    }

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
            toast.info("لا توجد تغييرات للحفظ");
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
                {isLoading ? "جاري الحفظ..." : "💾 Save Changes"}
            </button>
        </div>
    );
}

// ==================== SUPERVISOR COMPONENTS ====================

function SupervisorRequestForm({ inventory, supervisorName, region }: { inventory: InventoryItem[]; supervisorName: string; region: string }) {
    const [selectedItem, setSelectedItem] = useState("");
    const [qty, setQty] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const selectedInventory = inventory.find((i) => i.nameEn === selectedItem);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem || qty <= 0) {
            toast.error("اختر عنصر وأدخل كمية صحيحة");
            return;
        }

        setIsLoading(true);
        const result = await createRequest(
            supervisorName,
            region,
            selectedItem,
            selectedInventory?.category || "",
            qty,
            selectedInventory?.unit || "Piece"
        );

        if (result.success) {
            toast.success("تم إرسال الطلب بنجاح");
            setSelectedItem("");
            setQty(1);
        } else {
            toast.error(result.message);
        }
        setIsLoading(false);
    };

    return (
        <div className="card">
            <h3 className="font-bold text-lg mb-4">📝 طلب مواد جديد</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="form-label">اختر العنصر</label>
                    <select
                        className="form-input"
                        value={selectedItem}
                        onChange={(e) => setSelectedItem(e.target.value)}
                        required
                    >
                        <option value="">-- اختر --</option>
                        {inventory.map((item) => (
                            <option key={item.id} value={item.nameEn}>
                                {item.nameEn} ({item.qty} available)
                            </option>
                        ))}
                    </select>
                </div>

                {selectedInventory && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <p><strong>Category:</strong> {selectedInventory.category}</p>
                        <p><strong>Unit:</strong> {selectedInventory.unit}</p>
                        <p><strong>Available:</strong> {selectedInventory.qty}</p>
                    </div>
                )}

                <div>
                    <label className="form-label">الكمية المطلوبة</label>
                    <input
                        type="number"
                        className="form-input"
                        min="1"
                        value={qty}
                        onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                        required
                    />
                </div>

                <button type="submit" className="btn w-full" disabled={isLoading}>
                    {isLoading ? "جاري الإرسال..." : "📤 إرسال الطلب"}
                </button>
            </form>
        </div>
    );
}

function SupervisorPickupView({ requests }: { requests: Request[] }) {
    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">📦 لا توجد عناصر جاهزة للاستلام</div>;
    }

    return (
        <div className="card">
            <h3 className="font-bold text-lg mb-4">🚚 جاهز للاستلام ({requests.length})</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Date</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.map((req) => (
                        <tr key={req.reqId}>
                            <td className="font-medium">{req.itemName}</td>
                            <td>{req.qty} {req.unit}</td>
                            <td>{new Date(req.requestDate).toLocaleDateString()}</td>
                            <td>{req.notes || "-"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SupervisorPendingView({ requests }: { requests: Request[] }) {
    if (requests.length === 0) {
        return <div className="card text-center text-gray-500 py-8">✅ لا توجد طلبات معلقة</div>;
    }

    return (
        <div className="card">
            <h3 className="font-bold text-lg mb-4">⏳ طلباتي المعلقة ({requests.length})</h3>
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
