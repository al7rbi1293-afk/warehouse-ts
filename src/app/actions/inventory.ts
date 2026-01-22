"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createInventoryItem(formData: FormData) {
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
    itemName: string,
    qty: number,
    user: string,
    unit: string
) {
    try {
        // Get SNC item
        const sncItem = await prisma.inventory.findFirst({
            where: { nameEn: itemName, location: "SNC" },
        });

        if (!sncItem || sncItem.qty < qty) {
            return { success: false, message: "Insufficient stock in SNC" };
        }

        // Check if NSTC item exists
        let nstcItem = await prisma.inventory.findFirst({
            where: { nameEn: itemName, location: "NSTC" },
        });

        await prisma.$transaction(async (tx) => {
            // Decrease SNC
            await tx.inventory.update({
                where: { id: sncItem.id },
                data: { qty: sncItem.qty - qty, lastUpdated: new Date() },
            });

            // Log SNC decrease
            await tx.stockLog.create({
                data: {
                    itemName,
                    location: "SNC",
                    changeAmount: -qty,
                    newQty: sncItem.qty - qty,
                    actionBy: user,
                    actionType: "Transfer Out",
                    unit,
                },
            });

            // Create or update NSTC
            if (!nstcItem) {
                nstcItem = await tx.inventory.create({
                    data: {
                        nameEn: itemName,
                        category: "Transferred",
                        unit,
                        qty: 0,
                        location: "NSTC",
                        status: "Available",
                    },
                });
            }

            await tx.inventory.update({
                where: { id: nstcItem.id },
                data: { qty: nstcItem.qty + qty, lastUpdated: new Date() },
            });

            // Log NSTC increase
            await tx.stockLog.create({
                data: {
                    itemName,
                    location: "NSTC",
                    changeAmount: qty,
                    newQty: nstcItem.qty + qty,
                    actionBy: user,
                    actionType: "Transfer In",
                    unit,
                },
            });
        });

        revalidatePath("/warehouse");
        return { success: true, message: "Transfer completed" };
    } catch (error) {
        console.error("Transfer stock error:", error);
        return { success: false, message: "Transfer failed" };
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
    try {
        // Verify request is still pending
        const request = await prisma.request.findUnique({
            where: { reqId },
        });

        if (!request || request.status !== "Pending") {
            return { success: false, message: "Cannot edit request. It may have been processed already." };
        }

        await prisma.request.update({
            where: { reqId },
            data: {
                ...data,
                // Ensure status remains Pending slightly redundant but safe
            },
        });

        revalidatePath("/warehouse");
        return { success: true, message: "Request updated successfully" };
    } catch (error) {
        console.error("Update request error:", error);
        return { success: false, message: "Failed to update request" };
    }
}
