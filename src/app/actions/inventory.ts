"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

        const newQty = item.qty + change;

        await prisma.$transaction([
            prisma.inventory.update({
                where: { id: item.id },
                data: { qty: newQty, lastUpdated: new Date() },
            }),
            prisma.stockLog.create({
                data: {
                    itemName,
                    location,
                    changeAmount: change,
                    newQty,
                    actionBy: user,
                    actionType,
                    unit,
                },
            }),
        ]);

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

        // Ensure we are taking from the correct location
        if (item.location !== fromLocation) {
            // If the ID passed is for an item in a different location, try to find the item in the fromLocation
            const correctItem = await prisma.inventory.findFirst({
                where: { nameEn: item.nameEn, location: fromLocation }
            });

            if (!correctItem) {
                return { success: false, message: `Item not found in ${fromLocation}` };
            }
            // Use the correct item ID for deduction
            return transferStock(correctItem.id, qty, fromLocation, toLocation, user, unit, notes);
        }

        if (item.qty < qty) {
            return { success: false, message: `Insufficient stock in ${fromLocation}` };
        }

        await prisma.$transaction(async (tx) => {
            // Deduct from success
            await tx.inventory.update({
                where: { id: item.id },
                data: { qty: item.qty - qty, lastUpdated: new Date() },
            });

            await tx.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: fromLocation,
                    changeAmount: -qty,
                    newQty: item.qty - qty,
                    actionBy: user,
                    actionType: `Transfer Out to ${toLocation}${notes ? ` - ${notes}` : ''}`,
                    unit,
                },
            });

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

            await tx.inventory.update({
                where: { id: destItem.id },
                data: { qty: destItem.qty + qty, lastUpdated: new Date() },
            });

            await tx.stockLog.create({
                data: {
                    itemName: item.nameEn,
                    location: toLocation,
                    changeAmount: qty,
                    newQty: destItem.qty + qty,
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
        return { success: false, message: "Transfer failed" };
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

        if (item.qty < qty) {
            return { success: false, message: "Insufficient stock" };
        }

        await prisma.$transaction(async (tx) => {
            await tx.inventory.update({
                where: { id: itemId },
                data: { qty: item.qty - qty, lastUpdated: new Date() },
            });

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
        return { success: false, message: "Lend operation failed" };
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
                data: { qty: item.qty + qty, lastUpdated: new Date() },
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
            // Update request status
            await tx.request.update({
                where: { reqId },
                data: { status: "Received" },
            });

            // Add to local inventory
            if (request.region && request.itemName && request.qty) {
                const existingLocal = await tx.localInventory.findUnique({
                    where: {
                        region_itemName: {
                            region: request.region,
                            itemName: request.itemName,
                        },
                    },
                });

                if (existingLocal) {
                    // Update existing
                    await tx.localInventory.update({
                        where: {
                            region_itemName: {
                                region: request.region,
                                itemName: request.itemName,
                            },
                        },
                        data: {
                            qty: (existingLocal.qty || 0) + request.qty,
                            lastUpdated: new Date(),
                            updatedBy: request.supervisorName || "System",
                        },
                    });
                } else {
                    // Create new
                    await tx.localInventory.create({
                        data: {
                            region: request.region,
                            itemName: request.itemName,
                            qty: request.qty,
                            lastUpdated: new Date(),
                            updatedBy: request.supervisorName || "System",
                        },
                    });
                }
            }
        });

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
            // Deduct from NSTC inventory
            const item = await tx.inventory.findFirst({
                where: { nameEn: itemName, location: "NSTC" },
            });

            if (!item || item.qty < issueQty) {
                throw new Error("Insufficient stock");
            }

            await tx.inventory.update({
                where: { id: item.id },
                data: { qty: item.qty - issueQty, lastUpdated: new Date() },
            });

            // Log the issue
            await tx.stockLog.create({
                data: {
                    itemName,
                    location: "NSTC",
                    changeAmount: -issueQty,
                    newQty: item.qty - issueQty,
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

        revalidatePath("/warehouse");
        return { success: true, message: "Item issued" };
    } catch (error) {
        console.error("Issue request error:", error);
        return { success: false, message: "Failed to issue item" };
    }
}

export async function deleteRequest(reqId: number) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized: Managers only" };
    }

    try {
        await prisma.request.delete({ where: { reqId } });
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
            const inventoryItem = await prisma.inventory.findFirst({
                where: { nameEn: item.itemName, location: "NSTC" },
            });

            if (inventoryItem) {
                // Deduct from inventory
                operations.push(
                    prisma.inventory.update({
                        where: { id: inventoryItem.id },
                        data: {
                            qty: inventoryItem.qty - item.qty,
                            lastUpdated: new Date(),
                        },
                    })
                );

                // Log the issue
                operations.push(
                    prisma.stockLog.create({
                        data: {
                            itemName: item.itemName,
                            location: "NSTC",
                            changeAmount: -item.qty,
                            newQty: inventoryItem.qty - item.qty,
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
                            qty: item.qty, // Ensure qty reflects what was actually issued
                        },
                    })
                );
            }
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

                // Add to local inventory
                if (request.region && request.itemName && request.qty) {
                    const existingLocal = await tx.localInventory.findUnique({
                        where: {
                            region_itemName: {
                                region: request.region,
                                itemName: request.itemName,
                            },
                        },
                    });

                    if (existingLocal) {
                        // Update existing
                        await tx.localInventory.update({
                            where: {
                                region_itemName: {
                                    region: request.region,
                                    itemName: request.itemName,
                                },
                            },
                            data: {
                                qty: (existingLocal.qty || 0) + request.qty,
                                lastUpdated: new Date(),
                                updatedBy: request.supervisorName || "System",
                            },
                        });
                    } else {
                        // Create new
                        await tx.localInventory.create({
                            data: {
                                region: request.region,
                                itemName: request.itemName,
                                qty: request.qty,
                                lastUpdated: new Date(),
                                updatedBy: request.supervisorName || "System",
                            },
                        });
                    }
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
            data: { status: "Approved" },
        });

        revalidatePath("/warehouse");
        return { success: true, message: `Approved ${reqIds.length} requests` };
    } catch (error) {
        console.error("Bulk approve error:", error);
        return { success: false, message: "Failed to approve requests" };
    }
}

// Bulk Reject Requests (Manager)
export async function bulkRejectRequests(reqIds: number[]) {
    const session = await getServerSession(authOptions);
    if (!session || !['manager'].includes(session.user.role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.request.updateMany({
            where: { reqId: { in: reqIds }, status: "Pending" },
            data: { status: "Rejected" },
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
