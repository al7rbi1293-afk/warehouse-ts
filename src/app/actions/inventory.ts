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
            return { success: false, message: "هذا العنصر موجود بالفعل في هذا الموقع" };
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
        return { success: true, message: "تم إضافة العنصر بنجاح" };
    } catch (error) {
        console.error("Add inventory error:", error);
        return { success: false, message: "فشل في إضافة العنصر" };
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
            return { success: false, message: "العنصر غير موجود" };
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
        return { success: true, message: "تم تحديث العنصر بنجاح" };
    } catch (error) {
        console.error("Update inventory error:", error);
        return { success: false, message: "فشل في تحديث العنصر" };
    }
}

// Delete inventory item
export async function deleteInventoryItem(id: number) {
    try {
        const item = await prisma.inventory.findUnique({ where: { id } });
        if (!item) {
            return { success: false, message: "العنصر غير موجود" };
        }

        await prisma.inventory.delete({ where: { id } });

        revalidatePath("/warehouse");
        return { success: true, message: "تم حذف العنصر بنجاح" };
    } catch (error) {
        console.error("Delete inventory error:", error);
        return { success: false, message: "فشل في حذف العنصر" };
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
            return { success: false, message: "لا توجد عناصر للطلب" };
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
        return { success: true, message: `تم إرسال ${validItems.length} طلب بنجاح` };
    } catch (error) {
        console.error("Create bulk request error:", error);
        return { success: false, message: "فشل في إرسال الطلبات" };
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

// Confirm receipt by supervisor
export async function confirmReceipt(reqId: number) {
    try {
        await prisma.request.update({
            where: { reqId },
            data: {
                status: "Received",
            },
        });

        revalidatePath("/warehouse");
        return { success: true, message: "تم تأكيد الاستلام بنجاح" };
    } catch (error) {
        console.error("Confirm receipt error:", error);
        return { success: false, message: "فشل في تأكيد الاستلام" };
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
