import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ManpowerClient } from "./ManpowerClient";
// Import UserRole type to use for casting
import { UserRole } from "@/types";

async function getManpowerData() {
    try {
        const [workers, shifts, supervisors, allAttendance, regions] = await Promise.all([
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
                        gte: new Date(new Date().setDate(new Date().getDate() - 30)), // Last 30 days
                    },
                },
                include: { worker: true },
                orderBy: { date: 'desc' },
            }),
            // @ts-expect-error: Prisma types are out of sync in editor
            prisma.region.findMany({
                orderBy: { name: "asc" },
            }),
        ]);

        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            workers: workers.map((w: any) => ({
                ...w,
                shiftName: w.shift?.name || null,
            })),
            shifts,
            // Cast the role strictly to match the interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supervisors: supervisors.map((s: any) => ({
                ...s,
                role: s.role as UserRole | null
            })),
            allAttendance,
            regions,
        };
    } catch (error) {
        console.error("Manpower data error:", error);
        return {
            workers: [],
            shifts: [],
            supervisors: [],
            allAttendance: [],
            regions: [],
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
            userName={user.name}
            userRegion={user.region}
            userShiftId={user.shiftId}
            userShiftName={user.shiftName}
        />
    );
}
