#!/usr/bin/env node
// Bootstraps an admin account. There's no public admin signup endpoint
// (spec §8.2 assumes admins are provisioned out-of-band, not
// self-registered) — this is that out-of-band mechanism, run locally by
// whoever operates the deployment.
//
// Usage: node scripts/create-admin.js <email> <password> [role]
//   role: reviewer (default) | ops_manager | super_admin

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  const [, , email, password, role = "reviewer"] = process.argv;
  if (!email || !password) {
    console.error("Usage: node scripts/create-admin.js <email> <password> [role]");
    process.exit(1);
  }
  if (!["reviewer", "ops_manager", "super_admin"].includes(role)) {
    console.error(`Invalid role "${role}" — must be reviewer, ops_manager, or super_admin.`);
    process.exit(1);
  }

  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    create: { email, passwordHash, role: "admin" },
    update: { passwordHash, role: "admin" },
  });

  const admin = await db.adminUser.upsert({
    where: { userId: user.id },
    create: { userId: user.id, role },
    update: { role },
  });

  console.log(`Admin ready: ${email} (${admin.role}). Log in at /login like any other account.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
