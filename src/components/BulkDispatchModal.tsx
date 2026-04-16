"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { bulkIssueRequests } from "@/app/actions/inventory";
import { InventoryItem, Request } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  approvedRequests: Request[];
  inventory: InventoryItem[];
  userName: string;
}

interface DispatchLineState {
  reqId: number;
  selected: boolean;
  qty: string;
  notes: string;
}

export function BulkDispatchModal({
  isOpen,
  onClose,
  approvedRequests,
  inventory,
  userName,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lines, setLines] = useState<DispatchLineState[]>(
    approvedRequests.map((request) => ({
      reqId: request.reqId,
      selected: true,
      qty: `${request.qty || 0}`,
      notes: request.notes || "",
    }))
  );

  useEffect(() => {
    setLines(
      approvedRequests.map((request) => ({
        reqId: request.reqId,
        selected: true,
        qty: `${request.qty || 0}`,
        notes: request.notes || "",
      }))
    );
  }, [approvedRequests]);

  const requestLookup = useMemo(
    () => new Map(approvedRequests.map((request) => [request.reqId, request])),
    [approvedRequests]
  );

  const visibleLines = useMemo(() => {
    return lines.filter((line) => {
      const request = requestLookup.get(line.reqId);
      if (!request) return false;
      if (!searchTerm.trim()) return true;
      const normalized = searchTerm.trim().toLowerCase();
      return [request.itemName, request.region, request.supervisorName]
        .filter(Boolean)
        .some((value) => `${value}`.toLowerCase().includes(normalized));
    });
  }, [lines, requestLookup, searchTerm]);

  const diagnostics = useMemo(() => {
    return lines.map((line) => {
      const request = requestLookup.get(line.reqId);
      const qty = Number(line.qty);
      const available =
        inventory.find(
          (item) => item.nameEn === request?.itemName && item.location === "NSTC"
        )?.qty || 0;

      const errors: string[] = [];
      if (line.selected && (!Number.isInteger(qty) || qty <= 0)) {
        errors.push("Quantity must be greater than zero");
      }
      if (line.selected && qty > available) {
        errors.push(`NSTC available quantity is ${available}`);
      }

      return {
        reqId: line.reqId,
        available,
        errors,
      };
    });
  }, [inventory, lines, requestLookup]);

  const diagnosticsMap = useMemo(
    () => new Map(diagnostics.map((item) => [item.reqId, item])),
    [diagnostics]
  );

  const selectedLines = lines.filter((line) => line.selected);
  const invalidCount = selectedLines.filter(
    (line) => (diagnosticsMap.get(line.reqId)?.errors.length || 0) > 0
  ).length;
  const totalQuantity = selectedLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);

  const updateLine = (reqId: number, patch: Partial<DispatchLineState>) => {
    setLines((current) =>
      current.map((line) => (line.reqId === reqId ? { ...line, ...patch } : line))
    );
  };

  const submit = async () => {
    if (selectedLines.length === 0) {
      toast.error("Select at least one approved line to dispatch");
      return;
    }
    if (invalidCount > 0) {
      toast.error("Resolve invalid lines before dispatch");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkIssueRequests(
        userName,
        selectedLines.map((line) => {
          const request = requestLookup.get(line.reqId)!;
          return {
            reqId: request.reqId,
            qty: Number(line.qty),
            itemName: request.itemName || "",
            region: request.region || "",
            unit: request.unit || "",
            notes: line.notes,
          };
        })
      );

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.operationNo ? `Dispatched under ${result.operationNo}` : result.message);
      onClose();
    } catch (error) {
      console.error("Bulk dispatch failed", error);
      toast.error("Failed to dispatch approved lines");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Bulk Dispatch Review</h2>
              <p className="text-sm text-slate-500">
                Review approved line items, adjust issue quantities, and dispatch them in one audited operation.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search item or supervisor"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />

            <div className="max-h-[58vh] overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Use</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Item</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Requester</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Approved</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">NSTC Available</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Dispatch Qty</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleLines.map((line) => {
                    const request = requestLookup.get(line.reqId)!;
                    const lineDiagnostics = diagnosticsMap.get(line.reqId);
                    return (
                      <tr key={line.reqId} className="align-top">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={line.selected}
                            onChange={(event) =>
                              updateLine(line.reqId, { selected: event.target.checked })
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">{request.itemName}</div>
                          <div className="text-xs text-slate-500">{request.region}</div>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{request.supervisorName}</td>
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {request.qty} {request.unit}
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-900">
                          {lineDiagnostics?.available || 0} {request.unit}
                        </td>
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(event) => updateLine(line.reqId, { qty: event.target.value })}
                            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                          />
                          {lineDiagnostics?.errors.length ? (
                            <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              {lineDiagnostics.errors.join(". ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <textarea
                            value={line.notes}
                            onChange={(event) => updateLine(line.reqId, { notes: event.target.value })}
                            placeholder="Dispatch note"
                            className="h-20 w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-900">Dispatch Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Selected lines</span>
                <span className="font-semibold text-slate-900">{selectedLines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total quantity</span>
                <span className="font-semibold text-slate-900">{totalQuantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Invalid lines</span>
                <span className={`font-semibold ${invalidCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {invalidCount}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600">
              Dispatch deducts stock from the NSTC warehouse immediately and updates every selected request line to <span className="font-semibold text-slate-900">Issued</span>.
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? "Dispatching..." : "Confirm Bulk Dispatch"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
