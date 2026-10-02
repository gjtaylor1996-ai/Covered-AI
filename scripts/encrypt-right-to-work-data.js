// One-off backfill: encrypts right-to-work values written before field
// encryption existed. Idempotent — already-encrypted values are skipped.
// Usage: node scripts/encrypt-right-to-work-data.js
// Needs DATABASE_URL and FIELD_ENCRYPTION_KEY (loaded from .env if present).
// Format must stay in sync with src/lib/field-encryption.ts.

const { createCipheriv, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

try {
  process.loadEnvFile();
} catch {}

const PREFIX = "enc:v1:";
const FIELDS = [
  "rightToWorkShareCode",
  "rightToWorkDob",
  "rightToWorkNationality",
  "rightToWorkPassportNumber",
];

const rawKey = process.env.FIELD_ENCRYPTION_KEY;
const key = rawKey ? Buffer.from(rawKey, "base64") : null;
if (!key || key.length !== 32) {
  console.error("FIELD_ENCRYPTION_KEY must be set to 32 bytes, base64-encoded.");
  process.exit(1);
}

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

async function main() {
  const db = new PrismaClient();
  const workers = await db.workerProfile.findMany({
    where: { OR: FIELDS.map((f) => ({ [f]: { not: null } })) },
    select: { id: true, ...Object.fromEntries(FIELDS.map((f) => [f, true])) },
  });

  let updated = 0;
  for (const w of workers) {
    const data = {};
    for (const f of FIELDS) {
      if (w[f] != null && !w[f].startsWith(PREFIX)) data[f] = encrypt(w[f]);
    }
    if (Object.keys(data).length > 0) {
      await db.workerProfile.update({ where: { id: w.id }, data });
      updated++;
    }
  }
  console.log(`Checked ${workers.length} workers, encrypted ${updated}.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
