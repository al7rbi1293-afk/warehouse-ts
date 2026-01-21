
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Attempting to fix PROJECTS table via Raw SQL...');

    try {
        // 4. Fix Projects Table (Add status column)
        await prisma.$executeRaw`
      ALTER TABLE "public"."projects" 
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Active';
    `;
        console.log("✅ Added 'status' column to 'projects' table.");

        // 5. Verify Columns
        const columns = await prisma.$queryRaw`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'projects'
    `;
        console.log("📌 Projects Columns:", columns);

    } catch (e: any) {
        console.error("❌ Failed to alter projects table:", e.meta?.message || e.message);
    }

    await prisma.$disconnect();
}

main();
