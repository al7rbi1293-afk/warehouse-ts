"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBulkMovementOperation } from "@/app/actions/inventory";
import { getProjects, getWarehouses } from "@/app/actions/references";
import { PremiumTable } from "@/components/PremiumTable";
import { WarehouseExportButton } from "@/components/WarehouseExportButton";
import { InventoryItem, LoanRecord, StockLog } from "@/types";

interface Props {
  inventory: InventoryItem[];
  loans: LoanRecord[];
  stockLogs: StockLog[];
}

type MovementMode = "TRANSFER" | "LEND" | "BORROW";

interface ProjectOption {
  id: number;
  name: string;
}

interface WarehouseOption {
  id: number;
  name: string;
}

interface MovementDraftLine {
  id: string;
  itemId: number;
  itemName: string;
  itemCode: string;
  category: string;
  fromWarehouse: string;
  toWarehouse: string;
  projectName: string;
  qty: string;
  unit: string;
  expectedReturnDate: string;
  reference: string;
  notes: string;
}

function makeLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StockTransferForm({ inventory, loans, stockLogs }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<MovementMode>("TRANSFER");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [lines, setLines] = useState<MovementDraftLine[]>([]);

  useEffect(() => {
    const loadReferences = async () => {
      const [projectResult, warehouseResult] = await Promise.all([
        getProjects(),
        getWarehouses(),
      ]);

      if (projectResult.success) {
        setProjects(projectResult.data || []);
      }

      if (warehouseResult.success) {
        setWarehouses(warehouseResult.data || []);
      }
    };

    loadReferences();
  }, []);

  const warehouseNames = useMemo(() => {
    const fallback = Array.from(new Set(inventory.map((item) => item.location))).filter(Boolean);
    const values =
      warehouses.length > 0 ? warehouses.map((warehouse) => warehouse.name) : fallback;
    return values.sort((a, b) => {
      if (a === "NSTC") return -1;
      if (b === "NSTC") return 1;
      return a.localeCompare(b);
    });
  }, [inventory, warehouses]);

  const uniqueItems = useMemo(() => {
    const byName = new Map<string, InventoryItem>();
    for (const item of inventory) {
      if (!byName.has(item.nameEn)) {
        byName.set(item.nameEn, item);
      }
    }
    return Array.from(byName.values());
  }, [inventory]);

  const quickAddResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const normalized = searchTerm.trim().toLowerCase();
    return uniqueItems
      .filter((item) =>
        [item.nameEn, item.nameAr, item.itemCode, item.category]
          .filter(Boolean)
          .some((value) => `${value}`.toLowerCase().includes(normalized))
      )
      .slice(0, 8);
  }, [searchTerm, uniqueItems]);

  const addLine = (item: InventoryItem) => {
    const defaultWarehouse = warehouseNames.includes(item.location) ? item.location : warehouseNames[0] || "";
    setLines((current) => [
      ...current,
      {
        id: makeLineId(),
        itemId: item.id,
        itemName: item.nameEn,
        itemCode: item.itemCode || "",
        category: item.category || "General",
        fromWarehouse: mode === "TRANSFER" || mode === "LEND" ? defaultWarehouse : "",
        toWarehouse: mode === "TRANSFER" ? warehouseNames.find((name) => name !== defaultWarehouse) || "" : defaultWarehouse,
        projectName: "",
        qty: "",
        unit: item.unit || "PCS",
        expectedReturnDate: "",
        reference: "",
        notes: "",
      },
    ]);
    setSearchTerm("");
  };

  const updateLine = (lineId: string, patch: Partial<MovementDraftLine>) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const duplicateLine = (lineId: string) => {
    setLines((current) => {
      const line = current.find((entry) => entry.id === lineId);
      if (!line) return current;
      return [...current, { ...line, id: makeLineId() }];
    });
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const lineDiagnostics = useMemo(() => {
    const duplicateMap = new Map<string, number>();
    for (const line of lines) {
      const key = `${line.itemId}-${line.fromWarehouse}-${line.toWarehouse}-${line.projectName}-${mode}`.toLowerCase();
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
    }

    return lines.map((line) => {
      const qty = Number(line.qty);
      const errors: string[] = [];
      const warnings: string[] = [];
      const duplicateKey = `${line.itemId}-${line.fromWarehouse}-${line.toWarehouse}-${line.projectName}-${mode}`.toLowerCase();
      const availability =
        mode === "BORROW"
          ? loans
              .filter(
                (loan) =>
                  loan.itemName === line.itemName &&
                  loan.project === line.projectName &&
                  ["Open", "Active"].includes(loan.status)
              )
              .reduce((total, loan) => total + loan.quantity, 0)
          : inventory.find(
              (item) =>
                item.nameEn === line.itemName && item.location === line.fromWarehouse
            )?.qty || 0;

      if (!Number.isInteger(qty) || qty <= 0) errors.push("Quantity must be greater than zero");
      if ((duplicateMap.get(duplicateKey) || 0) > 1) errors.push("Duplicate line detected");

      if (mode === "TRANSFER") {
        if (!line.fromWarehouse || !line.toWarehouse) errors.push("Select both warehouses");
        if (line.fromWarehouse === line.toWarehouse) errors.push("Source and destination must differ");
        if (qty > availability) errors.push("Quantity exceeds available stock");
      }

      if (mode === "LEND") {
        if (!line.fromWarehouse) errors.push("Select a lending warehouse");
        if (!line.projectName) errors.push("Select the borrowing entity");
        if (qty > availability) errors.push("Quantity exceeds available stock");
      }

      if (mode === "BORROW") {
        if (!line.projectName) errors.push("Select the source entity");
        if (!line.toWarehouse) errors.push("Select the receiving warehouse");
        if (qty > availability) errors.push("Quantity exceeds open borrow balance");
        if (!availability) warnings.push("No open balance found for this item and entity");
      }

      return {
        lineId: line.id,
        availability,
        errors,
        warnings,
      };
    });
  }, [inventory, lines, loans, mode]);

  const diagnosticsByLine = useMemo(
    () => new Map(lineDiagnostics.map((item) => [item.lineId, item])),
    [lineDiagnostics]
  );

  const summary = useMemo(() => {
    const totalQuantity = lines.reduce((total, line) => total + (Number(line.qty) || 0), 0);
    return {
      totalLines: lines.length,
      totalQuantity,
      invalidLines: lineDiagnostics.filter((item) => item.errors.length > 0).length,
      warningLines: lineDiagnostics.filter((item) => item.warnings.length > 0).length,
    };
  }, [lineDiagnostics, lines]);

  const submit = async () => {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (summary.invalidLines > 0) {
      toast.error("Resolve validation errors before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createBulkMovementOperation({
        operationType: mode,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          fromWarehouse: mode === "BORROW" ? undefined : line.fromWarehouse,
          toWarehouse: mode === "TRANSFER" ? line.toWarehouse : mode === "BORROW" ? line.toWarehouse : undefined,
          projectName: mode === "TRANSFER" ? undefined : line.projectName,
          qty: Number(line.qty),
          unit: line.unit,
          notes: line.notes,
          reference: line.reference,
          expectedReturnDate: mode === "LEND" ? line.expectedReturnDate : undefined,
        })),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.operationNo ? `Processed as ${result.operationNo}` : result.message);
      setLines([]);
      setIsReviewing(false);
      router.refresh();
    } catch (error) {
      console.error("Bulk movement submit failed", error);
      toast.error("Failed to process bulk movement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const recentMovements = stockLogs
    .filter((log) => {
      if (!log.actionType) return false;
      if (mode === "TRANSFER") return log.actionType.includes("Transfer");
      if (mode === "LEND") return log.actionType.includes("Lent");
      return log.actionType.includes("Returned");
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              {[
                { value: "TRANSFER", label: "Bulk Transfer" },
                { value: "LEND", label: "Bulk Lend" },
                { value: "BORROW", label: "Bulk Borrow / Return" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value as MovementMode);
                    setLines([]);
                    setIsReviewing(false);
                  }}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                    mode === option.value
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Quick Add Item
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search item name, Arabic name, or item code"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
              <WarehouseExportButton
                module={mode === "TRANSFER" ? "transfers" : "borrow-lend"}
                label={mode === "TRANSFER" ? "Export Transfers" : "Export Borrow / Lend"}
              />
              <WarehouseExportButton module="movements" label="Export Movements" className="bg-slate-700 hover:bg-slate-800" />
            </div>

            {quickAddResults.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div className="grid gap-2">
                  {quickAddResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addLine(item)}
                      className="flex items-center justify-between rounded-lg border border-transparent bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{item.nameEn}</div>
                        <div className="text-xs text-slate-500">
                          {item.itemCode || "No code"} • {item.category || "General"}
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {item.unit || "PCS"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {mode === "TRANSFER" && (
              <p>
                Move multiple items between warehouses in one controlled transaction. Each line validates stock and warehouse combinations before execution.
              </p>
            )}
            {mode === "LEND" && (
              <p>
                Lend multiple items to a project or external entity with return due dates and references preserved for audit and follow-up.
              </p>
            )}
            {mode === "BORROW" && (
              <p>
                Receive multiple returned items from an external entity back into warehouse stock while validating each line against the open borrow balance.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Item</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">
                      {mode === "BORROW" ? "Source Entity" : "From"}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">
                      {mode === "LEND" ? "Borrowing Entity" : "To"}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">
                      {mode === "BORROW" ? "Open Balance" : "Available"}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Qty</th>
                    {mode === "LEND" && (
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Return Due</th>
                    )}
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Reference / Notes</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={mode === "LEND" ? 8 : 7} className="px-6 py-12 text-center text-sm text-slate-500">
                        Search and add items to start a bulk operation.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const diagnostics = diagnosticsByLine.get(line.id);
                      return (
                        <tr key={line.id} className="align-top">
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-900">{line.itemName}</div>
                            <div className="text-xs text-slate-500">
                              {line.itemCode || "No code"} • {line.category || "General"} • {line.unit}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {mode === "BORROW" ? (
                              <select
                                value={line.projectName}
                                onChange={(event) =>
                                  updateLine(line.id, { projectName: event.target.value })
                                }
                                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              >
                                <option value="">Select entity</option>
                                {projects.map((project) => (
                                  <option key={project.id} value={project.name}>
                                    {project.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={line.fromWarehouse}
                                onChange={(event) =>
                                  updateLine(line.id, { fromWarehouse: event.target.value })
                                }
                                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              >
                                <option value="">Select</option>
                                {warehouseNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {mode === "TRANSFER" ? (
                              <select
                                value={line.toWarehouse}
                                onChange={(event) =>
                                  updateLine(line.id, { toWarehouse: event.target.value })
                                }
                                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              >
                                <option value="">Select</option>
                                {warehouseNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            ) : mode === "LEND" ? (
                              <select
                                value={line.projectName}
                                onChange={(event) =>
                                  updateLine(line.id, { projectName: event.target.value })
                                }
                                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              >
                                <option value="">Select entity</option>
                                {projects.map((project) => (
                                  <option key={project.id} value={project.name}>
                                    {project.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={line.toWarehouse}
                                onChange={(event) =>
                                  updateLine(line.id, { toWarehouse: event.target.value })
                                }
                                className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              >
                                <option value="">Select</option>
                                {warehouseNames.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-900">
                              {diagnostics?.availability || 0} {line.unit}
                            </div>
                            {diagnostics?.warnings.length ? (
                              <div className="mt-1 text-xs text-amber-600">
                                {diagnostics.warnings[0]}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="number"
                              min="1"
                              value={line.qty}
                              onChange={(event) => updateLine(line.id, { qty: event.target.value })}
                              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                          </td>
                          {mode === "LEND" && (
                            <td className="px-4 py-4">
                              <input
                                type="date"
                                value={line.expectedReturnDate}
                                onChange={(event) =>
                                  updateLine(line.id, { expectedReturnDate: event.target.value })
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              />
                            </td>
                          )}
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              value={line.reference}
                              onChange={(event) => updateLine(line.id, { reference: event.target.value })}
                              placeholder="Reference"
                              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            <textarea
                              value={line.notes}
                              onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                              placeholder="Line note"
                              className="h-20 w-52 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            />
                            {diagnostics?.errors.length ? (
                              <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {diagnostics.errors.join(". ")}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => duplicateLine(line.id)}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isReviewing && lines.length > 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Review Before Execute</h3>
                  <p className="text-sm text-slate-600">
                    {summary.totalLines} lines and {summary.totalQuantity} total units will be processed.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReviewing(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isSubmitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSubmitting ? "Processing..." : "Execute Bulk Operation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-800">Recent Movements</h3>
              <p className="text-sm text-slate-500">
                Latest {mode === "TRANSFER" ? "transfers" : mode === "LEND" ? "lend issues" : "borrow returns"}
              </p>
            </div>
            <PremiumTable
              columns={[
                {
                  header: "Date",
                  render: (log: StockLog) =>
                    log.logDate ? new Date(log.logDate).toLocaleString() : "-",
                },
                { header: "Item", accessorKey: "itemName" as const },
                { header: "Action", accessorKey: "actionType" as const },
                {
                  header: "Change",
                  render: (log: StockLog) => (
                    <span
                      className={
                        log.changeAmount && log.changeAmount > 0
                          ? "font-bold text-emerald-600"
                          : "font-bold text-rose-600"
                      }
                    >
                      {log.changeAmount && log.changeAmount > 0 ? "+" : ""}
                      {log.changeAmount} {log.unit}
                    </span>
                  ),
                },
                { header: "Location", accessorKey: "location" as const },
              ]}
              data={recentMovements}
            />
          </div>
        </div>

        <div className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Operation Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total lines</span>
                <span className="font-semibold text-slate-900">{summary.totalLines}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total quantity</span>
                <span className="font-semibold text-slate-900">{summary.totalQuantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Invalid lines</span>
                <span className={`font-semibold ${summary.invalidLines > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {summary.invalidLines}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Warnings</span>
                <span className={`font-semibold ${summary.warningLines > 0 ? "text-amber-600" : "text-slate-900"}`}>
                  {summary.warningLines}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              {mode === "TRANSFER" && "Every transfer line validates source stock before any warehouse quantities move."}
              {mode === "LEND" && "Each lend line keeps an auditable open balance and expected return date where provided."}
              {mode === "BORROW" && "Borrow returns only pass when the source entity still has open balance for the selected item."}
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  if (summary.invalidLines > 0) {
                    toast.error("Resolve validation errors before review");
                    return;
                  }
                  setIsReviewing(true);
                }}
                disabled={lines.length === 0}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Review Bulk Operation
              </button>
              <button
                type="button"
                onClick={() => {
                  setLines([]);
                  setIsReviewing(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear Lines
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
