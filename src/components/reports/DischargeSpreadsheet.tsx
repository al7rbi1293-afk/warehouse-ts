"use client";

import { useMemo } from "react";
import type {
    DischargeEntryInput,
    DischargeRoomType,
} from "@/app/actions/reportQuestionnaire";

interface DischargeSpreadsheetProps {
    rows: DischargeEntryInput[];
    allowedRegions: string[];
    disabled?: boolean;
    onRowsChange: (rows: DischargeEntryInput[]) => void;
}

const ROOM_TYPE_OPTIONS: Array<{ value: DischargeRoomType; label: string }> = [
    { value: "normal_patient", label: "Normal patient" },
    { value: "isolation", label: "Isolation" },
];

const ROOM_TYPE_VALUE_BY_LABEL = new Map(
    ROOM_TYPE_OPTIONS.map((option) => [option.label, option.value])
);

const ROOM_TYPE_LABEL_BY_VALUE = new Map(
    ROOM_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

function createEmptyRow(): DischargeEntryInput {
    return {
        roomNumber: "",
        roomType: "normal_patient",
        area: "",
    };
}

export function DischargeSpreadsheet({
    rows,
    allowedRegions,
    disabled = false,
    onRowsChange,
}: DischargeSpreadsheetProps) {
    const normalizedRows = useMemo(
        () => (rows.length > 0 ? rows : [createEmptyRow()]),
        [rows]
    );

    const areaOptions = useMemo(() => {
        const dedup = new Map<string, string>();
        for (const region of allowedRegions) {
            const cleaned = region.trim();
            if (!cleaned) {
                continue;
            }
            dedup.set(cleaned.toUpperCase(), cleaned);
        }
        for (const row of normalizedRows) {
            const cleaned = row.area.trim();
            if (!cleaned) {
                continue;
            }
            if (!dedup.has(cleaned.toUpperCase())) {
                dedup.set(cleaned.toUpperCase(), cleaned);
            }
        }
        return Array.from(dedup.values());
    }, [allowedRegions, normalizedRows]);

    const updateRow = (index: number, patch: Partial<DischargeEntryInput>) => {
        onRowsChange(
            normalizedRows.map((row, rowIndex) =>
                rowIndex === index
                    ? {
                        ...row,
                        ...patch,
                    }
                    : row
            )
        );
    };

    const removeRow = (index: number) => {
        if (normalizedRows.length <= 1) {
            onRowsChange([createEmptyRow()]);
            return;
        }

        onRowsChange(normalizedRows.filter((_, rowIndex) => rowIndex !== index));
    };

    const addRow = () => {
        onRowsChange([...normalizedRows, createEmptyRow()]);
    };

    return (
        <div className="space-y-3">
            <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="w-12 px-3 py-2 text-left font-semibold text-slate-700">#</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Room number</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Type of room</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Area</th>
                            <th className="w-24 px-3 py-2 text-left font-semibold text-slate-700">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {normalizedRows.map((row, index) => (
                            <tr key={index}>
                                <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                                <td className="px-3 py-2">
                                    <input
                                        type="text"
                                        value={row.roomNumber}
                                        onChange={(event) =>
                                            updateRow(index, { roomNumber: event.target.value })
                                        }
                                        placeholder="Enter room number"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        disabled={disabled}
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <select
                                        value={ROOM_TYPE_LABEL_BY_VALUE.get(row.roomType) || "Normal patient"}
                                        onChange={(event) =>
                                            updateRow(index, {
                                                roomType:
                                                    ROOM_TYPE_VALUE_BY_LABEL.get(event.target.value) ||
                                                    "normal_patient",
                                            })
                                        }
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        disabled={disabled}
                                    >
                                        {ROOM_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.label}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-3 py-2">
                                    <select
                                        value={row.area}
                                        onChange={(event) => updateRow(index, { area: event.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        disabled={disabled || areaOptions.length === 0}
                                    >
                                        <option value="">Select area</option>
                                        {areaOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => removeRow(index)}
                                        disabled={disabled}
                                        className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-60"
                                    >
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={addRow}
                    disabled={disabled}
                    className="px-3 py-2 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-200 disabled:opacity-60"
                >
                    Add row
                </button>
            </div>
        </div>
    );
}
