import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const shouldVerify =
  process.env.VERCEL === "1" || process.env.REQUIRE_DB_VERIFY === "1";
const schemaText = readFileSync("prisma/schema.prisma", "utf8");
const schemaRequiresDirectUrl = /directUrl\s*=\s*env\("DIRECT_URL"\)/.test(
  schemaText
);
const verificationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!shouldVerify) {
  console.log(
    "[db:verify] Skipped (set REQUIRE_DB_VERIFY=1 to enforce outside Vercel)."
  );
  process.exit(0);
}

if (!verificationUrl) {
  console.error(
    "[db:verify] DIRECT_URL or DATABASE_URL is required. Refusing deployment without schema verification."
  );
  process.exit(1);
}

if (schemaRequiresDirectUrl && !process.env.DIRECT_URL) {
  console.error(
    "[db:verify] DIRECT_URL is required because prisma/schema.prisma defines directUrl = env(\"DIRECT_URL\"). Set it to the direct Supabase database URL on port 5432."
  );
  process.exit(1);
}

let verificationUrlDetails = {
  host: "",
  sslmode: "",
  isSupabase: false,
};
try {
  const parsed = new URL(verificationUrl);
  verificationUrlDetails = {
    host: parsed.hostname,
    sslmode: parsed.searchParams.get("sslmode") || "",
    isSupabase:
      parsed.hostname.includes("pooler.supabase.com") ||
      (parsed.hostname.startsWith("db.") &&
        parsed.hostname.endsWith(".supabase.co")),
  };
} catch {
  verificationUrlDetails = {
    host: "",
    sslmode: "",
    isSupabase: false,
  };
}

if (!process.env.DIRECT_URL && verificationUrlDetails.host.includes("pooler.supabase.com")) {
  console.error(
    "[db:verify] DIRECT_URL is missing while DATABASE_URL points to the Supabase pooler. Set DIRECT_URL to the direct database connection (port 5432) for Prisma schema verification."
  );
  process.exit(1);
}

if (verificationUrlDetails.isSupabase && verificationUrlDetails.sslmode !== "require") {
  console.error(
    "[db:verify] Supabase database URLs must include sslmode=require."
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasourceUrl: verificationUrl,
});

function isReachabilityError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("can't reach database server") ||
    message.includes("could not connect to server") ||
    message.includes("timed out")
  );
}

const requiredColumns = [
  {
    table: "discharge_report_entries",
    column: "report_date",
    note: "submission date column",
  },
  {
    table: "discharge_report_entries",
    column: "discharge_date",
    note: "separate discharge date column",
  },
  {
    table: "discharge_report_entries",
    column: "room_number",
    note: "room number column",
  },
  {
    table: "discharge_report_entries",
    column: "room_type",
    note: "room type column",
  },
  {
    table: "discharge_report_entries",
    column: "area",
    note: "area column",
  },
  {
    table: "report_answers",
    column: "area",
    note: "weekly area scope column",
  },
];

try {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('discharge_report_entries', 'report_answers')
    `
  );

  const existing = new Set(
    rows.map((row) => `${row.table_name}:${row.column_name}`)
  );

  const missing = requiredColumns.filter(
    (entry) => !existing.has(`${entry.table}:${entry.column}`)
  );

  if (missing.length > 0) {
    console.error("[db:verify] Missing required DB schema columns:");
    for (const item of missing) {
      console.error(`- ${item.table}.${item.column} (${item.note})`);
    }
    console.error(
      "[db:verify] Apply SQL migrations before deploying (including discharge_date migration)."
    );
    process.exit(1);
  }

  console.log("[db:verify] Schema verification passed.");
} catch (error) {
  if (isReachabilityError(error)) {
    console.warn(
      "[db:verify] Skipping schema verification because the database is not reachable from the build environment."
    );
    process.exit(0);
  }

  console.error("[db:verify] Failed to verify schema.", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
