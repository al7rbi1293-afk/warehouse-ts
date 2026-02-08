"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { fetchMasterReportData, MasterReportData } from "@/app/actions/reports";

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

            // Define Columns
            const HEADER_ROW = ["#", "Name", "EMP ID", "Status", "Remarks"];
            const COL_WIDTHS = [
                { wch: 5 },  // #
                { wch: 30 }, // Name
                { wch: 15 }, // EMP ID
                { wch: 15 }, // Status
                { wch: 40 }  // Remarks
            ];

            // ========== MORNING SHIFT SHEET ==========
            const morningData: any[][] = [];

            // --- MANAGEMENT SECTION ---
            morningData.push(["MANAGEMENT"]);
            morningData.push(HEADER_ROW);
            if (data.management && data.management.length > 0) {
                data.management.forEach((w: any, idx: number) => {
                    morningData.push([
                        idx + 1,
                        w.name,
                        w.empId || '-',
                        w.status,
                        w.notes || ''
                    ]);
                });
            } else {
                morningData.push(["No Management Records"]);
            }
            morningData.push([]);

            // --- SUPERVISORS SECTION (Day Shift Only) ---
            const daySupervisors = data.supervisors.filter((s: any) =>
                !['B1', 'B', 'B2', 'Night'].includes(s.shift) && s.role !== 'night_supervisor'
            );
            morningData.push(["SUPERVISORS"]);
            morningData.push(HEADER_ROW);
            if (daySupervisors.length > 0) {
                daySupervisors.forEach((w: any, idx: number) => {
                    morningData.push([
                        idx + 1,
                        w.name,
                        w.empId || '-',
                        w.status,
                        w.notes || ''
                    ]);
                });
            } else {
                morningData.push(["No Day Supervisor Records"]);
            }
            morningData.push([]);

            // --- MORNING WORKERS SECTION ---
            morningData.push([`WORKERS (Date: ${data.dates.morning})`]);
            morningData.push([]);

            Object.entries(data.morning).forEach(([zone, workers]) => {
                morningData.push([zone.toUpperCase()]);
                morningData.push(HEADER_ROW);
                workers.forEach((w: any, idx: number) => {
                    morningData.push([
                        idx + 1,
                        w.name,
                        w.empId || '-',
                        w.status,
                        w.notes || ''
                    ]);
                });
                morningData.push([]);
            });

            const wsMorning = XLSX.utils.aoa_to_sheet(morningData);
            wsMorning['!cols'] = COL_WIDTHS;
            XLSX.utils.book_append_sheet(wb, wsMorning, "Morning Shift");

            // ========== NIGHT SHIFT SHEET ==========
            const nightData: any[][] = [];

            // --- NIGHT SUPERVISORS SECTION ---
            const nightSupervisors = data.supervisors.filter((s: any) =>
                ['B1', 'B', 'B2', 'Night'].includes(s.shift) || s.role === 'night_supervisor'
            );
            nightData.push(["SUPERVISORS"]);
            nightData.push(HEADER_ROW);
            if (nightSupervisors.length > 0) {
                nightSupervisors.forEach((w: any, idx: number) => {
                    nightData.push([
                        idx + 1,
                        w.name,
                        w.empId || '-',
                        w.status,
                        w.notes || ''
                    ]);
                });
            } else {
                nightData.push(["No Night Supervisor Records"]);
            }
            nightData.push([]);

            // --- NIGHT WORKERS SECTION ---
            nightData.push([`WORKERS (Date: ${data.dates.night})`]);
            nightData.push([]);

            Object.entries(data.night).forEach(([zone, workers]) => {
                nightData.push([zone.toUpperCase()]);
                nightData.push(HEADER_ROW);
                workers.forEach((w: any, idx: number) => {
                    nightData.push([
                        idx + 1,
                        w.name,
                        w.empId || '-',
                        w.status,
                        w.notes || ''
                    ]);
                });
                nightData.push([]);
            });

            const wsNight = XLSX.utils.aoa_to_sheet(nightData);
            wsNight['!cols'] = COL_WIDTHS;
            XLSX.utils.book_append_sheet(wb, wsNight, "Night Shift");

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
