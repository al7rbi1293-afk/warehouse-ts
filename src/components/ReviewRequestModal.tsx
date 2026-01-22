"use client";

import { useState } from "react";
import { Request } from "@/types";
import { updateRequestStatus } from "@/app/actions/inventory";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    request: Request;
}

export function ReviewRequestModal({ isOpen, onClose, request }: Props) {
    const [approvedQty, setApprovedQty] = useState(request.qty || 0);
    const [notes, setNotes] = useState(request.notes || "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleAction = async (status: "Approved" | "Rejected") => {
        setIsSubmitting(true);
        try {
            const res = await updateRequestStatus(
                request.reqId,
                status,
                approvedQty,
                notes
            );

            if (res.success) {
                toast.success(`Request ${status} successfully`);
                onClose();
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error("Failed to process request");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-900">Review Request</h2>
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
                            <span className="text-sm text-slate-500">Item:</span>
                            <span className="font-medium text-slate-900">{request.itemName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Category:</span>
                            <span className="font-medium text-slate-900">{request.category}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Requester:</span>
                            <span className="font-medium text-slate-900">{request.supervisorName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Region:</span>
                            <span className="font-medium text-slate-900">{request.region}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Original Qty:</span>
                            <span className="font-medium text-slate-900">{request.qty} {request.unit}</span>
                        </div>
                    </div>

                    {/* Edit Quantity */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Approved Quantity</label>
                        <input
                            type="number"
                            min="1"
                            value={approvedQty}
                            onChange={(e) => setApprovedQty(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add reason for adjustment or rejection..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 resize-none"
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button
                        onClick={() => handleAction("Rejected")}
                        disabled={isSubmitting}
                        className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors disabled:opacity-50"
                    >
                        Reject Request
                    </button>
                    <button
                        onClick={() => handleAction("Approved")}
                        disabled={isSubmitting || approvedQty <= 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        Approve {approvedQty} {request.unit}
                    </button>
                </div>
            </div>
        </div>
    );
}
