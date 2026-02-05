import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Adding CWW Warehouse...");

    const warehouse = await prisma.warehouse.upsert({
        where: { name: "CWW" },
        update: {},
        create: {
            name: "CWW",
            location: "Central Warehouse",
        },
    });

    console.log("CWW Warehouse added:", warehouse);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
