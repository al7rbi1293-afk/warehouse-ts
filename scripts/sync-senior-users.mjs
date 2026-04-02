import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function extractFirstNameUsername(name) {
  const [firstToken = "senior"] = normalizeName(name).split(" ");
  const cleaned = firstToken.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || "senior";
}

function collectAreas(users) {
  const dedup = new Map();

  for (const user of users) {
    for (const source of [user.region, user.regions]) {
      if (!source) {
        continue;
      }

      for (const value of source.split(",")) {
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }

        const key = trimmed.toUpperCase();
        if (!dedup.has(key)) {
          dedup.set(key, trimmed);
        }
      }
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.localeCompare(b, "en"));
}

function buildUniqueUsername(base, existingByUsername, currentUserId) {
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = existingByUsername.get(candidate);
    if (!existing || existing.id === currentUserId) {
      return candidate;
    }

    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

async function main() {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM users), 0), 1),
      true
    )
  `);

  const [seniorWorkers, supervisorUsers, existingUsers] = await Promise.all([
    prisma.worker.findMany({
      where: { role: "Senior Housekeeper" },
      select: {
        name: true,
        empId: true,
        shiftId: true,
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        role: {
          in: ["supervisor", "night_supervisor"],
        },
      },
      select: {
        region: true,
        regions: true,
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        empId: true,
      },
    }),
  ]);

  if (seniorWorkers.length === 0) {
    console.log("No senior workers found.");
    return;
  }

  const fullAreaAccess = collectAreas(supervisorUsers).join(",");
  const passwordHash = await hash("123", 12);
  const existingByUsername = new Map(
    existingUsers.map((user) => [user.username.toLowerCase(), user])
  );
  const existingByEmpId = new Map(
    existingUsers
      .filter((user) => user.empId)
      .map((user) => [user.empId, user])
  );
  const existingByName = new Map(
    existingUsers
      .filter((user) => user.name)
      .map((user) => [normalizeName(user.name).toLowerCase(), user])
  );

  const summary = [];

  for (const worker of seniorWorkers) {
    const normalizedName = normalizeName(worker.name);
    const existingUser =
      (worker.empId ? existingByEmpId.get(worker.empId) : null) ||
      existingByName.get(normalizedName.toLowerCase()) ||
      null;

    const baseUsername = extractFirstNameUsername(normalizedName);
    const username = buildUniqueUsername(
      baseUsername,
      existingByUsername,
      existingUser?.id || null
    );

    const data = {
      username,
      password: passwordHash,
      name: normalizedName,
      empId: worker.empId || null,
      role: "senior",
      region: fullAreaAccess || null,
      regions: fullAreaAccess || null,
      shiftId: worker.shiftId || null,
      attendanceShiftId: worker.shiftId || null,
      allowedShifts: null,
    };

    if (existingUser) {
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data,
        select: {
          id: true,
          username: true,
        },
      });

      existingByUsername.set(updated.username.toLowerCase(), updated);
      summary.push({
        action: "updated",
        username: updated.username,
        name: normalizedName,
      });
      continue;
    }

    const created = await prisma.user.create({
      data,
      select: {
        id: true,
        username: true,
      },
    });

    existingByUsername.set(created.username.toLowerCase(), created);
    summary.push({
      action: "created",
      username: created.username,
      name: normalizedName,
    });
  }

  console.table(summary);
  console.log(`Senior users synced: ${summary.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
