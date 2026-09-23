// One-off DDL applier for the Poka Yoke bypass log.
//
// Creates ONE new table and nothing else. No existing column is altered or
// dropped, so this cannot regress a running module.
//
//   BePokaYokeBypass — one row per bypass episode, append-only
//
// WHY THIS TABLE EXISTS
// The device row already carried isBypassed / bypassReason / bypassedAt /
// bypassedById / bypassApprovedById, and they worked right up to the moment
// somebody ENDED a bypass: POST /restore NULLed the timestamp and both user
// references. A device bypassed and restored ten times kept exactly one reason
// string, no dates and no names. "How often is this device switched off, and
// for how long" — the one question an auditor asks of a mistake-proofing
// register — was unanswerable by construction.
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run.
//   npx tsx prisma/apply-poka-yoke-bypass-ddl.ts   (or: npm run db:apply-py-bypass)
//
// ⚠ ORDERING — RUN THIS BEFORE RESTARTING UVICORN ON THE NEW CODE.
// The backend's SQLAlchemy models map BePokaYokeBypass and the device detail
// endpoint selects from it. Until this has run, GET /api/be/poka-yoke/{id} 500s
// on 'relation "BePokaYokeBypass" does not exist'. A LOTO deploy in the wrong
// order took PTW down for 336 permits.
//
// ⚠ TIMESTAMP TYPE. Every existing timestamp on BePokaYoke is TIMESTAMP(3) —
// WITHOUT time zone — and this table matches that deliberately. Mixing a
// timestamptz column into a table whose siblings are naive is how a duration
// calculation silently gains or loses 5h30m.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "BePokaYokeBypass" (
     "id" TEXT PRIMARY KEY,
     "deviceId" TEXT NOT NULL,
     "plantId" TEXT NOT NULL,
     "bypassedById" TEXT NOT NULL,
     "bypassedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "reason" TEXT NOT NULL,
     "approvedById" TEXT,
     "statusAtBypass" TEXT,
     "restoredAt" TIMESTAMP(3),
     "restoredById" TEXT,
     "restoreNote" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "fk_BePyBypass_device" FOREIGN KEY ("deviceId")
       REFERENCES "BePokaYoke"("id") ON DELETE CASCADE
   )`,

  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_device" ON "BePokaYokeBypass"("deviceId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_plant" ON "BePokaYokeBypass"("plantId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_by" ON "BePokaYokeBypass"("bypassedById")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_at" ON "BePokaYokeBypass"("bypassedAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_restored" ON "BePokaYokeBypass"("restoredAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_device_at" ON "BePokaYokeBypass"("deviceId", "bypassedAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyBypass_plant_open" ON "BePokaYokeBypass"("plantId", "restoredAt")`,

  // The real guard. The router's 409 is the friendly message; this is what
  // actually stops a double-click opening two episodes on one device and
  // double-counting the dashboard's ACTIVE BYPASSES tile. Prisma cannot
  // express a partial unique index, which is why it is here and the schema
  // declares only the plain lookup index.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BePyBypass_one_open_per_device"
     ON "BePokaYokeBypass"("deviceId") WHERE "restoredAt" IS NULL`,
];

// Carry forward whatever the flat columns still hold for devices that are
// bypassed RIGHT NOW, so the new table does not start by contradicting the
// register. Only currently-open bypasses can be recovered — every episode that
// was already restored had its timestamp and both user references erased by the
// old /restore, and no backfill can invent them back. That loss is permanent
// and is stated in the run output rather than quietly skipped.
const BACKFILL = `
  INSERT INTO "BePokaYokeBypass"
    ("id", "deviceId", "plantId", "bypassedById", "bypassedAt", "reason",
     "approvedById", "statusAtBypass", "createdAt")
  SELECT
    md5(random()::text || clock_timestamp()::text),
    d."id",
    d."plantId",
    COALESCE(d."bypassedById", d."createdById"),
    COALESCE(d."bypassedAt", d."updatedAt", CURRENT_TIMESTAMP),
    COALESCE(NULLIF(btrim(d."bypassReason"), ''),
             'Reason not recorded — carried forward from the pre-log bypass columns.'),
    d."bypassApprovedById",
    d."status",
    CURRENT_TIMESTAMP
  FROM "BePokaYoke" d
  WHERE d."isBypassed" = true
    AND NOT EXISTS (
      SELECT 1 FROM "BePokaYokeBypass" b
       WHERE b."deviceId" = d."id" AND b."restoredAt" IS NULL
    )
`;

async function main() {
  console.log("Applying Poka Yoke bypass-log DDL…\n");
  let applied = 0;

  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      applied += 1;
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      // Every statement above tolerates re-running via IF NOT EXISTS. Anything
      // that still throws is a real failure and must stop the run rather than
      // leave the schema half-applied.
      console.error(`  ✗ ${label}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  console.log("\nBackfilling open bypasses from the flat columns…");
  const moved = await prisma.$executeRawUnsafe(BACKFILL);
  console.log(`  ✓ ${moved} open bypass episode(s) carried forward`);

  // Verify rather than trust. CREATE TABLE IF NOT EXISTS reports success
  // whether it created anything or not.
  console.log("\nVerifying…");

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'BePokaYokeBypass'`
  );
  const want = [
    "id", "deviceId", "plantId", "bypassedById", "bypassedAt", "reason",
    "approvedById", "statusAtBypass", "restoredAt", "restoredById",
    "restoreNote", "createdAt",
  ];
  const have = new Set(cols.map((c) => c.column_name));
  const missing = want.filter((c) => !have.has(c));
  if (missing.length) {
    throw new Error(
      `BePokaYokeBypass is missing ${missing.join(", ")} — the backend will 500 ` +
        "on every Poka Yoke detail request once it restarts on the new models."
    );
  }
  console.log(`  ✓ BePokaYokeBypass — ${want.length} columns`);

  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'BePokaYokeBypass'
        AND indexname = 'uq_BePyBypass_one_open_per_device'`
  );
  if (!idx.length) {
    throw new Error(
      "The partial unique index is missing — two concurrent bypasses on one " +
        "device would both open, and the ACTIVE BYPASSES tile would double-count."
    );
  }
  console.log("  ✓ uq_BePyBypass_one_open_per_device (partial, WHERE restoredAt IS NULL)");

  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "BePokaYokeBypass"`
  );
  const [{ f }] = await prisma.$queryRawUnsafe<{ f: bigint }[]>(
    `SELECT count(*)::bigint AS f FROM "BePokaYoke" WHERE "isBypassed" = true`
  );
  console.log(`  ✓ ${n} bypass row(s); ${f} device(s) flagged bypassed on the register`);
  if (Number(f) !== Number(moved) && Number(moved) === 0 && Number(f) > 0) {
    console.warn(
      `  ⚠ ${f} device(s) are flagged bypassed but nothing was backfilled — ` +
        "they already had an open episode, which is fine on a re-run."
    );
  }

  console.log(`\n✅  Poka Yoke bypass-log DDL applied (${applied} statements).`);
  console.log("   Then: npx prisma generate && restart uvicorn.");
  console.log(
    "   Note: bypass episodes that were already RESTORED before this ran cannot\n" +
      "   be recovered — the old /restore erased their timestamps and both user\n" +
      "   references. History starts from now."
  );
}

main()
  .catch((e) => {
    console.error("\n❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
