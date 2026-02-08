"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { fetchMasterReportData } from "@/app/actions/reports";

interface MasterExportButtonProps {
    currentDate: string; // YYYY-MM-DD
    className?: string;
}

export function MasterExportButton({ currentDate, className }: MasterExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const data = await fetchMasterReportData(currentDate);

            if ('error' in data) {
                toast.error(data.error);
                return;
            }

            const wb = XLSX.utils.book_new();

            // Defined Columns
            // | # | Name | EMP ID | Status | Remarks |
            const HEADER_ROW = ["#", "Name", "EMP ID", "Status", "Remarks"];
            const COL_WIDTHS = [
                { wch: 5 },  // #
                { wch: 30 }, // Name
                { wch: 15 }, // EMP ID
                { wch: 15 }, // Status
                { wch: 40 }  // Remarks
            ];

            // --- HELPER TO BUILD SHEET DATA ---
            const buildSheetData = (shiftName: string, shiftDate: string, zoneData: Record<string, Array<{ name: string; status: string; notes?: string; empId?: string }>>) => {
                const wsData: (string | number | null)[][] = [];

                // 1. MANAGEMENT SECTION (Same for both sheets)
                if (data.management && data.management.length > 0) {
                    wsData.push(["MANAGEMENT"]);
                    wsData.push(HEADER_ROW);
                    data.management.forEach((w, idx) => {
                        wsData.push([
                            idx + 1,
                            w.name,
                            w.empId || '-',
                            w.status,
                            w.notes || ''
                        ]);
                    });
                    wsData.push([]); // Spacer
                }

                // 2. SUPERVISORS SECTION (Same for both sheets)
                if (data.supervisors && data.supervisors.length > 0) {
                    wsData.push(["SUPERVISORS"]);
                    wsData.push(HEADER_ROW);
                    data.supervisors.forEach((w, idx) => {
                        wsData.push([
                            idx + 1,
                            w.name,
                            w.empId || '-',
                            w.status,
                            w.notes || ''
                        ]);
                    });
                    wsData.push([]); // Spacer
                }

                // 3. SHIFT WORKERS BY ZONE
                wsData.push([`${shiftName} Shift (Date: ${shiftDate})`]);
                wsData.push([]); // Spacer

                Object.entries(zoneData).forEach(([zone, workers]) => {
                    // Zone Sub-header
                    wsData.push([zone.toUpperCase()]);
                    // Table Header
                    wsData.push(HEADER_ROW);

                    // Data Rows
                    workers.forEach((w, idx) => {
                        wsData.push([
                            idx + 1,
                            w.name,
                            w.empId || '-',
                            w.status,
                            w.notes || ''
                        ]);
                    });

                    wsData.push([]); // Spacer between zones
                });

                return wsData;
            };


            // --- SHEET 1: MORNING ---
            const morningData = buildSheetData("Morning", data.dates.morning, data.morning);
            const wsMorning = XLSX.utils.aoa_to_sheet(morningData);
            wsMorning['!cols'] = COL_WIDTHS;
            XLSX.utils.book_append_sheet(wb, wsMorning, `Morning - ${data.dates.morning}`);

            // --- SHEET 2: NIGHT ---
            const nightData = buildSheetData("Night", data.dates.night, data.night);
            const wsNight = XLSX.utils.aoa_to_sheet(nightData);
            wsNight['!cols'] = COL_WIDTHS;
            XLSX.utils.book_append_sheet(wb, wsNight, `Night - ${data.dates.night}`);

            // Export
            XLSX.writeFile(wb, `Master_Report_${currentDate}.xlsx`);
            toast.success("Master Report exported successfully");

        } catch (error) {
            console.error("Export failed", error);
            toast.error("Failed to generate report");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            onClick={handleExport}
            disabled={isExporting}
            className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
        >
            {isExporting ? (
                <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                </>
            ) : (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    Master Export
                </>
            )}
        </button>
    );
}
