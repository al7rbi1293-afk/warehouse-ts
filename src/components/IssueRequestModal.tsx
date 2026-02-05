"use client";

import { useState } from "react";
import { Request } from "@/types";
import { bulkIssueRequests, updateRequestStatus } from "@/app/actions/inventory";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    request: Request;
    userName: string;
}

export function IssueRequestModal({ isOpen, onClose, request, userName }: Props) {
    const [issueQty, setIssueQty] = useState(request.qty || 0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleIssue = async () => {
        setIsSubmitting(true);
        try {
            const res = await bulkIssueRequests(userName, [{
                reqId: request.reqId,
                qty: issueQty,
                itemName: request.itemName || "",
                region: request.region || "",
                unit: request.unit || ""
            }]);

            if (res.success) {
                toast.success(res.message);
                onClose();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to issue request");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!confirm("Are you sure you want to reject this request?")) return;
        setIsSubmitting(true);
        try {
            const res = await updateRequestStatus(request.reqId, "Rejected", undefined, "Rejected by Storekeeper");
            if (res.success) {
                toast.success("Request rejected");
                onClose();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to reject request");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-900">Issue Item</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-500 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Request Details */}
                    <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Region:</span>
                            <span className="font-medium text-slate-900">{request.region}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Item:</span>
                            <span className="font-medium text-slate-900">{request.itemName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Requested Qty:</span>
                            <span className="font-medium text-slate-900">{request.qty} {request.unit}</span>
                        </div>
                    </div>

                    {/* Issue Quantity */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Issue Quantity (Deduct from NSTC)</label>
                        <input
                            type="number"
                            min="1"
                            value={issueQty}
                            onChange={(e) => setIssueQty(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                    <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100">
                        Warning: This will be deduced immediately from NSTC warehouse stock.
                    </p>
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button
                        onClick={handleReject}
                        disabled={isSubmitting}
                        className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors disabled:opacity-50"
                    >
                        Reject
                    </button>
                    <button
                        onClick={handleIssue}
                        disabled={isSubmitting || issueQty <= 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        Confirm Issue
                    </button>
                </div>
            </div>
        </div>
    );
}
