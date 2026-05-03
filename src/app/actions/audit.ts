"use server";

import { prisma } from "@/lib/prisma";
import { logSanitizedDatabaseError } from "@/lib/database-health";

export async function logAudit(
    userName: string,
    action: string,
    details: string,
    module: string
) {
    try {
        await prisma.auditLog.create({
            data: {
                userName,
                action,
                details,
                module,
                timestamp: new Date(),
            },
        });
    } catch (error: unknown) {
        logSanitizedDatabaseError("audit create-log", error);
        // Don't throw, just log error so main action doesn't fail
    }
}
