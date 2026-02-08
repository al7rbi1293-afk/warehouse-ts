/**
 * Zone Mapping Utility
 * 
 * Implements the zone authorization logic:
 * - Supervisors tagged as [A, A2] can manage workers in Zone [A1]
 * - Supervisors tagged as [B, B2] can manage workers in Zone [B1]
 */

// Zone mapping rules: supervisor shift/tag -> authorized worker zones
export const ZONE_MAPPING: Record<string, string[]> = {
    // Morning shifts
    "A": ["A1"],
    "A1": ["A1"],
    "A2": ["A1"],
    // Night shifts
    "B": ["B1"],
    "B1": ["B1"],
    "B2": ["B1"],
};

/**
 * Get authorized zones for a supervisor based on their shift/tag
 */
export function getAuthorizedZones(supervisorShift: string | null | undefined): string[] {
    if (!supervisorShift) return [];

    // Check direct mapping
    const zones = ZONE_MAPPING[supervisorShift.toUpperCase()];
    if (zones) return zones;

    // Check if supervisor is tagged with multiple shifts (comma-separated)
    const shifts = supervisorShift.split(',').map(s => s.trim().toUpperCase());
    const authorizedZones = new Set<string>();

    for (const shift of shifts) {
        const mapped = ZONE_MAPPING[shift];
        if (mapped) {
            mapped.forEach(z => authorizedZones.add(z));
        }
    }

    return Array.from(authorizedZones);
}

/**
 * Check if a supervisor is authorized to manage a worker in a specific zone
 */
export function isAuthorizedForZone(
    supervisorShift: string | null | undefined,
    workerZone: string | null | undefined,
    supervisorRole: string
): boolean {
    // Managers have full access
    if (supervisorRole === 'manager') return true;

    if (!workerZone || !supervisorShift) return false;

    const authorizedZones = getAuthorizedZones(supervisorShift);
    return authorizedZones.includes(workerZone.toUpperCase());
}

/**
 * Validate batch of workers for authorization
 * Returns workers that the supervisor IS allowed to manage
 */
export function filterAuthorizedWorkers<T extends { region?: string | null; shiftName?: string | null }>(
    workers: T[],
    supervisorShift: string | null,
    supervisorRole: string
): T[] {
    // Managers have full access
    if (supervisorRole === 'manager') return workers;

    const authorizedZones = getAuthorizedZones(supervisorShift);

    return workers.filter(worker => {
        // Check by shift name if available
        if (worker.shiftName) {
            return authorizedZones.includes(worker.shiftName.toUpperCase());
        }
        // Fallback to region
        if (worker.region) {
            return authorizedZones.includes(worker.region.toUpperCase());
        }
        return false;
    });
}

/**
 * Get error message for unauthorized zone access
 */
export function getZoneAccessError(supervisorShift: string | null | undefined, workerZone: string): string {
    const authorized = getAuthorizedZones(supervisorShift);
    return `Unauthorized: You (${supervisorShift || 'unassigned'}) can only manage workers in zones [${authorized.join(', ') || 'none'}], not zone [${workerZone}]`;
}
