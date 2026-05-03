import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const isProduction = process.env.NODE_ENV === "production";
const runtimeDatasourceUrl =
  process.env.SUPABASE_POOLER_URL?.trim() || undefined;

const runtimeUsesSupabasePooler =
  typeof runtimeDatasourceUrl === "string" &&
  runtimeDatasourceUrl.includes("pooler.supabase.com");

if (
  runtimeUsesSupabasePooler &&
  !/[?&]sslmode=require(?:&|$)/i.test(runtimeDatasourceUrl)
) {
  console.warn(
    "[db] SUPABASE_POOLER_URL is configured without sslmode=require. Update the runtime pooler URL in Vercel."
  );
}

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        ...(runtimeDatasourceUrl ? { datasourceUrl: runtimeDatasourceUrl } : {}),
        // Avoid verbose SQL logging in production while keeping actionable diagnostics.
        log: isProduction ? ["warn", "error"] : ["query", "warn", "error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
