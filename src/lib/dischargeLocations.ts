const NORMALIZED_EMERGENCY_AREA_KEYS = new Set([
    "ER",
    "EMERGENCY",
    "EMERGENCYROOM",
    "EMERGENCYDEPARTMENT",
]);

const AREA_DETAIL_SEPARATOR = "|||";

export const ER_AREA_DETAIL_OPTIONS = ["FT1", "FT2", "Triage", "CC Resus"] as const;

function normalizeAreaForComparison(value: string) {
    return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function isEmergencyArea(area: string) {
    const normalized = normalizeAreaForComparison(area.trim());
    return normalized.length > 0 && NORMALIZED_EMERGENCY_AREA_KEYS.has(normalized);
}

function extractFloorNumber(area: string): number | null {
    const text = area.trim().toLowerCase();
    const floorMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s*floor/);
    if (floorMatch) {
        return Number(floorMatch[1]);
    }

    const directFloorMatch = text.match(/floor\s*(\d{1,2})/);
    if (directFloorMatch) {
        return Number(directFloorMatch[1]);
    }

    return null;
}

export function getWardRoomOptionsForFloor(floor: number) {
    if (!Number.isInteger(floor) || floor < 1 || floor > 99) {
        return [] as string[];
    }

    return [`${floor}0`, `${floor}1`];
}

export function getAreaDetailOptions(area: string) {
    if (isEmergencyArea(area)) {
        return [...ER_AREA_DETAIL_OPTIONS];
    }

    const floorNumber = extractFloorNumber(area);
    if (floorNumber !== null) {
        return getWardRoomOptionsForFloor(floorNumber);
    }

    return [] as string[];
}

export function normalizeAreaDetailValue(area: string, areaDetail: string) {
    const options = getAreaDetailOptions(area);
    if (options.length === 0) {
        return normalizeSingleRoomValue(areaDetail);
    }

    const byNormalized = new Map(
        options.map((option) => [normalizeAreaForComparison(option), option])
    );
    return byNormalized.get(normalizeAreaForComparison(areaDetail)) || "";
}

export function encodeAreaValue(area: string, areaDetail: string) {
    const baseArea = area.trim();
    const detail = areaDetail.trim();
    if (!baseArea) {
        return "";
    }

    if (!detail) {
        return baseArea;
    }

    return `${baseArea}${AREA_DETAIL_SEPARATOR}${detail}`;
}

export function decodeAreaValue(rawArea: string) {
    const value = rawArea.trim();
    if (!value) {
        return { area: "", areaDetail: "" };
    }

    if (value.includes(AREA_DETAIL_SEPARATOR)) {
        const [area, ...rest] = value.split(AREA_DETAIL_SEPARATOR);
        return {
            area: area?.trim() || "",
            areaDetail: rest.join(AREA_DETAIL_SEPARATOR).trim(),
        };
    }

    const legacySplit = value.match(/^(.+?)\s*-\s*(.+)$/);
    if (legacySplit) {
        const candidateArea = legacySplit[1].trim();
        const candidateDetail = legacySplit[2].trim();
        const normalizedDetail = normalizeAreaDetailValue(candidateArea, candidateDetail);
        if (normalizedDetail) {
            return {
                area: candidateArea,
                areaDetail: normalizedDetail,
            };
        }
    }

    return { area: value, areaDetail: "" };
}

export function hasMultipleRoomValues(roomNumber: string) {
    const trimmed = roomNumber.trim();
    if (!trimmed) {
        return false;
    }

    if (/[,\n;/]/.test(trimmed)) {
        return true;
    }

    return /\s+&\s+|\s+\band\b\s+/i.test(trimmed);
}

export function normalizeSingleRoomValue(roomNumber: string) {
    return roomNumber.trim().replace(/\s+/g, " ");
}

export function splitRoomValues(roomNumber: string) {
    const trimmed = roomNumber.trim();
    if (!trimmed) {
        return [] as string[];
    }

    const expanded = trimmed
        .replace(/\s+\band\b\s+/gi, ",")
        .replace(/\s*&\s*/g, ",")
        .split(/[,;\n/]+/)
        .map((value) => normalizeSingleRoomValue(value))
        .filter((value) => value.length > 0);

    return Array.from(new Set(expanded));
}
