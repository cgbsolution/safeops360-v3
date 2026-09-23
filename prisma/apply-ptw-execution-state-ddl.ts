// One-off DDL applier for the PTW closure state-gating fix.
//
// Adds THREE nullable columns to the existing "Permit" table and backfills
// them from facts already on the row. Nothing else is altered, no table is
// created or dropped, so this cannot regress a running module.
//
//   executionState       NOT_STARTED | IN_PROGRESS | COMPLETED |
//                        EXPIRED_UNEXECUTED | WITHDRAWN
//                        — did work under this permit ever actually happen?
//   closureType          WORK_COMPLETED | UNEXECUTED_CLOSURE | CANCELLED
//                        — WHICH closure path a terminal permit went through,
//                          first-class and queryable, never inferred from
//                          timestamps after the fact.
//   unexecutedReasonCode NO_LONGER_REQUIRED | RESCHEDULED | RESOURCE_UNAVAILABLE
//                        | OTHER — why an unexecuted permit was withdrawn.
//
// Why a separate executionState rather than overloading `status`: `status` is a
// native Postgres enum created by Prisma and already carries the WORKFLOW
// position (DRAFT → … → CLOSED). Whether work physically happened is an
// orthogonal fact — an EXPIRED permit may or may not have been worked, and that
// is precisely the distinction this fix exists to make. All three are TEXT (like
// the existing `outcome` column) so no ALTER TYPE on a live enum is needed.
//
// Additive + idempotent — safe to re-run.
//   npx tsx prisma/apply-ptw-execution-state-ddl.ts
//
// ⚠ Ordering note: the backend's SQLAlchemy Permit entity maps these three
// columns. Until this script has run, EVERY Permit query 500s on
// "column Permit.executionState does not exist" — run this BEFORE restarting
// uvicorn on the new code, not after.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "executionState" TEXT`,
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "closureType" TEXT`,
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "unexecutedReasonCode" TEXT`,
  // Reporting reads these as filters ("real work only"), so they earn indexes.
  `CREATE INDEX IF NOT EXISTS "Permit_executionState_idx" ON "Permit" ("executionState")`,
  `CREATE INDEX IF NOT EXISTS "Permit_closureType_idx" ON "Permit" ("closureType")`,
];

// ── Backfill. Derived from facts already on the row; each statement runs only
//    where the column is still NULL, so re-running never overwrites a live
//    value. Order matters — the rules are evaluated most-specific first. ──
const BACKFILL: { label: string; sql: string }[] = [
  {
    label: "executionState = COMPLETED (work was declared)",
    sql: `UPDATE "Permit" SET "executionState" = 'COMPLETED'
           WHERE "executionState" IS NULL
             AND COALESCE("workCompletedAt", "returnedAt") IS NOT NULL`,
  },
  {
    label: "executionState = WITHDRAWN (cancelled permits)",
    sql: `UPDATE "Permit" SET "executionState" = 'WITHDRAWN'
           WHERE "executionState" IS NULL AND "status" = 'CANCELLED'`,
  },
  {
    label: "executionState = IN_PROGRESS (receiver accepted, no declaration yet)",
    sql: `UPDATE "Permit" SET "executionState" = 'IN_PROGRESS'
           WHERE "executionState" IS NULL
             AND ("activatedAt" IS NOT NULL OR "status" IN ('ACTIVE','SUSPENDED'))`,
  },
  {
    label: "executionState = EXPIRED_UNEXECUTED (expired before acknowledgement)",
    sql: `UPDATE "Permit" SET "executionState" = 'EXPIRED_UNEXECUTED'
           WHERE "executionState" IS NULL
             AND "status" = 'EXPIRED' AND "activatedAt" IS NULL`,
  },
  {
    // Historical/seeded rows: CLOSED, but with no Work Completed declaration
    // on the row at all (the closure chain that requires one post-dates them).
    // Their own terminal status is the assertion of record, so NOT_STARTED
    // would misread them badly. `closureType` is deliberately left NULL —
    // there is no declaration to name a door with, and inventing one would be
    // exactly the fabrication this fix exists to prevent.
    label: "executionState = COMPLETED (legacy CLOSED, no declaration on row)",
    sql: `UPDATE "Permit" SET "executionState" = 'COMPLETED'
           WHERE "executionState" IS NULL AND "status" = 'CLOSED'`,
  },
  {
    label: "executionState = NOT_STARTED (still in the approval chain)",
    sql: `UPDATE "Permit" SET "executionState" = 'NOT_STARTED'
           WHERE "executionState" IS NULL`,
  },
  {
    // Repair for an earlier run of this script, which lacked the legacy-CLOSED
    // rule above and parked those rows at NOT_STARTED. Scoped so it can only
    // ever touch that exact combination.
    label: "repair: legacy CLOSED rows parked at NOT_STARTED",
    sql: `UPDATE "Permit" SET "executionState" = 'COMPLETED'
           WHERE "executionState" = 'NOT_STARTED' AND "status" = 'CLOSED'`,
  },
  {
    label: "closureType = WORK_COMPLETED (declaration on the row)",
    sql: `UPDATE "Permit" SET "closureType" = 'WORK_COMPLETED'
           WHERE "closureType" IS NULL
             AND COALESCE("workCompletedAt", "returnedAt") IS NOT NULL`,
  },
  {
    label: "closureType = CANCELLED (operational cancellation)",
    sql: `UPDATE "Permit" SET "closureType" = 'CANCELLED'
           WHERE "closureType" IS NULL AND "status" = 'CANCELLED'`,
  },
];

async function main() {
  console.log("→ PTW execution-state DDL\n");

  for (const sql of STATEMENTS) {
    const head = sql.replace(/\s+/g, " ").slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`   ✔ ${head}`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/already exists|duplicate/i.test(msg)) {
        console.log(`   • ${head}  (already present)`);
      } else {
        throw e;
      }
    }
  }

  console.log("\n→ Backfill\n");
  for (const b of BACKFILL) {
    const n = await prisma.$executeRawUnsafe(b.sql);
    console.log(`   ✔ ${b.label} — ${n} row(s)`);
  }

  // ── Verify. These three columns are mapped by the backend's Permit entity;
  //    if any is missing, every permit query 500s. Fail loudly BEFORE anyone
  //    restarts uvicorn. ──
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Permit'
        AND column_name IN ('executionState','closureType','unexecutedReasonCode')`
  );
  const found = new Set(cols.map((c) => c.column_name));
  const missing = ["executionState", "closureType", "unexecutedReasonCode"].filter(
    (c) => !found.has(c)
  );
  if (missing.length) {
    throw new Error(
      `Permit columns missing after apply: ${missing.join(", ")} — do NOT restart uvicorn.`
    );
  }

  const dist = await prisma.$queryRawUnsafe<{ executionState: string; n: bigint }[]>(
    `SELECT "executionState", count(*) AS n FROM "Permit"
      WHERE COALESCE("isDeleted", false) = false
      GROUP BY 1 ORDER BY 2 DESC`
  );
  console.log("\n   executionState distribution:");
  for (const r of dist) console.log(`     ${String(r.executionState).padEnd(20)} ${r.n}`);

  const unbackfilled = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "Permit" WHERE "executionState" IS NULL`
  );
  if (Number(unbackfilled[0].n) > 0) {
    throw new Error(`${unbackfilled[0].n} permits still have a NULL executionState.`);
  }

  console.log("\n✅  PTW execution-state columns present and backfilled.");
  console.log("    Next: npx prisma generate  → then restart uvicorn.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
