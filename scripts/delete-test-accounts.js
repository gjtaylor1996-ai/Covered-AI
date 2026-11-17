#!/usr/bin/env node
// Deletes leftover automated-test accounts (emails like
// hs-live-test-*@example.com), plus the venues only they belong to.
// Lists everything it matched first and needs "DELETE" typed to proceed.
//
// Usage: node scripts/delete-test-accounts.js [email-prefix]
//   default prefix: hs-live-test-   (only @example.com addresses match)

const readline = require("readline");
const { PrismaClient } = require("@prisma/client");

const prefix = process.argv[2] || "hs-live-test-";

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const db = new PrismaClient();

  let host = "unknown";
  try { host = new URL(process.env.DATABASE_URL).hostname.split(".")[0]; } catch {}
  const total = await db.user.count();
  console.log(`Connected to database host: ${host}  (${total} users in total)`);

  const users = await db.user.findMany({
    where: { email: { contains: prefix, endsWith: "@example.com", mode: "insensitive" }, role: { not: "admin" } },
    include: {
      workerProfile: { select: { id: true } },
      venueMemberships: { include: { venue: { include: { members: true, _count: { select: { shifts: true } } } } } },
    },
  });

  if (users.length === 0) {
    console.log(`No accounts match ${prefix}*@example.com. Nothing to delete.`);
    const all = await db.user.findMany({ select: { email: true, role: true }, orderBy: { createdAt: "desc" } });
    console.log("\nEvery account in this database:");
    for (const u of all) console.log(`  - ${u.email}  (${u.role})`);
    await db.$disconnect();
    return;
  }

  // Venues to delete: only those where every member is one of the matched users.
  const matchedIds = new Set(users.map((u) => u.id));
  const venues = new Map();
  for (const u of users) {
    for (const m of u.venueMemberships) {
      if (m.venue.members.every((x) => matchedIds.has(x.userId))) venues.set(m.venue.id, m.venue);
    }
  }

  console.log("\nAccounts that will be deleted:");
  for (const u of users) {
    console.log(`  - ${u.email}  (${u.role}, created ${u.createdAt.toISOString().slice(0, 10)})`);
  }
  console.log("\nVenues that will be deleted (with their shifts):");
  if (venues.size === 0) console.log("  (none)");
  for (const v of venues.values()) {
    console.log(`  - ${v.name}  (${v._count.shifts} shifts)`);
  }

  const answer = await ask(`\nType DELETE to permanently remove these ${users.length} account(s): `);
  if (answer.trim() !== "DELETE") {
    console.log("Cancelled. Nothing was deleted.");
    await db.$disconnect();
    return;
  }

  await db.$transaction([
    db.venue.deleteMany({ where: { id: { in: [...venues.keys()] } } }),
    db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }),
  ]);

  console.log(`Deleted ${users.length} account(s) and ${venues.size} venue(s).`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("Failed. Nothing was partly deleted (it runs as one transaction).\n", err.message || err);
  process.exit(1);
});
