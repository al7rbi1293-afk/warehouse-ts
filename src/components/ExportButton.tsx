"use client";

import { useTransition } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ColumnConfig {
    key: string;
    header: string;
    width?: number;
}

interface ExportButtonProps {
    data: Record<string, unknown>[];
    fileName: string;
    sheetName?: string;
    label?: string;
    className?: string;
    columns?: ColumnConfig[];
}

/**
 * Enhanced Export Button with proper .xlsx formatting
 * - Proper headers with custom column names
 * - Readable column widths
 * - Organized data layout
 */
export function ExportButton({
    data,
    fileName,
    sheetName = "Sheet1",
    label = "Export to Excel",
    className,
    columns
}: ExportButtonProps) {
    const [isPending, startTransition] = useTransition();

    const handleExport = () => {
        startTransition(() => {
            try {
                if (!data || data.length === 0) {
                    toast.warning("No data to export");
                    return;
                }

                let formattedData: Record<string, unknown>[];
                let colWidths: { wch: number }[];

                if (columns && columns.length > 0) {
                    // Use custom column config
                    formattedData = data.map(row => {
                        const newRow: Record<string, unknown> = {};
                        columns.forEach(col => {
                            const value = row[col.key];
                            // Format the value for display
                            newRow[col.header] = formatCellValue(value);
                        });
                        return newRow;
                    });

                    // Set column widths from config or auto-calculate
                    colWidths = columns.map(col => ({
                        wch: col.width || Math.max(col.header.length + 2, 15)
                    }));
                } else {
                    // Auto-generate headers from data keys
                    const headers = Object.keys(data[0]);
                    formattedData = data.map(row => {
                        const newRow: Record<string, unknown> = {};
                        headers.forEach(key => {
                            // Convert camelCase to Title Case for headers
                            const header = key.replace(/([A-Z])/g, ' $1').trim();
                            const titleHeader = header.charAt(0).toUpperCase() + header.slice(1);
                            newRow[titleHeader] = formatCellValue(row[key]);
                        });
                        return newRow;
                    });

                    // Auto-calculate column widths
                    colWidths = headers.map(key => ({
                        wch: Math.max(key.length + 2, 15)
                    }));
                }

                // Create worksheet
                const ws = XLSX.utils.json_to_sheet(formattedData);

                // Apply column widths
                ws['!cols'] = colWidths;

                // Create workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, sheetName);

                // Write file with proper formatting
                XLSX.writeFile(wb, `${fileName}.xlsx`, {
                    bookType: 'xlsx',
                    type: 'binary'
                });

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
            className={`flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
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

/**
 * Format cell values for Excel export
 */
function formatCellValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return value as string | number | boolean;
}

/**
 * Utility function to export data programmatically (for server-side or custom triggers)
 */
export function exportToExcel(
    data: Record<string, unknown>[],
    fileName: string,
    sheetName: string = "Sheet1",
    columns?: ColumnConfig[]
): void {
    if (!data || data.length === 0) {
        throw new Error("No data to export");
    }

    let formattedData: Record<string, unknown>[];
    let colWidths: { wch: number }[];

    if (columns && columns.length > 0) {
        formattedData = data.map(row => {
            const newRow: Record<string, unknown> = {};
            columns.forEach(col => {
                newRow[col.header] = formatCellValue(row[col.key]);
            });
            return newRow;
        });
        colWidths = columns.map(col => ({
            wch: col.width || Math.max(col.header.length + 2, 15)
        }));
    } else {
        const headers = Object.keys(data[0]);
        formattedData = data.map(row => {
            const newRow: Record<string, unknown> = {};
            headers.forEach(key => {
                const header = key.replace(/([A-Z])/g, ' $1').trim();
                const titleHeader = header.charAt(0).toUpperCase() + header.slice(1);
                newRow[titleHeader] = formatCellValue(row[key]);
            });
            return newRow;
        });
        colWidths = headers.map(key => ({
            wch: Math.max(key.length + 2, 15)
        }));
    }

    const ws = XLSX.utils.json_to_sheet(formattedData);
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    XLSX.writeFile(wb, `${fileName}.xlsx`, {
        bookType: 'xlsx',
        type: 'binary'
    });
}
