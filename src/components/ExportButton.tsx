"use client";

import { useTransition } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ExportButtonProps {
    data: Record<string, unknown>[];
    fileName: string;
    sheetName?: string;
    label?: string;
    className?: string;
}

export function ExportButton({ data, fileName, sheetName = "Sheet1", label = "Export to Excel", className }: ExportButtonProps) {
    const [isPending, startTransition] = useTransition();

    const handleExport = () => {
        startTransition(() => {
            try {
                if (!data || data.length === 0) {
                    toast.warning("No data to export");
                    return;
                }

                // Create worksheet
                const ws = XLSX.utils.json_to_sheet(data);

                // Create workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, sheetName);

                // Write file
                XLSX.writeFile(wb, `${fileName}.xlsx`);
                toast.success("Export successful");
            } catch (error) {
                console.error("Export failed:", error);
                toast.error("Failed to export data");
            }
        });
    };

    return (
        <button
            onClick={handleExport}
            disabled={isPending || !data || data.length === 0}
            className={`flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
            </svg>
            {isPending ? "Exporting..." : label}
        </button>
    );
}
