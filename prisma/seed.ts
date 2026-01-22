
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding lookup tables...')

    // 1. Warehouses
    const warehouses = [
        { name: 'NSTC', location: 'Riyadh' },
        { name: 'SNC', location: 'Dammam' },
    ]

    for (const wh of warehouses) {
        await prisma.warehouse.upsert({
            where: { name: wh.name },
            update: {},
            create: wh,
        })
    }
    console.log('Warehouses seeded.')

    // 2. Regions
    const regions = [
        'Riyadh',
        'Jeddah',
        'Dammam',
        'Neom',
        'Tabuk',
        'Jizan',
        'Madinah',
    ]

    for (const region of regions) {
        await prisma.region.upsert({
            where: { name: region },
            update: {},
            create: { name: region },
        })
    }
    console.log('Regions seeded.')

    // 3. Projects
    const projects = [
        'Royal Commission Project',
        'Neom Infrastructure',
        'Riyadh Metro Extension',
        'Red Sea Development',
        'Qiddiya Project',
        'Diriyah Gate',
        'General Maintainance',
    ]

    for (const project of projects) {
        await prisma.project.upsert({
            where: { name: project },
            update: {},
            create: { name: project, type: 'Construction' },
        })
    }
    console.log('Projects seeded.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
