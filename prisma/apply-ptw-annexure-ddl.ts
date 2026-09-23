// DDL applier for PTW multi-hazard annexures + precaution checklists.
//
// Creates THREE tables and adds THREE nullable columns to "Permit":
//
//   PermitPrecautionItem       the seeded checklist catalog (one row per
//                              precaution line per hazard class)
//   PermitHazardAnnexure       one hazard attached to one permit
//   PermitPrecautionResponse   one Yes/No/NA answer to one item
//
//   Permit.effectiveRiskType         the PermitType whose workflow chain ran
//                                    — the UNION chain across all hazards.
//   Permit.precautionsCertifiedAt    the single site-EHS-officer signature
//   Permit.precautionsCertifiedById  covering every attached checklist.
//
// Why annexures rather than a `hazards TEXT[]` column on Permit: each attached
// hazard owns a checklist, a completion timestamp and a set of answers. That is
// a table, not an array. It also keeps `Permit.type` untouched — registers,
// analytics group-bys and the permit-number prefix all keep their meaning, and
// the multi-hazard build cannot regress a single-hazard permit.
//
// Additive + idempotent — safe to re-run. Nothing is dropped or altered, and
// no existing row is rewritten (the three Permit columns land NULL and stay
// NULL on legacy rows, which `ptw_annexures.evaluate` reads as "no annexures,
// nothing to block").
//
//   npx tsx prisma/apply-ptw-annexure-ddl.ts     (or: npm run db:apply-ptw-annexure)
//
// ⚠ ORDERING. The backend's SQLAlchemy Permit entity maps the three new
// columns. Until this script has run, EVERY Permit query 500s on
// "column Permit.effectiveRiskType does not exist" — run this BEFORE
// restarting uvicorn on the new code, not after.
//
// ⚠ Then seed the catalog, or every annexure is trivially complete and the
// checklist gate silently passes:
//     cd safeops_360_bakend && python -m app.seed.seed_ptw_precautions

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  // ── Permit columns ──
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "effectiveRiskType" TEXT`,
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "precautionsCertifiedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "precautionsCertifiedById" TEXT`,
  // Reporting filters on "which chain did this actually run through", which is
  // NOT the same question as Permit.type once annexures exist.
  `CREATE INDEX IF NOT EXISTS "Permit_effectiveRiskType_idx" ON "Permit" ("effectiveRiskType")`,

  // ── PermitPrecautionItem — the catalog ──
  // Not plant-scoped: these are standard/statutory-derived lines. A plant that
  // needs a local addition gets a row at a higher `sequence`, not a private copy.
  `CREATE TABLE IF NOT EXISTS "PermitPrecautionItem" (
     "id" TEXT PRIMARY KEY,
     "hazardType" TEXT NOT NULL,
     "sequence" INTEGER NOT NULL,
     "text" TEXT NOT NULL,
     "isMandatory" BOOLEAN NOT NULL DEFAULT true,
     "allowsNA" BOOLEAN NOT NULL DEFAULT true,
     "sourceRef" TEXT,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // The seed upserts on this pair, so it has to be unique for the seed to be
  // idempotent rather than duplicating the catalog on every run.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_precaution_hazard_seq"
     ON "PermitPrecautionItem"("hazardType", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "ix_PermitPrecautionItem_hazard_active"
     ON "PermitPrecautionItem"("hazardType", "isActive")`,

  // ── PermitHazardAnnexure ──
  `CREATE TABLE IF NOT EXISTS "PermitHazardAnnexure" (
     "id" TEXT PRIMARY KEY,
     "permitId" TEXT NOT NULL REFERENCES "Permit"("id") ON DELETE CASCADE,
     "hazardType" TEXT NOT NULL,
     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
     "addedById" TEXT,
     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "completedAt" TIMESTAMP(3),
     "completedById" TEXT,
     "notes" TEXT
   )`,
  // One annexure per hazard per permit — ticking Hot Work twice is the same
  // permit, not two checklists.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_permit_annexure_hazard"
     ON "PermitHazardAnnexure"("permitId", "hazardType")`,
  `CREATE INDEX IF NOT EXISTS "ix_PermitHazardAnnexure_permitId"
     ON "PermitHazardAnnexure"("permitId")`,

  // ── PermitPrecautionResponse ──
  // itemId is a plain FK with NO cascade: catalog rows are retired via
  // isActive, never deleted, so a closed permit's checklist always renders
  // against the text that was actually asked.
  `CREATE TABLE IF NOT EXISTS "PermitPrecautionResponse" (
     "id" TEXT PRIMARY KEY,
     "annexureId" TEXT NOT NULL REFERENCES "PermitHazardAnnexure"("id") ON DELETE CASCADE,
     "itemId" TEXT NOT NULL REFERENCES "PermitPrecautionItem"("id"),
     "response" TEXT NOT NULL,
     "remark" TEXT,
     "respondedById" TEXT,
     "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_precaution_response"
     ON "PermitPrecautionResponse"("annexureId", "itemId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PermitPrecautionResponse_annexureId"
     ON "PermitPrecautionResponse"("annexureId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PermitPrecautionResponse_itemId"
     ON "PermitPrecautionResponse"("itemId")`,
];

// ── Backfill: effectiveRiskType = type for every permit that predates
//    annexures. A legacy permit had exactly one hazard, so its effective risk
//    type IS its base type — and stamping it means downstream reporting can
//    read one column instead of COALESCE-ing two. Runs only where NULL, so
//    re-running never overwrites a live value. ──
const BACKFILL: { label: string; sql: string }[] = [
  {
    label: "effectiveRiskType = type (single-hazard legacy permits)",
    sql: `UPDATE "Permit" SET "effectiveRiskType" = "type"::text
           WHERE "effectiveRiskType" IS NULL`,
  },
];

async function main() {
  console.log("→ Applying PTW annexure DDL…\n");

  for (const sql of STATEMENTS) {
    const label = sql.replace(/\s+/g, " ").slice(0, 88);
    await prisma.$executeRawUnsafe(sql);
    console.log(`   ✓ ${label}…`);
  }

  console.log("\n→ Backfilling…");
  for (const { label, sql } of BACKFILL) {
    const n = await prisma.$executeRawUnsafe(sql);
    console.log(`   ✓ ${label} — ${n} row(s)`);
  }

  // ── Verify. A partial apply that is not caught here becomes a total PTW
  //    outage the moment uvicorn restarts, so fail loudly and say so. ──
  console.log("\n→ Verifying…");

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Permit'
        AND column_name IN ('effectiveRiskType','precautionsCertifiedAt','precautionsCertifiedById')`
  );
  const foundCols = new Set(cols.map((c) => c.column_name));
  const missingCols = [
    "effectiveRiskType",
    "precautionsCertifiedAt",
    "precautionsCertifiedById",
  ].filter((c) => !foundCols.has(c));
  if (missingCols.length) {
    throw new Error(
      `Permit columns missing after apply: ${missingCols.join(", ")} — do NOT restart uvicorn.`
    );
  }

  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('PermitPrecautionItem','PermitHazardAnnexure','PermitPrecautionResponse')`
  );
  const foundTables = new Set(tables.map((t) => t.table_name));
  const missingTables = [
    "PermitPrecautionItem",
    "PermitHazardAnnexure",
    "PermitPrecautionResponse",
  ].filter((t) => !foundTables.has(t));
  if (missingTables.length) {
    throw new Error(
      `Tables missing after apply: ${missingTables.join(", ")} — do NOT restart uvicorn.`
    );
  }

  const unbackfilled = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "Permit" WHERE "effectiveRiskType" IS NULL`
  );
  if (Number(unbackfilled[0].n) > 0) {
    throw new Error(`${unbackfilled[0].n} permits still have a NULL effectiveRiskType.`);
  }

  const catalog = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "PermitPrecautionItem"`
  );
  const catalogCount = Number(catalog[0].n);

  console.log("   ✓ 3 Permit columns present");
  console.log("   ✓ 3 tables present");
  console.log(`   ✓ effectiveRiskType backfilled on every permit`);
  console.log(`   • precaution catalog holds ${catalogCount} item(s)`);

  console.log("\n✅  PTW annexure schema applied.");
  if (catalogCount === 0) {
    console.log(
      "\n⚠  CATALOG IS EMPTY. Until it is seeded, every annexure is trivially\n" +
        "   complete and the checklist gate passes silently. Run:\n" +
        "     cd safeops_360_bakend && python -m app.seed.seed_ptw_precautions"
    );
  }
  console.log("    Then: npx prisma generate  → then restart uvicorn.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
