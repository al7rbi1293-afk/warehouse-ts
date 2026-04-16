"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/app/actions/audit";
import { revalidateWarehouseData } from "@/lib/cache-tags";
import { buildBulkOperationNo, normalizePositiveInt } from "@/lib/warehouse-utils";
import { WarehouseBulkOperationType } from "@/types";

type TxClient = Prisma.TransactionClient;
type AuthSession = Session | null;

type BulkRequestItemInput = {
    itemId?: number | null;
    itemName: string;
    itemCode?: string | null;
    category?: string | null;
    qty: number;
    unit?: string | null;
    sourceWarehouse?: string | null;
    targetRegion?: string | null;
    notes?: string | null;
    priority?: string | null;
};

type BulkMovementLineInput = {
    itemId?: number | null;
    itemName: string;
    itemCode?: string | null;
    fromWarehouse?: string | null;
    toWarehouse?: string | null;
    projectName?: string | null;
    qty: number;
    unit?: string | null;
    notes?: string | null;
    reference?: string | null;
    expectedReturnDate?: string | null;
};

type BulkIssueLineInput = {
    reqId: number;
    qty: number;
    itemName: string;
    region: string;
    unit: string;
    notes?: string | null;
};

function getActorName(session: AuthSession) {
    return session?.user.name || session?.user.username || "System";
}

function getActorUserId(session: AuthSession) {
    const parsed = Number(session?.user.id);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseAssignedRegions(raw: string | null | undefined) {
    return (raw || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function ensureRegionAccess(session: AuthSession, region: string) {
    if (session?.user.role !== "supervisor") {
        return true;
    }

    const allowedRegions = parseAssignedRegions(session.user.region || session.user.regions);
    return allowedRegions.length === 0 || allowedRegions.includes(region);
}

function buildDuplicateKey(parts: Array<string | number | null | undefined>) {
    return parts.map((part) => `${part ?? ""}`.trim().toLowerCase()).join("::");
}

async function createBulkOperationHeader(
    tx: TxClient,
    operationType: WarehouseBulkOperationType,
    createdBy: string,
    createdByUserId: number | null,
    notes?: string | null,
    metadata?: Prisma.InputJsonValue
) {
    const seedNo = `${operationType}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const created = await tx.warehouseBulkOperation.create({
        data: {
            operationNo: seedNo,
            operationType,
            status: "Pending",
            createdBy,
            createdByUserId,
            notes: notes || null,
            metadata,
            submittedAt: new Date(),
        },
    });

    const operationNo = buildBulkOperationNo(operationType, created.id);

    return tx.warehouseBulkOperation.update({
        where: { id: created.id },
        data: { operationNo },
    });
}

async function resolveInventoryItemForWarehouse(
    tx: TxClient,
    args: {
        itemId?: number | null;
        itemName?: string | null;
        location?: string | null;
    }
) {
    if (args.itemId) {
        const byId = await tx.inventory.findUnique({ where: { id: args.itemId } });
        if (byId && (!args.location || byId.location === args.location)) {
            return byId;
        }

        if (byId && args.location) {
            const matchingByLocation = await tx.inventory.findFirst({
                where: {
                    nameEn: byId.nameEn,
                    location: args.location,
                },
            });
            if (matchingByLocation) {
                return matchingByLocation;
            }
        }
    }

    if (args.itemName) {
        return tx.inventory.findFirst({
            where: {
                nameEn: args.itemName,
                ...(args.location ? { location: args.location } : {}),
            },
            orderBy: { id: "asc" },
        });
    }

    return null;
}

async function executeTransferLine(
    tx: TxClient,
    args: {
        itemId?: number | null;
        itemName?: string | null;
        qty: number;
        fromLocation: string;
        toLocation: string;
        user: string;
        unit?: string | null;
        notes?: string | null;
    }
) {
    if (args.fromLocation === args.toLocation) {
        throw new Error("Source and destination must be different");
    }

    const baseItem = await resolveInventoryItemForWarehouse(tx, {
        itemId: args.itemId,
        itemName: args.itemName,
        location: args.fromLocation === "CWW" ? undefined : args.fromLocation,
    });

    if (!baseItem) {
        throw new Error(`Item not found in ${args.fromLocation}`);
    }

    const unit = args.unit || baseItem.unit || "PCS";
    const isCWW = args.fromLocation === "CWW";
    const availableQtySnapshot = isCWW ? null : baseItem.qty;

    if (!isCWW) {
        const deduction = await tx.inventory.updateMany({
            where: {
                id: baseItem.id,
                qty: { gte: args.qty },
            },
            data: {
                qty: { decrement: args.qty },
                lastUpdated: new Date(),
            },
        });

        if (deduction.count === 0) {
            throw new Error(`Insufficient stock in ${args.fromLocation}`);
        }

        await tx.stockLog.create({
            data: {
                itemName: baseItem.nameEn,
                location: args.fromLocation,
                changeAmount: -args.qty,
                newQty: baseItem.qty - args.qty,
                actionBy: args.user,
                actionType: `Transfer Out to ${args.toLocation}${args.notes ? ` - ${args.notes}` : ""}`,
                unit,
            },
        });
    }

    let destinationItem = await tx.inventory.findFirst({
        where: { nameEn: baseItem.nameEn, location: args.toLocation },
    });

    if (!destinationItem) {
        destinationItem = await tx.inventory.create({
            data: {
                nameEn: baseItem.nameEn,
                nameAr: baseItem.nameAr,
                itemCode: baseItem.itemCode,
                category: baseItem.category,
                unit: baseItem.unit,
                qty: 0,
                location: args.toLocation,
                status: "Available",
            },
        });
    }

    await tx.inventory.update({
        where: { id: destinationItem.id },
        data: {
            qty: { increment: args.qty },
            lastUpdated: new Date(),
        },
    });

    await tx.stockLog.create({
        data: {
            itemName: baseItem.nameEn,
            location: args.toLocation,
            changeAmount: args.qty,
            newQty: (destinationItem.qty || 0) + args.qty,
            actionBy: args.user,
            actionType: `Transfer In from ${args.fromLocation}`,
            unit,
        },
    });

    return {
        item: baseItem,
        availableQtySnapshot,
        unit,
    };
}

async function executeLendLine(
    tx: TxClient,
    args: {
        itemId?: number | null;
        itemName?: string | null;
        qty: number;
        sourceWarehouse: string;
        projectName: string;
        user: string;
        unit?: string | null;
        notes?: string | null;
        reference?: string | null;
        expectedReturnDate?: Date | null;
    }
) {
    const item = await resolveInventoryItemForWarehouse(tx, {
        itemId: args.itemId,
        itemName: args.itemName,
        location: args.sourceWarehouse,
    });

    if (!item) {
        throw new Error(`Item not found in ${args.sourceWarehouse}`);
    }

    const unit = args.unit || item.unit || "PCS";

    const deduction = await tx.inventory.updateMany({
        where: {
            id: item.id,
            qty: { gte: args.qty },
        },
        data: {
            qty: { decrement: args.qty },
            lastUpdated: new Date(),
        },
    });

    if (deduction.count === 0) {
        throw new Error("Insufficient stock");
    }

    await tx.stockLog.create({
        data: {
            itemName: item.nameEn,
            location: args.sourceWarehouse,
            changeAmount: -args.qty,
            newQty: item.qty - args.qty,
            actionBy: args.user,
            actionType: `Lent to ${args.projectName}${args.notes ? ` - ${args.notes}` : ""}`,
            unit,
        },
    });

    const loan = await tx.loan.create({
        data: {
            itemId: item.id,
            itemName: item.nameEn,
            project: args.projectName,
            quantity: args.qty,
            originalQuantity: args.qty,
            returnedQuantity: 0,
            type: "Lend",
            sourceWarehouse: args.sourceWarehouse,
            date: new Date().toISOString(),
            status: "Open",
            expectedReturnDate: args.expectedReturnDate,
            reference: args.reference || null,
            notes: args.notes || null,
        },
    });

    return {
        item,
        loan,
        unit,
    };
}

async function executeBorrowLine(
    tx: TxClient,
    args: {
        itemId?: number | null;
        itemName?: string | null;
        qty: number;
        projectName: string;
        location: string;
        user: string;
        unit?: string | null;
        notes?: string | null;
        reference?: string | null;
    }
) {
    let item = await resolveInventoryItemForWarehouse(tx, {
        itemId: args.itemId,
        itemName: args.itemName,
        location: args.location,
    });

    if (!item) {
        const referenceItem = await resolveInventoryItemForWarehouse(tx, {
            itemId: args.itemId,
            itemName: args.itemName,
        });

        if (!referenceItem) {
            throw new Error("Item reference not found");
        }

        item = await tx.inventory.create({
            data: {
                nameEn: referenceItem.nameEn,
                nameAr: referenceItem.nameAr,
                itemCode: referenceItem.itemCode,
                category: referenceItem.category,
                unit: referenceItem.unit,
                qty: 0,
                location: args.location,
                status: "Available",
            },
        });
    }

    const openLoans = await tx.loan.findMany({
        where: {
            itemName: item.nameEn,
            project: args.projectName,
            status: { in: ["Active", "Open"] },
        },
        orderBy: { id: "asc" },
    });

    const openBalance = openLoans.reduce((total, loanRecord) => total + loanRecord.quantity, 0);
    if (openBalance < args.qty) {
        throw new Error(`Return quantity exceeds open balance for ${item.nameEn}. Open balance: ${openBalance}`);
    }

    await tx.inventory.update({
        where: { id: item.id },
        data: {
            qty: { increment: args.qty },
            lastUpdated: new Date(),
        },
    });

    await tx.stockLog.create({
        data: {
            itemName: item.nameEn,
            location: args.location,
            changeAmount: args.qty,
            newQty: item.qty + args.qty,
            actionBy: args.user,
            actionType: `Returned from ${args.projectName}${args.notes ? ` - ${args.notes}` : ""}`,
            unit: args.unit || item.unit || "PCS",
        },
    });

    let remainingQty = args.qty;
    for (const loanRecord of openLoans) {
        if (remainingQty <= 0) {
            break;
        }

        const settledQty = Math.min(loanRecord.quantity, remainingQty);
        const nextQty = loanRecord.quantity - settledQty;
        const nextReturned = (loanRecord.returnedQuantity || 0) + settledQty;

        await tx.loan.update({
            where: { id: loanRecord.id },
            data: {
                quantity: nextQty,
                returnedQuantity: nextReturned,
                status: nextQty === 0 ? "Closed" : loanRecord.status,
                returnDate: nextQty === 0 ? new Date() : loanRecord.returnDate,
            },
        });

        remainingQty -= settledQty;
    }

    const borrowRecord = await tx.loan.create({
        data: {
            itemId: item.id,
            itemName: item.nameEn,
            project: args.projectName,
            quantity: args.qty,
            originalQuantity: args.qty,
            returnedQuantity: args.qty,
            type: "Borrow",
            sourceWarehouse: args.location,
            date: new Date().toISOString(),
            status: "Closed",
            returnDate: new Date(),
            reference: args.reference || null,
            notes: args.notes || null,
        },
    });

    return {
        item,
        borrowRecord,
        unit: args.unit || item.unit || "PCS",
    };
}

async function executeIssueLine(
    tx: TxClient,
    args: {
        reqId: number;
        qty: number;
        itemName: string;
        region: string;
        user: string;
        unit: string;
        notes?: string | null;
    }
) {
    const currentRequest = await tx.request.findUnique({
        where: { reqId: args.reqId },
    });

    if (!currentRequest) {
        throw new Error(`Request #${args.reqId} not found`);
    }

    if (currentRequest.status !== "Approved") {
        throw new Error(`Request #${args.reqId} is already ${currentRequest.status}`);
    }

    const inventoryItem = await tx.inventory.findFirst({
        where: {
            nameEn: args.itemName,
            location: "NSTC",
        },
    });

    const availableQtySnapshot = inventoryItem?.qty || 0;

    const deduction = await tx.inventory.updateMany({
        where: {
            nameEn: args.itemName,
            location: "NSTC",
            qty: { gte: args.qty },
        },
        data: {
            qty: { decrement: args.qty },
            lastUpdated: new Date(),
        },
    });

    if (deduction.count === 0) {
        throw new Error(`Insufficient stock for ${args.itemName}. Available: ${availableQtySnapshot}`);
    }

    await tx.stockLog.create({
        data: {
            itemName: args.itemName,
            location: "NSTC",
            changeAmount: -args.qty,
            newQty: Math.max(availableQtySnapshot - args.qty, 0),
            actionBy: args.user,
            actionType: `Issued ${args.region}${args.notes ? ` - ${args.notes}` : ""}`,
            unit: args.unit,
        },
    });

    const request = await tx.request.update({
        where: { reqId: args.reqId },
        data: {
            status: "Issued",
            qty: args.qty,
            notes: args.notes || currentRequest.notes,
            issuedBy: args.user,
            issuedAt: new Date(),
        },
    });

    return {
        request,
        availableQtySnapshot,
    };
}

export async function createInventoryItem(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    const nameEn = formData.get("nameEn") as string;
    const nameAr = (formData.get("nameAr") as string) || null;
    const itemCode = (formData.get("materialCode") as string) || null;
    const category = formData.get("category") as string;
    const unit = formData.get("unit") as string;
    const qty = parseInt(formData.get("qty") as string);
    const location = formData.get("location") as string;
    const minThreshold = parseInt((formData.get("minThreshold") as string) || "10");

    try {
        // Check if item exists
        const existing = await prisma.inventory.findFirst({
            where: { nameEn, location },
        });

        if (existing) {
            return { success: false, message: "Item already exists in this location" };
        }

        await prisma.inventory.create({
            data: {
                nameEn,
                nameAr,
                itemCode,
                category,
                unit,
                qty,
                minThreshold: Number.isNaN(minThreshold) ? 10 : minThreshold,
                location,
                status: "Available",
            },
        });

        await logAudit(session.user.name || session.user.username, "Create Item", `Created item ${nameEn} in ${location}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Item created successfully" };
    } catch (error) {
        console.error("Create inventory error:", error);
        return { success: false, message: "Failed to create item" };
    }
}

// Add new inventory item (simpler function)
export async function addInventoryItem(
    nameEn: string,
    category: string,
    unit: string,
    qty: number,
    location: string,
    minThreshold = 10
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        // Check if item exists
        const existing = await prisma.inventory.findFirst({
            where: { nameEn, location },
        });

        if (existing) {
            return { success: false, message: "This item already exists in this location" };
        }

        await prisma.inventory.create({
            data: {
                nameEn,
                itemCode: null,
                category,
                unit,
                qty,
                minThreshold,
                location,
                status: "Available",
            },
        });

        revalidateWarehouseData();
        return { success: true, message: "Item added successfully" };
    } catch (error) {
        console.error("Add inventory error:", error);
        return { success: false, message: "Failed to add item" };
    }
}

// Update inventory item
export async function updateInventoryItem(
    id: number,
    data: {
        nameEn?: string;
        category?: string;
        unit?: string;
        qty?: number;
        minThreshold?: number;
    },
    userName: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const item = await prisma.inventory.findUnique({ where: { id } });
        if (!item) {
            return { success: false, message: "Item not found" };
        }

        const updateData: Record<string, unknown> = { ...data, lastUpdated: new Date() };

        // Log if quantity changed
        if (data.qty !== undefined && data.qty !== item.qty) {
            const diff = data.qty - item.qty;
            await prisma.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: item.location,
                    changeAmount: diff,
                    newQty: data.qty,
                    actionBy: userName,
                    actionType: "Manual Edit",
                    unit: data.unit || item.unit || "Piece",
                },
            });
        }

        await prisma.inventory.update({
            where: { id },
            data: updateData,
        });

        await logAudit(session.user.name || session.user.username, "Update Item", `Updated item ID ${id}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Item updated successfully" };
    } catch (error) {
        console.error("Update inventory error:", error);
        return { success: false, message: "Failed to update item" };
    }
}

// Delete inventory item
export async function deleteInventoryItem(id: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        const item = await prisma.inventory.findUnique({ where: { id } });
        if (!item) {
            return { success: false, message: "Item not found" };
        }

        await prisma.inventory.delete({ where: { id } });

        await logAudit(session.user.name || session.user.username, "Delete Item", `Deleted item ID ${id}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Item deleted successfully" };
    } catch (error) {
        console.error("Delete inventory error:", error);
        return { success: false, message: "Failed to delete item" };
    }
}

export async function updateStock(
    itemName: string,
    location: string,
    change: number,
    user: string,
    actionType: string,
    unit: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const item = await prisma.inventory.findFirst({
            where: { nameEn: itemName, location },
        });

        if (!item) {
            return { success: false, message: "Item not found" };
        }

        // Use atomic increment for concurrency safety
        await prisma.$transaction(async (tx) => {
            await tx.inventory.update({
                where: { id: item.id },
                data: {
                    qty: { increment: change }, // Atomic update
                    lastUpdated: new Date()
                },
            });

            // Calculate new qty for log (safely derived or purely for logging)
            // Note: In high concurrency, this log might be slightly off regarding 'newQty', 
            // but the inventory count will be correct.
            const newQty = item.qty + change;

            await tx.stockLog.create({
                data: {
                    itemName,
                    location,
                    changeAmount: change,
                    newQty,
                    actionBy: user,
                    actionType,
                    unit,
                },
            });
        });

        revalidateWarehouseData();
        return { success: true, message: "Stock updated successfully" };
    } catch (error) {
        console.error("Update stock error:", error);
        return { success: false, message: "Failed to update stock" };
    }
}

export async function transferStock(
    itemId: number,
    qty: number,
    fromLocation: string,
    toLocation: string,
    user: string,
    unit: string,
    notes?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            await executeTransferLine(tx, {
                itemId,
                qty,
                fromLocation,
                toLocation,
                user,
                unit,
                notes,
            });
        });

        revalidateWarehouseData();
        return { success: true, message: "Transfer completed successfully" };
    } catch (error) {
        console.error("Transfer error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
        return { success: false, message: msg === `Insufficient stock in ${fromLocation}` ? msg : "Transfer failed" };
    }
}

export async function lendStock(
    itemId: number,
    qty: number,
    projectName: string,
    user: string,
    unit: string,
    notes?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            const item = await tx.inventory.findUnique({ where: { id: itemId } });
            await executeLendLine(tx, {
                itemId,
                qty,
                sourceWarehouse: item?.location || "NSTC",
                projectName,
                user,
                unit,
                notes,
            });
        });

        revalidateWarehouseData();
        return { success: true, message: `Successfully lent to ${projectName}` };
    } catch (error) {
        console.error("Lend error:", error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = (error as any).message;
        return { success: false, message: msg === "Insufficient stock" ? msg : "Lend operation failed" };
    }
}

export async function returnStock(
    itemId: number, // Use the ID of the warehouse item to increase, or find by name
    qty: number,
    projectName: string,
    location: string, // Which warehouse is receiving the return
    user: string,
    unit: string,
    notes?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            await executeBorrowLine(tx, {
                itemId,
                qty,
                projectName,
                location,
                user,
                unit,
                notes,
            });
        });

        revalidateWarehouseData();
        return { success: true, message: `Successfully returned from ${projectName}` };
    } catch (error) {
        console.error("Return error:", error);
        return { success: false, message: "Return operation failed" };
    }
}

export async function createBulkMovementOperation(input: {
    operationType: "TRANSFER" | "LEND" | "BORROW";
    notes?: string;
    lines: BulkMovementLineInput[];
}) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const actorName = getActorName(session);
        const validLines = input.lines
            .map((line, index) => ({
                ...line,
                qty: normalizePositiveInt(line.qty),
                lineNo: index + 1,
            }))
            .filter((line) => line.qty !== null) as Array<BulkMovementLineInput & { qty: number; lineNo: number }>;

        if (validLines.length === 0) {
            return { success: false, message: "Add at least one valid line item" };
        }

        const duplicateKeys = new Set<string>();
        for (const line of validLines) {
            const key = buildDuplicateKey([
                line.itemId || line.itemName,
                line.fromWarehouse || line.projectName,
                line.toWarehouse || line.projectName,
                input.operationType,
            ]);

            if (duplicateKeys.has(key)) {
                return { success: false, message: `Duplicate line detected for ${line.itemName}` };
            }

            duplicateKeys.add(key);
        }

        const result = await prisma.$transaction(async (tx) => {
            const bulkOperation = await createBulkOperationHeader(
                tx,
                input.operationType,
                actorName,
                getActorUserId(session),
                input.notes || null,
                {
                    lineCount: validLines.length,
                    operationType: input.operationType,
                }
            );

            let totalQuantity = 0;

            for (const line of validLines) {
                const parsedExpectedReturnDate = line.expectedReturnDate ? new Date(line.expectedReturnDate) : null;

                if (input.operationType === "TRANSFER") {
                    if (!line.fromWarehouse || !line.toWarehouse) {
                        throw new Error(`Line ${line.lineNo}: source and destination warehouses are required`);
                    }

                    const resultLine = await executeTransferLine(tx, {
                        itemId: line.itemId,
                        itemName: line.itemName,
                        qty: line.qty,
                        fromLocation: line.fromWarehouse,
                        toLocation: line.toWarehouse,
                        user: actorName,
                        unit: line.unit,
                        notes: line.notes || line.reference || null,
                    });

                    await tx.warehouseBulkOperationLine.create({
                        data: {
                            bulkOperationId: bulkOperation.id,
                            lineNo: line.lineNo,
                            entityType: "stock_transfer",
                            status: "Completed",
                            itemId: resultLine.item.id,
                            itemName: resultLine.item.nameEn,
                            itemCode: resultLine.item.itemCode,
                            category: resultLine.item.category,
                            unit: resultLine.unit,
                            quantity: line.qty,
                            approvedQty: line.qty,
                            fulfilledQty: line.qty,
                            availableQtySnapshot: resultLine.availableQtySnapshot ?? undefined,
                            fromWarehouse: line.fromWarehouse,
                            toWarehouse: line.toWarehouse,
                            notes: line.notes || null,
                            metadata: {
                                reference: line.reference || null,
                            },
                        },
                    });
                }

                if (input.operationType === "LEND") {
                    if (!line.fromWarehouse || !line.projectName) {
                        throw new Error(`Line ${line.lineNo}: source warehouse and borrowing entity are required`);
                    }

                    const resultLine = await executeLendLine(tx, {
                        itemId: line.itemId,
                        itemName: line.itemName,
                        qty: line.qty,
                        sourceWarehouse: line.fromWarehouse,
                        projectName: line.projectName,
                        user: actorName,
                        unit: line.unit,
                        notes: line.notes || null,
                        reference: line.reference || null,
                        expectedReturnDate: parsedExpectedReturnDate,
                    });

                    await tx.warehouseBulkOperationLine.create({
                        data: {
                            bulkOperationId: bulkOperation.id,
                            lineNo: line.lineNo,
                            entityType: "loan",
                            entityId: resultLine.loan.id,
                            status: "Open",
                            itemId: resultLine.item.id,
                            itemName: resultLine.item.nameEn,
                            itemCode: resultLine.item.itemCode,
                            category: resultLine.item.category,
                            unit: resultLine.unit,
                            quantity: line.qty,
                            approvedQty: line.qty,
                            fulfilledQty: line.qty,
                            availableQtySnapshot: resultLine.item.qty,
                            fromWarehouse: line.fromWarehouse,
                            projectName: line.projectName,
                            expectedReturnDate: parsedExpectedReturnDate,
                            notes: line.notes || null,
                            metadata: {
                                reference: line.reference || null,
                            },
                        },
                    });
                }

                if (input.operationType === "BORROW") {
                    if (!line.projectName || !line.toWarehouse) {
                        throw new Error(`Line ${line.lineNo}: source entity and receiving warehouse are required`);
                    }

                    const resultLine = await executeBorrowLine(tx, {
                        itemId: line.itemId,
                        itemName: line.itemName,
                        qty: line.qty,
                        projectName: line.projectName,
                        location: line.toWarehouse,
                        user: actorName,
                        unit: line.unit,
                        notes: line.notes || null,
                        reference: line.reference || null,
                    });

                    await tx.warehouseBulkOperationLine.create({
                        data: {
                            bulkOperationId: bulkOperation.id,
                            lineNo: line.lineNo,
                            entityType: "loan_return",
                            entityId: resultLine.borrowRecord.id,
                            status: "Completed",
                            itemId: resultLine.item.id,
                            itemName: resultLine.item.nameEn,
                            itemCode: resultLine.item.itemCode,
                            category: resultLine.item.category,
                            unit: resultLine.unit,
                            quantity: line.qty,
                            approvedQty: line.qty,
                            fulfilledQty: line.qty,
                            fromWarehouse: line.projectName,
                            toWarehouse: line.toWarehouse,
                            projectName: line.projectName,
                            notes: line.notes || null,
                            metadata: {
                                reference: line.reference || null,
                            },
                        },
                    });
                }

                totalQuantity += line.qty;
            }

            return tx.warehouseBulkOperation.update({
                where: { id: bulkOperation.id },
                data: {
                    status: "Completed",
                    metadata: {
                        lineCount: validLines.length,
                        totalQuantity,
                        operationType: input.operationType,
                    },
                },
            });
        });

        await logAudit(actorName, `Bulk ${input.operationType}`, `Processed ${validLines.length} lines under ${result.operationNo}`, "Warehouse");
        revalidateWarehouseData();
        return {
            success: true,
            message: `${validLines.length} lines processed successfully`,
            operationNo: result.operationNo,
        };
    } catch (error) {
        console.error("Bulk movement operation error:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to process bulk operation",
        };
    }
}

export async function createRequest(
    supervisorName: string,
    region: string,
    itemName: string,
    category: string,
    qty: number,
    unit: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.request.create({
            data: {
                supervisorName,
                region,
                itemName,
                category,
                qty,
                unit,
                status: "Pending",
                shiftId: session.user.shiftId ? Number(session.user.shiftId) : null,
                shiftName: session.user.shiftName,
            },
        });

        await logAudit(session.user.name || session.user.username, "Create Request", `Created request for ${itemName}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Request created" };
    } catch (error) {
        console.error("Create request error:", error);
        return { success: false, message: "Failed to create request" };
    }
}

// Create bulk requests (multiple items at once)
export async function createBulkRequest(
    supervisorName: string,
    region: string,
    items: BulkRequestItemInput[]
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const actorName = getActorName(session);
        const cleanedRegion = region.trim();

        if (!cleanedRegion) {
            return { success: false, message: "Please select a target region" };
        }

        if (!ensureRegionAccess(session, cleanedRegion)) {
            return { success: false, message: "Selected region is not assigned to your account" };
        }

        const validItems = items
            .map((item, index) => ({
                ...item,
                qty: normalizePositiveInt(item.qty),
                lineNo: index + 1,
                sourceWarehouse: item.sourceWarehouse?.trim() || "NSTC",
            }))
            .filter((item) => item.qty !== null) as Array<BulkRequestItemInput & { qty: number; lineNo: number; sourceWarehouse: string }>;

        if (validItems.length === 0) {
            return { success: false, message: "Add at least one valid line item" };
        }

        const duplicateKeys = new Set<string>();
        for (const item of validItems) {
            const duplicateKey = buildDuplicateKey([item.itemId || item.itemName, item.sourceWarehouse, cleanedRegion]);
            if (duplicateKeys.has(duplicateKey)) {
                return { success: false, message: `Duplicate line detected for ${item.itemName}` };
            }
            duplicateKeys.add(duplicateKey);
        }

        const result = await prisma.$transaction(async (tx) => {
            const bulkOperation = await createBulkOperationHeader(
                tx,
                "REQUEST",
                actorName,
                getActorUserId(session),
                null,
                {
                    requestedBy: actorName,
                    supervisorName: supervisorName || actorName,
                    targetRegion: cleanedRegion,
                    lineCount: validItems.length,
                }
            );

            let totalQuantity = 0;

            for (const item of validItems) {
                const inventoryItem = await resolveInventoryItemForWarehouse(tx, {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    location: item.sourceWarehouse,
                }) || await resolveInventoryItemForWarehouse(tx, {
                    itemId: item.itemId,
                    itemName: item.itemName,
                });

                if (!inventoryItem) {
                    throw new Error(`Item not found: ${item.itemName}`);
                }

                const request = await tx.request.create({
                    data: {
                        supervisorName: actorName,
                        region: item.targetRegion?.trim() || cleanedRegion,
                        itemName: inventoryItem.nameEn,
                        category: inventoryItem.category,
                        qty: item.qty,
                        unit: inventoryItem.unit || item.unit || "PCS",
                        status: "Pending",
                        notes: item.notes || null,
                        shiftId: session.user.shiftId ? Number(session.user.shiftId) : null,
                        shiftName: session.user.shiftName,
                    },
                });

                await tx.warehouseBulkOperationLine.create({
                    data: {
                        bulkOperationId: bulkOperation.id,
                        lineNo: item.lineNo,
                        entityType: "request",
                        entityId: request.reqId,
                        status: "Pending",
                        itemId: inventoryItem.id,
                        itemName: inventoryItem.nameEn,
                        itemCode: inventoryItem.itemCode,
                        category: inventoryItem.category,
                        unit: inventoryItem.unit,
                        quantity: item.qty,
                        availableQtySnapshot: inventoryItem.qty,
                        fromWarehouse: item.sourceWarehouse,
                        region: request.region,
                        notes: item.notes || null,
                        metadata: {
                            priority: item.priority || null,
                        },
                    },
                });

                totalQuantity += item.qty;
            }

            return tx.warehouseBulkOperation.update({
                where: { id: bulkOperation.id },
                data: {
                    status: "Submitted",
                    metadata: {
                        requestedBy: actorName,
                        supervisorName: supervisorName || actorName,
                        targetRegion: cleanedRegion,
                        lineCount: validItems.length,
                        totalQuantity,
                    },
                },
            });
        });

        await logAudit(actorName, "Create Bulk Request", `Created ${validItems.length} request lines under ${result.operationNo}`, "Warehouse");

        revalidateWarehouseData();
        return {
            success: true,
            message: `Submitted ${validItems.length} request lines successfully`,
            operationNo: result.operationNo,
        };
    } catch (error) {
        console.error("Create bulk request error:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to submit requests",
        };
    }
}

export async function updateRequestStatus(
    reqId: number,
    status: string,
    qty?: number,
    notes?: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const isApproval = status === "Approved";
        const isReviewDecision = status === "Approved" || status === "Rejected";

        await prisma.$transaction(async (tx) => {
            await tx.request.update({
                where: { reqId },
                data: {
                    status,
                    ...(isApproval && qty !== undefined && { qty }),
                    ...(notes !== undefined && { notes }),
                    ...(isReviewDecision && {
                        reviewedBy: session.user.name || session.user.username,
                        reviewedAt: new Date(),
                    }),
                    ...(isApproval && {
                        approvedBy: session.user.name || session.user.username,
                        approvedAt: new Date(),
                    }),
                },
            });

            if (isReviewDecision) {
                await tx.warehouseBulkOperationLine.updateMany({
                    where: {
                        entityType: "request",
                        entityId: reqId,
                    },
                    data: {
                        status,
                        ...(isApproval && qty !== undefined ? {
                            approvedQty: qty,
                            fulfilledQty: qty,
                        } : {}),
                        ...(notes !== undefined ? { notes } : {}),
                    },
                });
            }
        });

        await logAudit(session.user.name || session.user.username, "Update Request", `Updated Request #${reqId} status to ${status}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Request updated" };
    } catch (error) {
        console.error("Update request error:", error);
        return { success: false, message: "Failed to update request" };
    }
}

// Confirm receipt by supervisor - also updates local inventory
export async function confirmReceipt(reqId: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        // Get request details first
        const request = await prisma.request.findUnique({
            where: { reqId },
        });

        if (!request) {
            return { success: false, message: "Request not found" };
        }

        await prisma.$transaction(async (tx) => {
            // Get request details inside transaction for consistency
            const currentRequest = await tx.request.findUnique({
                where: { reqId },
            });

            if (!currentRequest) throw new Error("Request not found");
            if (currentRequest.status === "Received") throw new Error("Request already received");

            // Update request status
            await tx.request.update({
                where: { reqId },
                data: {
                    status: "Received",
                    receivedAt: new Date(),
                },
            });

            await tx.warehouseBulkOperationLine.updateMany({
                where: {
                    entityType: "request",
                    entityId: reqId,
                },
                data: {
                    status: "Received",
                    fulfilledQty: currentRequest.qty ?? undefined,
                },
            });

            // Add to local inventory
            if (request.region && request.itemName && request.qty) {
                // Upsert with atomic increment
                await tx.localInventory.upsert({
                    where: {
                        region_itemName: {
                            region: request.region,
                            itemName: request.itemName,
                        },
                    },
                    update: {
                        qty: { increment: request.qty },
                        lastUpdated: new Date(),
                        updatedBy: request.supervisorName || "System",
                    },
                    create: {
                        region: request.region,
                        itemName: request.itemName,
                        qty: request.qty,
                        lastUpdated: new Date(),
                        updatedBy: request.supervisorName || "System",
                    }
                });
            }
        });

        await logAudit(session.user.name || session.user.username, "Confirm Receipt", `Confirmed receipt of Request #${reqId}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Receipt confirmed and local inventory updated" };
    } catch (error) {
        console.error("Confirm receipt error:", error);
        return { success: false, message: "Failed to confirm receipt" };
    }
}

export async function issueRequest(
    reqId: number,
    itemName: string,
    issueQty: number,
    user: string,
    unit: string,
    region: string,
    notes?: string
) {
    return bulkIssueRequests(user, [{
        reqId,
        qty: issueQty,
        itemName,
        region,
        unit,
        notes: notes || null,
    }]);
}

export async function deleteRequest(reqId: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        await prisma.request.delete({ where: { reqId } });
        await logAudit(session.user.name || session.user.username, "Delete Request", `Deleted Request #${reqId}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: "Request deleted" };
    } catch (error) {
        console.error("Delete request error:", error);
        return { success: false, message: "Failed to delete request" };
    }
}

export async function updateBulkStock(
    location: string,
    items: { name: string; oldQty: number; newQty: number; unit: string }[],
    user: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const operations = items
            .filter((item) => item.oldQty !== item.newQty)
            .flatMap((item) => {
                const diff = item.newQty - item.oldQty;
                return [
                    prisma.inventory.updateMany({
                        where: { nameEn: item.name, location },
                        data: { qty: item.newQty, lastUpdated: new Date() },
                    }),
                    prisma.stockLog.create({
                        data: {
                            itemName: item.name,
                            location,
                            changeAmount: diff,
                            newQty: item.newQty,
                            actionBy: user,
                            actionType: "Stock Take",
                            unit: item.unit,
                        },
                    }),
                ];
            });

        if (operations.length > 0) {
            await prisma.$transaction(operations);
        }

        revalidateWarehouseData();
        return { success: true, message: `Updated ${items.filter((i) => i.oldQty !== i.newQty).length} items` };
    } catch (error) {
        console.error("Bulk stock update error:", error);
        return { success: false, message: "Failed to update stock" };
    }
}

// Update local inventory (manual stocktake for supervisors)
export async function updateLocalInventory(
    region: string,
    itemName: string,
    qty: number,
    updatedBy: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.localInventory.upsert({
            where: {
                region_itemName: {
                    region,
                    itemName,
                },
            },
            update: {
                qty,
                lastUpdated: new Date(),
                updatedBy,
            },
            create: {
                region,
                itemName,
                qty,
                lastUpdated: new Date(),
                updatedBy,
            },
        });

        revalidateWarehouseData();
        return { success: true, message: "Inventory updated" };
    } catch (error) {
        console.error("Update local inventory error:", error);
        return { success: false, message: "Failed to update inventory" };
    }
}

// Bulk update local inventory (stocktake)
export async function bulkUpdateLocalInventory(
    region: string,
    items: { itemName: string; qty: number }[],
    updatedBy: string
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const operations = items.map((item) =>
            prisma.localInventory.upsert({
                where: {
                    region_itemName: {
                        region,
                        itemName: item.itemName,
                    },
                },
                update: {
                    qty: item.qty,
                    lastUpdated: new Date(),
                    updatedBy,
                },
                create: {
                    region,
                    itemName: item.itemName,
                    qty: item.qty,
                    lastUpdated: new Date(),
                    updatedBy,
                },
            })
        );

        await prisma.$transaction(operations);

        revalidateWarehouseData();
        return { success: true, message: `Updated ${items.length} items` };
    } catch (error) {
        console.error("Bulk local inventory update error:", error);
        return { success: false, message: "Failed to update inventory" };
    }
}
// Bulk issue requests (Storekeeper)
export async function bulkIssueRequests(
    user: string,
    items: BulkIssueLineInput[]
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const actorName = getActorName(session) || user;
        const validItems = items
            .map((item) => ({
                ...item,
                qty: normalizePositiveInt(item.qty),
            }))
            .filter((item) => item.qty !== null) as Array<BulkIssueLineInput & { qty: number }>;

        if (validItems.length === 0) {
            return { success: false, message: "Select at least one valid approved line to dispatch" };
        }

        const duplicateKeys = new Set<number>();
        for (const item of validItems) {
            if (duplicateKeys.has(item.reqId)) {
                return { success: false, message: `Request #${item.reqId} is duplicated in the dispatch list` };
            }
            duplicateKeys.add(item.reqId);
        }

        const result = await prisma.$transaction(async (tx) => {
            const bulkOperation = await createBulkOperationHeader(
                tx,
                "ISSUE",
                actorName,
                getActorUserId(session),
                null,
                {
                    issuedBy: actorName,
                    lineCount: validItems.length,
                }
            );

            let totalIssued = 0;

            for (const [index, item] of validItems.entries()) {
                const lineResult = await executeIssueLine(tx, {
                    reqId: item.reqId,
                    qty: item.qty,
                    itemName: item.itemName,
                    region: item.region,
                    user: actorName,
                    unit: item.unit,
                    notes: item.notes || null,
                });

                await tx.warehouseBulkOperationLine.create({
                    data: {
                        bulkOperationId: bulkOperation.id,
                        lineNo: index + 1,
                        entityType: "request",
                        entityId: item.reqId,
                        status: "Issued",
                        itemName: item.itemName,
                        category: lineResult.request.category,
                        unit: item.unit,
                        quantity: item.qty,
                        approvedQty: lineResult.request.qty,
                        fulfilledQty: item.qty,
                        availableQtySnapshot: lineResult.availableQtySnapshot,
                        fromWarehouse: "NSTC",
                        region: item.region,
                        notes: item.notes || null,
                    },
                });

                await tx.warehouseBulkOperationLine.updateMany({
                    where: {
                        entityType: "request",
                        entityId: item.reqId,
                        bulkOperation: {
                            is: {
                                operationType: "REQUEST",
                            },
                        },
                    },
                    data: {
                        status: "Issued",
                        fulfilledQty: item.qty,
                    },
                });

                totalIssued += item.qty;
            }

            return tx.warehouseBulkOperation.update({
                where: { id: bulkOperation.id },
                data: {
                    status: "Completed",
                    metadata: {
                        issuedBy: actorName,
                        lineCount: validItems.length,
                        totalIssued,
                    },
                },
            });
        });

        await logAudit(actorName, "Bulk Dispatch", `Issued ${validItems.length} approved lines under ${result.operationNo}`, "Warehouse");
        revalidateWarehouseData();
        return { success: true, message: `Successfully issued ${validItems.length} requests`, operationNo: result.operationNo };
    } catch (error) {
        console.error("Bulk issue error:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to issue requests",
        };
    }
}

// Bulk confirm receipt (Supervisor)
export async function bulkConfirmReceipt(reqIds: number[]) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Get all requests
            const requests = await tx.request.findMany({
                where: { reqId: { in: reqIds } },
            });

            for (const request of requests) {
                // Update request status
                await tx.request.update({
                    where: { reqId: request.reqId },
                    data: {
                        status: "Received",
                        receivedAt: new Date(),
                    },
                });

                await tx.warehouseBulkOperationLine.updateMany({
                    where: {
                        entityType: "request",
                        entityId: request.reqId,
                    },
                    data: {
                        status: "Received",
                        fulfilledQty: request.qty ?? undefined,
                    },
                });

                // Add to local inventory using Atomic Upsert
                if (request.region && request.itemName && request.qty) {
                    await tx.localInventory.upsert({
                        where: {
                            region_itemName: {
                                region: request.region,
                                itemName: request.itemName,
                            },
                        },
                        update: {
                            qty: { increment: request.qty },
                            lastUpdated: new Date(),
                            updatedBy: request.supervisorName || "System",
                        },
                        create: {
                            region: request.region,
                            itemName: request.itemName,
                            qty: request.qty,
                            lastUpdated: new Date(),
                            updatedBy: request.supervisorName || "System",
                        }
                    });
                }
            }
        });

        revalidateWarehouseData();
        return { success: true, message: `Successfully confirmed ${reqIds.length} items` };
    } catch (error) {
        console.error("Bulk confirm receipt error:", error);
        return { success: false, message: "Failed to confirm receipts" };
    }
}

// Bulk Approve Requests (Manager)
export async function bulkApproveRequests(reqIds: number[]) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.request.updateMany({
                where: { reqId: { in: reqIds }, status: "Pending" },
                data: {
                    status: "Approved",
                    reviewedBy: session.user.name,
                    reviewedAt: new Date(),
                    approvedBy: session.user.name,
                    approvedAt: new Date()
                },
            });

            await tx.warehouseBulkOperationLine.updateMany({
                where: {
                    entityType: "request",
                    entityId: { in: reqIds },
                },
                data: {
                    status: "Approved",
                },
            });
        });

        revalidateWarehouseData();
        return { success: true, message: `Approved ${reqIds.length} requests` };
    } catch (error) {
        console.error("Bulk approve error:", error);
        return { success: false, message: "Failed to approve requests" };
    }
}

// Bulk Reject Requests (Manager)
export async function bulkRejectRequests(reqIds: number[], reason?: string) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.request.updateMany({
                where: { reqId: { in: reqIds }, status: "Pending" },
                data: {
                    status: "Rejected",
                    reviewedBy: session.user.name,
                    reviewedAt: new Date(),
                    notes: reason || "Rejected by Manager"
                },
            });

            await tx.warehouseBulkOperationLine.updateMany({
                where: {
                    entityType: "request",
                    entityId: { in: reqIds },
                },
                data: {
                    status: "Rejected",
                    notes: reason || "Rejected by Manager",
                },
            });
        });

        revalidateWarehouseData();
        return { success: true, message: `Rejected ${reqIds.length} requests` };
    } catch (error) {
        console.error("Bulk reject error:", error);
        return { success: false, message: "Failed to reject requests" };
    }
}

// Update Request (Supervisor Edit)
export async function updateRequest(
    reqId: number,
    data: {
        itemName?: string;
        category?: string;
        qty?: number;
        unit?: string;
        notes?: string;
    }
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) { // Only manager for now or supervisor pending? Let's say manager.
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.request.update({
            where: { reqId },
            data,
        });

        revalidateWarehouseData();
        return { success: true, message: "Request updated successfully" };
    } catch (error) {
        console.error("Update request error:", error);
        return { success: false, message: "Failed to update request" };
    }
}
