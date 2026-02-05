import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const shifts = await prisma.shift.findMany({ orderBy: { id: "asc" } });
    console.log("Shifts:", shifts);

    const workers = await prisma.worker.findMany({ select: { id: true, name: true, shiftId: true, shift: { select: { name: true } } }, take: 20 });
    console.log("Sample Workers:", workers);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
