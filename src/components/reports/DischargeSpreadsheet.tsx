"use client";

import { useEffect, useMemo, useRef } from "react";
import type Handsontable from "handsontable";
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

function serializeRows(rows: DischargeEntryInput[]) {
    return JSON.stringify(
        rows.map((row) => ({
            roomNumber: row.roomNumber || "",
            roomType: row.roomType || "normal_patient",
            area: row.area || "",
        }))
    );
}

function toSheetRows(rows: DischargeEntryInput[]) {
    return rows.map((row) => [
        row.roomNumber || "",
        ROOM_TYPE_LABEL_BY_VALUE.get(row.roomType) || "Normal patient",
        row.area || "",
    ]);
}

function fromSheetRows(rawRows: unknown[][]): DischargeEntryInput[] {
    return rawRows.map((rawRow) => {
        const roomNumber = String(rawRow?.[0] ?? "");
        const roomTypeLabel = String(rawRow?.[1] ?? "Normal patient");
        const area = String(rawRow?.[2] ?? "");

        return {
            roomNumber,
            roomType: ROOM_TYPE_VALUE_BY_LABEL.get(roomTypeLabel) || "normal_patient",
            area,
        };
    });
}

export function DischargeSpreadsheet({
    rows,
    allowedRegions,
    disabled = false,
    onRowsChange,
}: DischargeSpreadsheetProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hotRef = useRef<Handsontable | null>(null);
    const onRowsChangeRef = useRef(onRowsChange);
    const lastSerializedRowsRef = useRef(serializeRows(rows));
    const isProgrammaticSyncRef = useRef(false);

    onRowsChangeRef.current = onRowsChange;

    const areaOptions = useMemo(() => {
        const dedup = new Map<string, string>();
        for (const region of allowedRegions) {
            const cleaned = region.trim();
            if (!cleaned) {
                continue;
            }
            dedup.set(cleaned.toUpperCase(), cleaned);
        }
        return Array.from(dedup.values());
    }, [allowedRegions]);

    useEffect(() => {
        let cancelled = false;

        const mount = async () => {
            const handsontableModule = await import("handsontable");
            const HandsontableCtor = handsontableModule.default;
            if (cancelled || !containerRef.current) {
                return;
            }

            hotRef.current = new HandsontableCtor(containerRef.current, {
                data: [],
                colHeaders: ["Room number", "Type of room", "Area"],
                rowHeaders: true,
                height: "auto",
                stretchH: "all",
                minSpareRows: 1,
                autoWrapRow: true,
                autoWrapCol: true,
                copyPaste: true,
                contextMenu: true,
                fillHandle: true,
                manualRowResize: true,
                manualColumnResize: true,
                undo: true,
                readOnly: false,
                columns: [
                    {
                        type: "text",
                    },
                    {
                        type: "dropdown",
                        source: ROOM_TYPE_OPTIONS.map((option) => option.label),
                        strict: true,
                        allowInvalid: false,
                    },
                    {
                        type: "dropdown",
                        source: [],
                        strict: true,
                        allowInvalid: false,
                    },
                ],
                licenseKey: "non-commercial-and-evaluation",
                afterChange: (changes, source) => {
                    if (!changes || isProgrammaticSyncRef.current || source === "loadData") {
                        return;
                    }

                    const instance = hotRef.current;
                    if (!instance) {
                        return;
                    }

                    const mappedRows = fromSheetRows(
                        instance.getData() as unknown[][]
                    );
                    lastSerializedRowsRef.current = serializeRows(mappedRows);
                    onRowsChangeRef.current(mappedRows);
                },
            });
        };

        void mount();

        return () => {
            cancelled = true;
            hotRef.current?.destroy();
            hotRef.current = null;
        };
    }, []);

    useEffect(() => {
        const instance = hotRef.current;
        if (!instance) {
            return;
        }

        instance.updateSettings({
            readOnly: disabled,
            columns: [
                {
                    type: "text",
                },
                {
                    type: "dropdown",
                    source: ROOM_TYPE_OPTIONS.map((option) => option.label),
                    strict: true,
                    allowInvalid: false,
                },
                {
                    type: "dropdown",
                    source: areaOptions,
                    strict: true,
                    allowInvalid: false,
                },
            ],
        });
    }, [areaOptions, disabled]);

    useEffect(() => {
        const instance = hotRef.current;
        if (!instance) {
            return;
        }

        const nextSerialized = serializeRows(rows);
        if (nextSerialized === lastSerializedRowsRef.current) {
            return;
        }

        isProgrammaticSyncRef.current = true;
        instance.loadData(toSheetRows(rows));
        isProgrammaticSyncRef.current = false;
        lastSerializedRowsRef.current = nextSerialized;
    }, [rows]);

    return <div ref={containerRef} className="w-full overflow-hidden rounded-lg border border-slate-200" />;
}
