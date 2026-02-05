import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("--- Checking Region Inconsistencies ---");

    const definedRegions = await prisma.region.findMany({ select: { name: true } });
    console.log("\nDefined Regions (in 'Region' table):", definedRegions.map(r => `"${r.name}"`));

    const workerRegions = await prisma.worker.findMany({
        select: { region: true },
        distinct: ['region']
    });
    console.log("\nWorker Regions:", workerRegions.map(r => `"${r.region}"`));

    const userRegions = await prisma.user.findMany({
        select: { region: true },
        distinct: ['region']
    });
    console.log("\nUser Regions:", userRegions.map(r => `"${r.region}"`));


    // Attendance stores region via worker relation mostly, but let's check if we store it directly anywhere or if we rely on worker
    // Attendance doesn't seem to have a region column directly based on previous code usage, it uses worker.region.
    // Let's check LocalInventory

    const localInventoryRegions = await prisma.localInventory.findMany({
        select: { region: true },
        distinct: ['region']
    });
    console.log("\nLocal Inventory Regions:", localInventoryRegions.map(r => `"${r.region}"`));

    const requestRegions = await prisma.request.findMany({
        select: { region: true },
        distinct: ['region']
    });
    console.log("\nRequest Regions:", requestRegions.map(r => `"${r.region}"`));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
