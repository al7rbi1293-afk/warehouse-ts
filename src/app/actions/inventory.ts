"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/app/actions/audit";

export async function createInventoryItem(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    const nameEn = formData.get("nameEn") as string;
    const category = formData.get("category") as string;
    const unit = formData.get("unit") as string;
    const qty = parseInt(formData.get("qty") as string);
    const location = formData.get("location") as string;

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
                category,
                unit,
                qty,
                location,
                status: "Available",
            },
        });

        await logAudit(session.user.name || session.user.username, "Create Item", `Created item ${nameEn} in ${location}`, "Warehouse");
        revalidatePath("/warehouse");
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
    location: string
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
                category,
                unit,
                qty,
                location,
                status: "Available",
            },
        });

        revalidatePath("/warehouse");
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
        revalidatePath("/warehouse");
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
        revalidatePath("/warehouse");
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

        revalidatePath("/warehouse");
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

    if (fromLocation === toLocation) {
        return { success: false, message: "Source and destination must be different" };
    }

    try {
        const item = await prisma.inventory.findUnique({ where: { id: itemId } });
        if (!item) return { success: false, message: "Item not found" };

        // Special handling for CWW: Treat as infinite source
        const isCWW = fromLocation === "CWW";

        // Ensure we are taking from the correct location
        if (!isCWW && item.location !== fromLocation) {
            const correctItem = await prisma.inventory.findFirst({
                where: { nameEn: item.nameEn, location: fromLocation }
            });

            if (!correctItem) {
                return { success: false, message: `Item not found in ${fromLocation}` };
            }
            return transferStock(correctItem.id, qty, fromLocation, toLocation, user, unit, notes);
        }

        await prisma.$transaction(async (tx) => {
            // Deduct from source (Only if NOT CWW)
            if (!isCWW) {
                // Atomic Update with Check
                const result = await tx.inventory.updateMany({
                    where: {
                        id: item.id,
                        qty: { gte: qty } // Condition: Ensure enough stock
                    },
                    data: {
                        qty: { decrement: qty },
                        lastUpdated: new Date()
                    },
                });

                if (result.count === 0) {
                    throw new Error(`Insufficient stock in ${fromLocation}`);
                }

                await tx.stockLog.create({
                    data: {
                        itemName: item.nameEn,
                        location: fromLocation,
                        changeAmount: -qty,
                        newQty: item.qty - qty, // logging previous snapshot - qty
                        actionBy: user,
                        actionType: `Transfer Out to ${toLocation}${notes ? ` - ${notes}` : ''}`,
                        unit,
                    },
                });
            }

            // Add to destination
            let destItem = await tx.inventory.findFirst({
                where: { nameEn: item.nameEn, location: toLocation },
            });

            if (!destItem) {
                destItem = await tx.inventory.create({
                    data: {
                        nameEn: item.nameEn,
                        category: item.category,
                        unit: item.unit,
                        qty: 0,
                        location: toLocation,
                        status: "Available",
                    },
                });
            }

            // Atomic Increment
            await tx.inventory.update({
                where: { id: destItem.id },
                data: {
                    qty: { increment: qty },
                    lastUpdated: new Date()
                },
            });

            await tx.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: toLocation,
                    changeAmount: qty,
                    newQty: (destItem.qty || 0) + qty,
                    actionBy: user,
                    actionType: `Transfer In from ${fromLocation}`,
                    unit,
                },
            });
        });

        revalidatePath("/warehouse");
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
        const item = await prisma.inventory.findUnique({ where: { id: itemId } });
        if (!item) return { success: false, message: "Item not found" };

        await prisma.$transaction(async (tx) => {
            // Atomic Update with Check
            const result = await tx.inventory.updateMany({
                where: {
                    id: itemId,
                    qty: { gte: qty } // Condition
                },
                data: {
                    qty: { decrement: qty },
                    lastUpdated: new Date()
                },
            });

            if (result.count === 0) {
                throw new Error("Insufficient stock");
            }

            await tx.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: item.location,
                    changeAmount: -qty,
                    newQty: item.qty - qty,
                    actionBy: user,
                    actionType: `Lent to ${projectName}${notes ? ` - ${notes}` : ''}`,
                    unit,
                },
            });
        });

        revalidatePath("/warehouse");
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
        // Find item in the specified warehouse
        // If itemId is passed, check if it matches location. If not, find by name.
        let item = await prisma.inventory.findUnique({ where: { id: itemId } });

        if (!item || item.location !== location) {
            // Try to find by name if we have the item object or just fail
            // Ideally we should pass relevant info. For now, let's assume the UI sends the correct item ID for the location
            // Or simpler: The UI sends the item ID selected. We check if it matches the location.
            // If the user selected an item from NSTC but says returning to SNC, we need to find the equivalent item in SNC.

            if (item) {
                const targetItem = await prisma.inventory.findFirst({
                    where: { nameEn: item.nameEn, location: location }
                });
                if (targetItem) {
                    item = targetItem;
                } else {
                    // Create if not exists? Usually returns imply item exists, but maybe we are creating new stock from return?
                    // Let's create if not exists
                    const newItem = await prisma.inventory.create({
                        data: {
                            nameEn: item.nameEn,
                            category: item.category,
                            unit: item.unit,
                            qty: 0,
                            location: location,
                            status: "Available",
                        }
                    });
                    item = newItem;
                }
            } else {
                return { success: false, message: "Item reference not found" };
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.inventory.update({
                where: { id: item.id },
                data: {
                    qty: { increment: qty },
                    lastUpdated: new Date()
                },
            });

            await tx.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: location,
                    changeAmount: qty,
                    newQty: item.qty + qty,
                    actionBy: user,
                    actionType: `Returned from ${projectName}${notes ? ` - ${notes}` : ''}`,
                    unit,
                },
            });
        });

        revalidatePath("/warehouse");
        return { success: true, message: `Successfully returned from ${projectName}` };
    } catch (error) {
        console.error("Return error:", error);
        return { success: false, message: "Return operation failed" };
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
        revalidatePath("/warehouse");
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
    items: { itemName: string; category: string; qty: number; unit: string }[]
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'supervisor'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const validItems = items.filter((item) => item.qty > 0);

        if (validItems.length === 0) {
            return { success: false, message: "No items to request" };
        }

        await prisma.$transaction(
            validItems.map((item) =>
                prisma.request.create({
                    data: {
                        supervisorName,
                        region,
                        itemName: item.itemName,
                        category: item.category,
                        qty: item.qty,
                        unit: item.unit,
                        status: "Pending",
                        shiftId: session.user.shiftId ? Number(session.user.shiftId) : null,
                        shiftName: session.user.shiftName,
                    },
                })
            )
        );

        revalidatePath("/warehouse");
        return { success: true, message: `Submitted ${validItems.length} requests successfully` };
    } catch (error) {
        console.error("Create bulk request error:", error);
        return { success: false, message: "Failed to submit requests" };
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
        await prisma.request.update({
            where: { reqId },
            data: {
                status,
                ...(qty !== undefined && { qty }),
                ...(notes !== undefined && { notes }),
            },
        });

        await logAudit(session.user.name || session.user.username, "Update Request", `Updated Request #${reqId} status to ${status}`, "Warehouse");
        revalidatePath("/warehouse");
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
                data: { status: "Received" },
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
        revalidatePath("/warehouse");
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
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Atomic update to deduct stock if available
            const result = await tx.inventory.updateMany({
                where: {
                    nameEn: itemName,
                    location: "NSTC",
                    qty: { gte: issueQty }
                },
                data: {
                    qty: { decrement: issueQty },
                    lastUpdated: new Date()
                },
            });

            if (result.count === 0) {
                const current = await tx.inventory.findFirst({ where: { nameEn: itemName, location: "NSTC" } });
                throw new Error(`Insufficient stock. Available: ${current?.qty || 0}`);
            }

            // We need the item ID for logging? Actually we just need name usually.
            // If we need ID we'd have to fetch, but we already updated by name.
            // Let's refetch to get accurate ID/NewQty for logging if strictly needed, 
            // or just log what we know.

            // Log the issue
            await tx.stockLog.create({
                data: {
                    itemName,
                    location: "NSTC",
                    changeAmount: -issueQty,
                    newQty: 0, // Placeholder or we fetch above
                    actionBy: user,
                    actionType: `Issued ${region}`,
                    unit,
                },
            });

            // Update request status
            await tx.request.update({
                where: { reqId },
                data: {
                    status: "Issued",
                    qty: issueQty,
                    notes: notes || undefined,
                    issuedBy: user,
                    issuedAt: new Date(),
                },
            });
        });

        await logAudit(user, "Issue Request", `Issued ${itemName} to ${region} (${issueQty} ${unit})`, "Warehouse");
        revalidatePath("/warehouse");
        return { success: true, message: "Item issued" };
    } catch (error) {
        console.error("Issue request error:", error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { success: false, message: (error as any).message || "Failed to issue item" };
    }
}

export async function deleteRequest(reqId: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        await prisma.request.delete({ where: { reqId } });
        await logAudit(session.user.name || session.user.username, "Delete Request", `Deleted Request #${reqId}`, "Warehouse");
        revalidatePath("/warehouse");
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

        revalidatePath("/warehouse");
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

        revalidatePath("/warehouse");
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

        revalidatePath("/warehouse");
        return { success: true, message: `Updated ${items.length} items` };
    } catch (error) {
        console.error("Bulk local inventory update error:", error);
        return { success: false, message: "Failed to update inventory" };
    }
}
// Bulk issue requests (Storekeeper)
export async function bulkIssueRequests(
    user: string,
    items: { reqId: number; qty: number; itemName: string; region: string; unit: string }[]
) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager', 'storekeeper'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        const operations = [];

        // Check stock for all items first
        for (const item of items) {
            const inventoryItem = await prisma.inventory.findFirst({
                where: { nameEn: item.itemName, location: "NSTC" },
            });

            if (!inventoryItem || inventoryItem.qty < item.qty) {
                return {
                    success: false,
                    message: `Insufficient stock for ${item.itemName}. Available: ${inventoryItem?.qty || 0}`,
                };
            }
        }

        // Prepare operations
        for (const item of items) {
            // Check request status first
            const currentRequest = await prisma.request.findUnique({
                where: { reqId: item.reqId },
                select: { status: true }
            });

            if (!currentRequest) throw new Error(`Request #${item.reqId} not found`);
            if (currentRequest.status !== "Pending") {
                throw new Error(`Request #${item.reqId} is already ${currentRequest.status}`);
            }

            // Atomic Update with Check
            const result = await prisma.inventory.updateMany({
                where: {
                    nameEn: item.itemName,
                    location: "NSTC",
                    qty: { gte: item.qty }
                },
                data: {
                    qty: { decrement: item.qty },
                    lastUpdated: new Date()
                },
            });

            if (result.count === 0) {
                throw new Error(`Insufficient stock for ${item.itemName}`);
            }

            // Log the issue
            operations.push(
                prisma.stockLog.create({
                    data: {
                        itemName: item.itemName,
                        location: "NSTC",
                        changeAmount: -item.qty,
                        newQty: 0, // Not fetching for perf
                        actionBy: user,
                        actionType: `Issued ${item.region}`,
                        unit: item.unit,
                    },
                })
            );

            // Update Request Status
            operations.push(
                prisma.request.update({
                    where: { reqId: item.reqId },
                    data: {
                        status: "Issued",
                        qty: item.qty,
                    },
                })
            );
        }

        await prisma.$transaction(operations);

        revalidatePath("/warehouse");
        return { success: true, message: `Successfully issued ${items.length} requests` };
    } catch (error) {
        console.error("Bulk issue error:", error);
        return { success: false, message: "Failed to issue requests" };
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
                    data: { status: "Received" },
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

        revalidatePath("/warehouse");
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
        await prisma.request.updateMany({
            where: { reqId: { in: reqIds }, status: "Pending" },
            data: {
                status: "Approved",
                approvedBy: session.user.name,
                approvedAt: new Date()
            },
        });

        revalidatePath("/warehouse");
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
        await prisma.request.updateMany({
            where: { reqId: { in: reqIds }, status: "Pending" },
            data: {
                status: "Rejected",
                notes: reason || "Rejected by Manager"
            },
        });

        revalidatePath("/warehouse");
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

        revalidatePath("/warehouse");
        return { success: true, message: "Request updated successfully" };
    } catch (error) {
        console.error("Update request error:", error);
        return { success: false, message: "Failed to update request" };
    }
}
