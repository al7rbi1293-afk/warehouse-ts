import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ManpowerClient } from "./ManpowerClient";
// Import UserRole type to use for casting
import { UserRole } from "@/types";

async function getManpowerData() {
    try {
        const [workers, shifts, supervisors, allAttendance, regions, allUsers] = await Promise.all([
            prisma.worker.findMany({
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
                where: {
                    date: {
                        gte: new Date(new Date().setDate(new Date().getDate() - 14)), // Reduced to 14 days for performance
                    },
                },
                include: { worker: true },
                orderBy: { date: 'desc' },
            }),
            prisma.region.findMany({
                orderBy: { name: "asc" },
            }),
            // Fetch all users for management tab (managers only)
            prisma.user.findMany({
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
            }),
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
            allUsers: allUsers.map(u => ({
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
    const data = await getManpowerData();

    return (
        <ManpowerClient
            data={data}
            userRole={user.role}
            userName={user.name || undefined}
            userRegion={user.region || undefined}
            userShiftId={user.shiftId || undefined}
            userShiftName={(user as any).shiftName || undefined}
            userAllowedShifts={(user as any).allowedShifts || undefined}
        />
    );
}
