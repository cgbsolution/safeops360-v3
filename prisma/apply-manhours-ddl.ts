// Manhours schema reconciliation — fixes the 500 on GET /api/manhours.
//
// ── What is broken ──────────────────────────────────────────────────────
// The SQLAlchemy model (app/models/manhours.py) was rewritten with renamed
// columns, but no migration was ever applied to the shared Supabase DB. The
// model puts every mapped column in its SELECT list, so EVERY query on the
// table fails. Measured against production 2026-08-13:
//
//     GET /api/manhours  ->  500   (every other module endpoint returned 200)
//
//   model wants            prod has            this script
//   ────────────────────── ─────────────────── ─────────────────────────────
//   manhoursWorked         employeeHours       add + backfill from old
//   contractorManhours     contractorHours     add + backfill from old
//   fatalCount             fatalityCount       add + backfill from old
//   headcount              (nothing)           add, DEFAULT 0  ← see warning
//   submittedById          (nothing)           add, NULL
//   submittedAt            (nothing)           add, NULL
//   notes                  (nothing)           add, NULL
//
// ── Why the backfill is the important half ──────────────────────────────
// There are 204 rows of real manhours data in production. Adding the new
// columns with DEFAULT 0 and stopping there WOULD clear the 500 — and would
// silently make every LTIFR / TRIFR / severity-rate figure read as zero,
// because the KPI code would read the new empty columns while the real hours
// sat in the old ones. For an EHS product LTIFR is a statutory reported
// number, so a silent zero is far worse than a visible error page.
//
// This is the same defect already on record in the CAMS POC: a v2 column
// migration with no backfill, which made a report show 78.9% computed over
// 0-of-82 records. Do not repeat it — never add a renamed column without
// carrying the old values across in the same transaction.
//
// ⚠ headcount has NO source column in the old schema. It is genuinely
// unknown for historical rows, so it lands at 0. It is NOT used by LTIFR /
// TRIR / severity rate (those are computed per 1,000,000 man-hours, not per
// head), so 0 does not corrupt any existing KPI — but any NEW report that
// uses headcount must treat 0 on pre-migration rows as "not recorded".
//
// The OLD columns are deliberately LEFT IN PLACE. They are the only copy of
// the source data; dropping them makes this irreversible. Retire them in a
// separate change once the new columns are confirmed correct in the UI.
//
// Idempotent (safe to re-run) and transactional: either the columns and the
// backfill both land, or neither does. Applied through the Prisma client's
// connection because `prisma db push` would DROP the drifted hand-DDL tables
// on this shared database.
//
//   npx tsx prisma/apply-manhours-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Additive only — every statement tolerates having been run before.
const DDL: string[] = [
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "headcount"           INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "manhoursWorked"      INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "contractorManhours"  INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "fatalCount"          INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "submittedById"       TEXT REFERENCES "User"("id")`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "submittedAt"         TIMESTAMPTZ`,
  `ALTER TABLE "Manhours" ADD COLUMN IF NOT EXISTS "notes"               TEXT`,
];

// Carry the real values across from the old columns. Guarded by "is the new
// column still zero" so re-running can never clobber a value someone has
// since edited through the UI.
const BACKFILL: { label: string; sql: string }[] = [
  {
    label: 'manhoursWorked <- employeeHours',
    sql: `UPDATE "Manhours" SET "manhoursWorked" = "employeeHours"
          WHERE "manhoursWorked" = 0 AND "employeeHours" IS DISTINCT FROM 0`,
  },
  {
    label: 'contractorManhours <- contractorHours',
    sql: `UPDATE "Manhours" SET "contractorManhours" = "contractorHours"
          WHERE "contractorManhours" = 0 AND "contractorHours" IS DISTINCT FROM 0`,
  },
  {
    label: 'fatalCount <- fatalityCount',
    sql: `UPDATE "Manhours" SET "fatalCount" = "fatalityCount"
          WHERE "fatalCount" = 0 AND "fatalityCount" IS DISTINCT FROM 0`,
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const before = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS rows,
            coalesce(sum("employeeHours"),0)::bigint   AS "employeeHours",
            coalesce(sum("contractorHours"),0)::bigint AS "contractorHours",
            coalesce(sum("fatalityCount"),0)::int      AS "fatalityCount"
     FROM "Manhours"`,
  );
  console.log("Manhours BEFORE:", before[0]);

  if (dryRun) {
    console.log("\n--dry-run: no changes made. Statements that would run:\n");
    [...DDL, ...BACKFILL.map((b) => b.sql)].forEach((s) =>
      console.log("  " + s.trim().replace(/\s+/g, " ").slice(0, 110)),
    );
    return;
  }

  // One transaction: columns + backfill land together or not at all.
  await prisma.$transaction(async (tx) => {
    for (const sql of DDL) {
      await tx.$executeRawUnsafe(sql);
      console.log(`  DDL      ${sql.match(/"(\w+)"\s+(?:INTEGER|TEXT|TIMESTAMPTZ)/)?.[1] ?? sql.slice(0, 50)}`);
    }
    for (const { label, sql } of BACKFILL) {
      const n = await tx.$executeRawUnsafe(sql);
      console.log(`  BACKFILL ${label}  (${n} rows)`);
    }
  });

  // Prove the data actually carried across — a migration that "succeeds" and
  // leaves the new columns empty is the exact failure this guards against.
  const after = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS rows,
            coalesce(sum("manhoursWorked"),0)::bigint     AS "manhoursWorked",
            coalesce(sum("contractorManhours"),0)::bigint AS "contractorManhours",
            coalesce(sum("fatalCount"),0)::int            AS "fatalCount",
            count(*) FILTER (WHERE "manhoursWorked" = 0
                               AND "employeeHours" IS DISTINCT FROM 0)::int AS "unbackfilled"
     FROM "Manhours"`,
  );
  console.log("Manhours AFTER: ", after[0]);

  const ok =
    String(after[0].manhoursWorked) === String(before[0].employeeHours) &&
    String(after[0].contractorManhours) === String(before[0].contractorHours) &&
    Number(after[0].unbackfilled) === 0;

  console.log(
    ok
      ? "\nOK  totals match the old columns — backfill verified."
      : "\nFAIL  totals do NOT match. Investigate before trusting any LTIFR/TRIR figure.",
  );
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
