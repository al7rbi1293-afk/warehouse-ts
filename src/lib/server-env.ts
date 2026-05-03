type DatabaseUrlInspection = {
  hostname: string;
  port: string;
  isSupabasePooler: boolean;
  isSupabaseDirect: boolean;
  sslmode: string | null;
};

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function readRequiredEnv(key: string, context: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `[env:${context}] Missing required server environment variable: ${key}`
    );
  }

  return value;
}

function inspectDatabaseUrl(value: string): DatabaseUrlInspection {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("[env:database] DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      "[env:database] DATABASE_URL must use the postgresql:// protocol"
    );
  }

  return {
    hostname: parsed.hostname,
    port: parsed.port,
    isSupabasePooler: parsed.hostname.includes("pooler.supabase.com"),
    isSupabaseDirect:
      parsed.hostname.startsWith("db.") &&
      parsed.hostname.endsWith(".supabase.co"),
    sslmode: parsed.searchParams.get("sslmode"),
  };
}

export function validateDatabaseRuntimeEnv() {
  const databaseUrl = readRequiredEnv("DATABASE_URL", "database-runtime");
  const inspection = inspectDatabaseUrl(databaseUrl);

  if (
    (inspection.isSupabasePooler || inspection.isSupabaseDirect) &&
    inspection.sslmode !== "require"
  ) {
    console.warn(
      "[env:database] DATABASE_URL targets Supabase without sslmode=require. Update the Vercel environment value."
    );
  }

  if (inspection.isSupabasePooler && inspection.port !== "6543") {
    console.warn(
      "[env:database] DATABASE_URL targets the Supabase pooler but does not use port 6543."
    );
  }

  if (inspection.isSupabaseDirect && inspection.port && inspection.port !== "5432") {
    console.warn(
      "[env:database] DATABASE_URL targets the direct Supabase host but does not use port 5432."
    );
  }
}
