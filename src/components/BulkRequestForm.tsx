"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBulkRequest } from "@/app/actions/inventory";
import { InventoryItem } from "@/types";

interface Props {
  inventory: InventoryItem[];
  supervisorName: string;
  defaultRegion: string;
  regions: { id: number; name: string }[];
}

interface RequestDraftLine {
  id: string;
  itemId: number;
  itemName: string;
  itemCode: string;
  category: string;
  sourceWarehouse: string;
  targetRegion: string;
  qty: string;
  unit: string;
  notes: string;
  priority: string;
}

function makeLineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BulkRequestForm({
  inventory,
  supervisorName,
  defaultRegion,
  regions,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRegion, setSelectedRegion] = useState(defaultRegion || regions[0]?.name || "");
  const [lines, setLines] = useState<RequestDraftLine[]>([]);

  const sourceWarehouses = useMemo(() => {
    const values = Array.from(new Set(inventory.map((item) => item.location).filter(Boolean)));
    values.sort((a, b) => {
      if (a === "NSTC") return -1;
      if (b === "NSTC") return 1;
      return a.localeCompare(b);
    });
    return values;
  }, [inventory]);

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

  const addItemLine = (item: InventoryItem) => {
    const preferredWarehouse = sourceWarehouses.includes("NSTC")
      ? "NSTC"
      : item.location || sourceWarehouses[0] || "";

    setLines((current) => [
      ...current,
      {
        id: makeLineId(),
        itemId: item.id,
        itemName: item.nameEn,
        itemCode: item.itemCode || "",
        category: item.category || "General",
        sourceWarehouse: preferredWarehouse,
        targetRegion: selectedRegion,
        qty: "",
        unit: item.unit || "PCS",
        notes: "",
        priority: "Normal",
      },
    ]);
    setSearchTerm("");
  };

  const updateLine = (lineId: string, patch: Partial<RequestDraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
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
      const key = `${line.itemId}-${line.sourceWarehouse}-${line.targetRegion}`.toLowerCase();
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
    }

    return lines.map((line) => {
      const qtyValue = Number(line.qty);
      const availableQty =
        inventory.find(
          (item) => item.nameEn === line.itemName && item.location === line.sourceWarehouse
        )?.qty || 0;
      const errors: string[] = [];
      const warnings: string[] = [];
      const duplicateKey = `${line.itemId}-${line.sourceWarehouse}-${line.targetRegion}`.toLowerCase();

      if (!line.itemId) errors.push("Select an item");
      if (!line.targetRegion.trim()) errors.push("Select a target region");
      if (!Number.isInteger(qtyValue) || qtyValue <= 0) errors.push("Quantity must be greater than zero");
      if ((duplicateMap.get(duplicateKey) || 0) > 1) errors.push("Duplicate item / warehouse / region combination");
      if (Number.isInteger(qtyValue) && qtyValue > availableQty) warnings.push("Requested quantity is above currently available stock");

      return { lineId: line.id, availableQty, errors, warnings };
    });
  }, [lines, inventory]);

  const lineDiagnosticMap = useMemo(
    () => new Map(lineDiagnostics.map((item) => [item.lineId, item])),
    [lineDiagnostics]
  );

  const summary = useMemo(() => {
    const totalQuantity = lines.reduce((total, line) => total + (Number(line.qty) || 0), 0);
    const invalidLines = lineDiagnostics.filter((item) => item.errors.length > 0).length;
    const warningLines = lineDiagnostics.filter((item) => item.warnings.length > 0).length;
    return {
      totalLines: lines.length,
      totalQuantity,
      invalidLines,
      warningLines,
    };
  }, [lineDiagnostics, lines]);

  const startReview = () => {
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    if (summary.invalidLines > 0) {
      toast.error("Resolve the highlighted line errors before review");
      return;
    }

    setIsReviewing(true);
  };

  const handleSubmit = async () => {
    if (summary.invalidLines > 0 || lines.length === 0) {
      toast.error("The request still has invalid lines");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createBulkRequest(
        supervisorName,
        selectedRegion,
        lines.map((line) => ({
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          category: line.category,
          qty: Number(line.qty),
          unit: line.unit,
          sourceWarehouse: line.sourceWarehouse,
          targetRegion: line.targetRegion,
          notes: line.notes,
          priority: line.priority,
        }))
      );

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.operationNo ? `Request submitted as ${result.operationNo}` : result.message);
      setLines([]);
      setIsReviewing(false);
      router.refresh();
    } catch (error) {
      console.error("Bulk request submit failed", error);
      toast.error("Failed to submit bulk request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Quick Add Item
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by item name, Arabic name, or item code"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
                {quickAddResults.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="grid gap-2">
                      {quickAddResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addItemLine(item)}
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

              <div className="md:w-56">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Default Region
                </label>
                <select
                  value={selectedRegion}
                  onChange={(event) => {
                    const nextRegion = event.target.value;
                    setSelectedRegion(nextRegion);
                    setLines((current) =>
                      current.map((line) => ({
                        ...line,
                        targetRegion: line.targetRegion || nextRegion,
                      }))
                    );
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="">Select region</option>
                  {regions.map((regionItem) => (
                    <option key={regionItem.id} value={regionItem.name}>
                      {regionItem.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Item</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Source</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Target Region</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Available</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Qty</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Notes</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">
                        Search and add items to start a bulk request.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const diagnostics = lineDiagnosticMap.get(line.id);
                      return (
                        <tr key={line.id} className="align-top">
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-900">{line.itemName}</div>
                            <div className="text-xs text-slate-500">
                              {line.itemCode || "No code"} • {line.category || "General"} • {line.unit}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={line.sourceWarehouse}
                              onChange={(event) =>
                                updateLine(line.id, { sourceWarehouse: event.target.value })
                              }
                              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                              {sourceWarehouses.map((warehouse) => (
                                <option key={warehouse} value={warehouse}>
                                  {warehouse}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={line.targetRegion}
                              onChange={(event) =>
                                updateLine(line.id, { targetRegion: event.target.value })
                              }
                              className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                              <option value="">Select region</option>
                              {regions.map((regionItem) => (
                                <option key={regionItem.id} value={regionItem.name}>
                                  {regionItem.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-900">
                              {diagnostics?.availableQty || 0} {line.unit}
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
                          <td className="px-4 py-4">
                            <select
                              value={line.priority}
                              onChange={(event) =>
                                updateLine(line.id, { priority: event.target.value })
                              }
                              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                            >
                              <option value="Low">Low</option>
                              <option value="Normal">Normal</option>
                              <option value="High">High</option>
                              <option value="Critical">Critical</option>
                            </select>
                          </td>
                          <td className="px-4 py-4">
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
                  <h3 className="text-base font-semibold text-slate-900">Review Before Submit</h3>
                  <p className="text-sm text-slate-600">
                    {summary.totalLines} lines will be submitted for region {selectedRegion || "Not set"}.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReviewing(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Bulk Request"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Request Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total lines</span>
                <span className="font-semibold text-slate-900">{summary.totalLines}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total requested quantity</span>
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
              Available stock is shown as a live preview from the selected source warehouse. Lines that exceed current stock can still be submitted for review, but they stay flagged so approvers can adjust them clearly.
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={startReview}
                disabled={lines.length === 0}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Review Bulk Request
              </button>
              <button
                type="button"
                onClick={() => {
                  setLines([]);
                  setIsReviewing(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Clear Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
