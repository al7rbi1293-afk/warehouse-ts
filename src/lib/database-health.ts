import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const GENERIC_DASHBOARD_DATA_ERROR =
  "Unable to load live KPI data. Please try again later.";

export type DatabaseHealthStatus = {
  status: "ok" | "error";
  reason?: string;
};

type SanitizedDatabaseError = {
  reason: string;
  code?: string;
};

export function sanitizeDatabaseError(error: unknown): SanitizedDatabaseError {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    const message = error.message.toLowerCase();

    if (message.includes("can't reach database server")) {
      return { reason: "database_unreachable", code: "P1001" };
    }

    if (message.includes("authentication failed")) {
      return { reason: "database_auth_failed", code: "P1000" };
    }

    if (message.includes("timed out")) {
      return { reason: "database_timeout", code: "P1008" };
    }

    return {
      reason: "database_initialization_failed",
      code: error.errorCode,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1001") {
      return { reason: "database_unreachable", code: error.code };
    }

    if (error.code === "P1000") {
      return { reason: "database_auth_failed", code: error.code };
    }

    if (error.code === "P1008") {
      return { reason: "database_timeout", code: error.code };
    }

    return { reason: "database_query_failed", code: error.code };
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return { reason: "database_engine_error" };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("can't reach database server")) {
      return { reason: "database_unreachable", code: "P1001" };
    }

    if (message.includes("authentication failed")) {
      return { reason: "database_auth_failed", code: "P1000" };
    }

    if (message.includes("timed out")) {
      return { reason: "database_timeout", code: "P1008" };
    }
  }

  return { reason: "database_error" };
}

export function logSanitizedDatabaseError(context: string, error: unknown) {
  const sanitized = sanitizeDatabaseError(error);

  console.error(`[db] ${context}`, sanitized);

  return sanitized;
}

export async function getDatabaseHealth(): Promise<DatabaseHealthStatus> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { status: "ok" };
  } catch (error: unknown) {
    const sanitized = logSanitizedDatabaseError("healthcheck failed", error);
    return {
      status: "error",
      reason: sanitized.reason,
    };
  }
}
