import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ManpowerClient } from "./ManpowerClient";
// Import UserRole type to use for casting
import { UserRole } from "@/types";

import { getAuthorizedZones } from "@/lib/zoneMapping";
import { getSubstituteZones } from "@/app/actions/staff"; // Direct import for server component

async function getManpowerData(user: any) {
    try {
        const isManager = user.role === 'manager';

        // Default filters (fetch all for manager)
        let workerFilter: any = {};
        let attendanceFilter: any = {
            date: {
                gte: new Date(new Date().setDate(new Date().getDate() - 14)), // Reduced to 14 days for performance
            },
        };

        // Strict isolation for supervisors
        if (!isManager && user.role === 'supervisor') {
            // 1. Get base authorized zones from shift/tags
            const shiftName = user.shiftName || (user.shiftId ? user.shiftId.toString() : null);
            let authorizedZones = new Set(getAuthorizedZones(shiftName));

            // 2. Add directly assigned regions (new multi-zone field)
            if (user.regions) {
                user.regions.split(',').forEach((r: string) => authorizedZones.add(r.trim().toUpperCase()));
            }
            if (user.region) {
                authorizedZones.add(user.region.trim().toUpperCase());
            }

            // 3. Add inherited zones from active substitutions
            try {
                const today = new Date().toISOString().split('T')[0];
                const subRes = await getSubstituteZones(parseInt(user.id), today);
                if (subRes.success && subRes.data) {
                    subRes.data.forEach((z: string) => authorizedZones.add(z.trim().toUpperCase()));
                }
            } catch (e) {
                console.error("Failed to fetch substitute zones in filtered query", e);
            }

            const zonesList = Array.from(authorizedZones);

            // Apply filters: Worker must be in authorized zone (by region OR shift name)
            workerFilter = {
                OR: [
                    { region: { in: zonesList, mode: 'insensitive' } },
                    { shift: { name: { in: zonesList, mode: 'insensitive' } } }
                ]
            };

            // Apply filters: Attendance must belong to a worker in authorized zone
            attendanceFilter.worker = {
                OR: [
                    { region: { in: zonesList, mode: 'insensitive' } },
                    { shift: { name: { in: zonesList, mode: 'insensitive' } } }
                ]
            };
        }

        const [workers, shifts, supervisors, allAttendance, regions, allUsers] = await Promise.all([
            prisma.worker.findMany({
                where: workerFilter,
                include: { shift: true },
                orderBy: { id: "desc" },
            }),
            prisma.shift.findMany({
                orderBy: { id: "asc" },
            }),
            prisma.user.findMany({
                where: { role: { not: "manager" } },
                orderBy: { name: "asc" },
            }),
            prisma.attendance.findMany({
                where: attendanceFilter,
                include: { worker: true },
                orderBy: { date: 'desc' },
            }),
            prisma.region.findMany({
                orderBy: { name: "asc" },
            }),
            // Fetch users: Managers see all, Supervisors see authorized list? 
            // For now, supervisors typically don't manage other users, so we can restrict this or leave as is if they don't have access to "Users" tab
            isManager ? prisma.user.findMany({
                select: {
                    id: true,
                    username: true,
                    name: true,
                    role: true,
                    region: true,
                    regions: true,
                    shiftId: true,
                    attendanceShiftId: true,
                    allowedShifts: true,
                },
                orderBy: { name: 'asc' }
            }) : Promise.resolve([]),
        ]);

        return {
            workers: workers.map(w => ({
                ...w,
                shiftName: w.shift?.name || null,
            })),
            shifts,
            supervisors: supervisors.map(s => ({
                ...s,
                role: s.role as UserRole | null
            })),
            allAttendance,
            regions,
            allUsers: (allUsers || []).map(u => ({
                ...u,
                role: u.role as UserRole | null
            })),
        };
    } catch (error) {
        console.error("Manpower data error:", error);
        return {
            workers: [],
            shifts: [],
            supervisors: [],
            allAttendance: [],
            regions: [],
            allUsers: [],
        };
    }
}


export default async function ManpowerPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return null;
    }

    const user = session.user;
    const data = await getManpowerData(user);

    // Handle substitute zones if user is a supervisor
    let effectiveRegion = user.region || "";
    // Merge newer multi-regions field if available
    if (user.regions) {
        const regions = new Set([
            ...effectiveRegion.split(",").map(r => r.trim()).filter(Boolean),
            ...user.regions.split(",").map(r => r.trim()).filter(Boolean)
        ]);
        effectiveRegion = Array.from(regions).join(",");
    }

    if (user.role === 'supervisor') {
        const today = new Date().toISOString().split('T')[0];
        const subRes = await getSubstituteZones(parseInt(user.id), today);

        if (subRes.success && subRes.data && subRes.data.length > 0) {
            const currentRegions = effectiveRegion.split(",").map(r => r.trim()).filter(Boolean);
            const allRegions = new Set([...currentRegions, ...subRes.data]);
            effectiveRegion = Array.from(allRegions).join(",");
        }
    }

    return (
        <ManpowerClient
            data={data}
            userRole={user.role}
            userName={user.name || undefined}
            userRegion={effectiveRegion || undefined}
            userShiftId={user.shiftId || undefined}
            userShiftName={(user as any).shiftName || undefined}
            userAllowedShifts={(user as any).allowedShifts || undefined}
        />
    );
}
