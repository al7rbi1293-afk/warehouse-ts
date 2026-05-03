import { PrismaClient } from "@prisma/client";
import { validateDatabaseRuntimeEnv } from "@/lib/server-env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const isProduction = process.env.NODE_ENV === "production";

validateDatabaseRuntimeEnv();

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        // Avoid verbose SQL logging in production while keeping actionable diagnostics.
        log: isProduction ? ["warn"] : ["query", "warn", "error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
