const NORMALIZED_EMERGENCY_AREA_KEYS = new Set([
    "ER",
    "EMERGENCY",
    "EMERGENCYROOM",
    "EMERGENCYDEPARTMENT",
]);

export const ER_ROOM_OPTIONS = ["FT1", "FT2", "Triage", "CC Resus"] as const;

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

export function getRoomOptionsForArea(area: string) {
    if (isEmergencyArea(area)) {
        return [...ER_ROOM_OPTIONS];
    }

    const floorNumber = extractFloorNumber(area);
    if (floorNumber !== null) {
        return getWardRoomOptionsForFloor(floorNumber);
    }

    return [] as string[];
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
