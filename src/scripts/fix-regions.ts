import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("--- Normalizing Region Names ---");

    // Define canonical map (Bad -> Good)
    const mapping: Record<string, string> = {
        "1s floor": "1st floor",
        "1s Floor": "1st floor",
        "1st Floor": "1st floor",
        "Ward50-51": "Ward 50-51",
        "Imeging": "IMAGING",
        "Neurodiangnostic": "Neurodiagnostic",
        "RT and Waiting area": "WA And RT",
    };

    // 1. Fix Workers
    const workers = await prisma.worker.findMany();
    for (const w of workers) {
        if (w.region && mapping[w.region]) {
            console.log(`Fixing Worker ${w.name}: ${w.region} -> ${mapping[w.region]}`);
            await prisma.worker.update({
                where: { id: w.id },
                data: { region: mapping[w.region] }
            });
        }
    }

    // 2. Fix Users (Comma separated regions)
    const users = await prisma.user.findMany();
    for (const u of users) {
        if (u.region) {
            let newRegion = u.region;
            let changed = false;

            // Split by comma, trim, fix, rejoin
            const parts = newRegion.split(',').map(p => p.trim());
            const fixedParts = parts.map(p => {
                if (mapping[p]) {
                    changed = true;
                    return mapping[p];
                }
                return p;
            });

            if (changed) {
                newRegion = fixedParts.join(',');
                console.log(`Fixing User ${u.username}: "${u.region}" -> "${newRegion}"`);
                await prisma.user.update({
                    where: { id: u.id },
                    data: { region: newRegion }
                });
            }
        }
    }

    console.log("Region normalization complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
