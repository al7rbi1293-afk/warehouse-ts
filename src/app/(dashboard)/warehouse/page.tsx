import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WarehouseClient } from "./WarehouseClient";

async function getWarehouseData(userRole: string, userName: string) {
    try {
        const [inventory, pendingRequests, approvedRequests, stockLogs, localInventory, warehouses] = await Promise.all([
            prisma.inventory.findMany({
                orderBy: { nameEn: "asc" },
            }),
            prisma.request.findMany({
                where: { status: "Pending" },
                orderBy: [{ region: "asc" }, { requestDate: "desc" }],
            }),
            prisma.request.findMany({
                where: { status: "Approved" },
                orderBy: { region: "asc" },
            }),
            prisma.stockLog.findMany({
                orderBy: { logDate: "desc" },
                take: 500,
            }),
            prisma.localInventory.findMany({
                orderBy: [{ region: "asc" }, { itemName: "asc" }],
            }),
            // @ts-expect-error: Prisma types are out of sync in editor
            prisma.warehouse.findMany({
                orderBy: { name: "asc" },
            }),
        ]);

        // If no warehouses found (e.g. migration issue), return empty or default?
        // Let's return what we found. Client will handle fallback.

        // For supervisors, get their own pending requests
        const myPendingRequests = userRole === "supervisor"
            ? await prisma.request.findMany({
                where: { supervisorName: userName, status: "Pending" },
                orderBy: { requestDate: "desc" },
            })
            : [];

        // For supervisors, get items ready for pickup
        const readyForPickup = userRole === "supervisor"
            ? await prisma.request.findMany({
                where: { supervisorName: userName, status: "Issued" },
                orderBy: { requestDate: "desc" },
            })
            : [];

        return {
            inventory,
            pendingRequests,
            approvedRequests,
            stockLogs,
            localInventory,
            myPendingRequests,
            readyForPickup,
            warehouses,
        };
    } catch (error) {
        console.error("Warehouse data error:", error);
        return {
            inventory: [],
            pendingRequests: [],
            approvedRequests: [],
            stockLogs: [],
            localInventory: [],
            myPendingRequests: [],
            readyForPickup: [],
            warehouses: [],
        };
    }
}

export default async function WarehousePage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return null;
    }

    const user = session.user;
    const data = await getWarehouseData(user.role, user.name);

    return (
        <WarehouseClient
            data={data}
            userRole={user.role}
            userName={user.name}
            userRegion={user.region}
        />
    );
}
