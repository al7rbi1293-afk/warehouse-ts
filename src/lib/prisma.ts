import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const isProduction = process.env.NODE_ENV === "production";

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        // Avoid verbose SQL logging in production while keeping actionable diagnostics.
        log: isProduction ? ["warn", "error"] : ["query", "warn", "error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
