// One-off DDL applier for Capa.rcaAnalysisPayload.
//
// Adds ONE nullable JSONB column to an existing table. Nothing is altered or
// dropped, no row is rewritten, so this cannot regress a running module.
//
//   Capa."rcaAnalysisPayload" JSONB NULL
//
// WHY THIS COLUMN EXISTS
// A CAPA's root-cause analysis is drawn with a methodology (FIVE_WHY, FISHBONE,
// …) and the structured analysis is stored in the same shape the incident RCA
// editors read and write (src/lib/rca/types.ts). Without it the record kept
// only the free-text rcaSummary, so a filled-in template could be submitted and
// never read back.
//
// WHY IT IS URGENT
// The backend's SQLAlchemy model (app/models/capa.py) already maps the column,
// and SQLAlchemy names every mapped column in its SELECT. So EVERY query that
// loads a Capa entity 500s with
//
//   UndefinedColumnError: column Capa.rcaAnalysisPayload does not exist
//
// until this has run — not just the CAPA screens. The ERM Dashboard and Board
// Pack both went down this way, because their RISK_TREATMENT rollups select
// Capa rows. Same failure family as the LOTO deploy that took PTW down for 336
// permits: backend restarted ahead of its DDL.
//
// Additive + idempotent (ADD COLUMN IF NOT EXISTS), safe to re-run.
//   npx tsx prisma/apply-capa-rca-payload-ddl.ts   (or: npm run db:apply-capa-rca-payload)
//
// ⚠ JSONB, not JSON. Every other Json? column on Capa (sourceMetadata,
// contributingFactors, relatedCapaIds, slaBreaches, costCategories) is JSONB —
// that is what Prisma emits for Json? — and a lone JSON column would drift the
// schema away from what `prisma migrate diff` expects to find.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `ALTER TABLE "Capa" ADD COLUMN IF NOT EXISTS "rcaAnalysisPayload" JSONB`,
];

async function main() {
  console.log("Applying Capa RCA analysis-payload DDL…\n");

  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      console.error(`  ✗ ${label}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  // Verify rather than trust. ADD COLUMN IF NOT EXISTS reports success whether
  // it added anything or not.
  console.log("\nVerifying…");

  const col = await prisma.$queryRawUnsafe<
    { data_type: string; is_nullable: string }[]
  >(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'Capa' AND column_name = 'rcaAnalysisPayload'`
  );
  if (!col.length) {
    throw new Error(
      'Capa."rcaAnalysisPayload" is still missing — every query that loads a ' +
        "Capa entity will keep 500ing, including the ERM Dashboard and Board Pack."
    );
  }
  if (col[0].data_type !== "jsonb") {
    throw new Error(
      `Capa."rcaAnalysisPayload" is ${col[0].data_type}, expected jsonb — a ` +
        "pre-existing column of the wrong type will drift against the Prisma schema."
    );
  }
  if (col[0].is_nullable !== "YES") {
    throw new Error(
      'Capa."rcaAnalysisPayload" is NOT NULL — every CAPA closed on a free-text ' +
        "summary alone, and every one governed by a RootCauseAnalysis row, must " +
        "be allowed to leave it empty."
    );
  }
  console.log("  ✓ Capa.rcaAnalysisPayload — jsonb, nullable");

  // Prove the shape the backend actually issues now succeeds, rather than
  // inferring it from information_schema.
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "Capa"
      WHERE "isDeleted" = false AND "rcaAnalysisPayload" IS NOT NULL`
  );
  const [{ t }] = await prisma.$queryRawUnsafe<{ t: bigint }[]>(
    `SELECT count(*)::bigint AS t FROM "Capa" WHERE "isDeleted" = false`
  );
  console.log(
    `  ✓ readable — ${t} live CAPA row(s), ${n} with a structured analysis`
  );

  console.log("\n✅  Capa RCA analysis-payload DDL applied.");
  console.log("   Then: npx prisma generate (frontend types) — no uvicorn restart");
  console.log("   needed, the running backend already maps this column.");
  console.log(
    "   Note: existing CAPAs keep NULL here. Their rcaSummary text is untouched;\n" +
      "   the structured analysis only exists for RCAs submitted from now on."
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
