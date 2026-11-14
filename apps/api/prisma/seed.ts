import { Password, Username } from "@cabinet-planner/shared";
import { hash } from "argon2";
import { z } from "zod";
import { createPrisma } from "../src/db.js";
import { loadEnv } from "../src/env.js";

const CABINET_TYPES = ["Control", "Power", "Jumper", "Safety", "Motion", "Comms", "General"];

const SeedEnv = z.object({
  SEED_ADMIN_USER: Username,
  SEED_ADMIN_PASSWORD: Password,
});

const env = loadEnv();
const seedEnv = SeedEnv.safeParse(process.env);
if (!seedEnv.success) {
  throw new Error(
    `Set SEED_ADMIN_USER and SEED_ADMIN_PASSWORD in .env:\n${z.prettifyError(seedEnv.error)}`,
  );
}
const { SEED_ADMIN_USER, SEED_ADMIN_PASSWORD } = seedEnv.data;

const prisma = createPrisma(env.DATABASE_URL);

try {
  for (const [sortOrder, name] of CABINET_TYPES.entries()) {
    await prisma.cabinetType.upsert({
      where: { name },
      create: { name, sortOrder },
      update: {},
    });
  }
  console.log(`Cabinet types: ${CABINET_TYPES.join(", ")}`);

  // Create the admin once. Re-running the seed never resets an existing password.
  const existing = await prisma.user.findUnique({ where: { username: SEED_ADMIN_USER } });
  if (existing) {
    console.log(`Admin user "${SEED_ADMIN_USER}" already exists, left unchanged.`);
  } else {
    await prisma.user.create({
      data: {
        username: SEED_ADMIN_USER,
        displayName: "Administrator",
        passwordHash: await hash(SEED_ADMIN_PASSWORD),
        role: "ADMIN",
      },
    });
    console.log(`Admin user "${SEED_ADMIN_USER}" created.`);
  }
} finally {
  await prisma.$disconnect();
}
