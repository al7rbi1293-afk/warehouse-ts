import { PrismaClient } from "@prisma/client";

const shouldVerify =
  process.env.VERCEL === "1" || process.env.REQUIRE_DB_VERIFY === "1";

if (!shouldVerify) {
  console.log(
    "[db:verify] Skipped (set REQUIRE_DB_VERIFY=1 to enforce outside Vercel)."
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "[db:verify] DATABASE_URL is missing. Refusing deployment without schema verification."
  );
  process.exit(1);
}

const prisma = new PrismaClient();

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
  console.error("[db:verify] Failed to verify schema.", error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
