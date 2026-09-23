// One-off DDL applier for the Kaizen gap-closure build.
//
// Five ALTERs on BeKaizen, one new table, one extension and three trigram
// indexes. Every statement is additive and idempotent, so it is safe to re-run.
//
//   BeKaizen."screenedAt"          — cycle-time instrumentation (§2)
//   BeKaizen."approvedAt"          — cycle-time instrumentation (§2)
//   BeKaizen."originKaizenId"      — reverse pointer on a replicated copy (§4)
//   BeKaizen."generatedOplId"      — closed loop into standard work (§7)
//   BeKaizen."recognitionEventId"  — reserved link, nothing writes it (§3)
//   BeKaizenReplication            — append-only spread record (§4)
//   pg_trgm + 3 GIN indexes        — the similar-ideas search (§4/§8)
//
// ⚠ ORDERING — RUN THIS *BEFORE* RESTARTING UVICORN ON THE NEW CODE.
// This is the apply-be-ddl.ts case, not the apply-be-p2-ddl.ts case: the new
// backend maps five columns that do not exist until this runs, and SQLAlchemy
// puts every mapped column in its SELECT list. Until this is applied, a backend
// carrying the new models 500s on EVERY Kaizen query — list, detail, dashboard —
// not just on the new endpoints. The old backend is unaffected by the new
// columns, so this ordering has no window where anything is broken.
//
// Applied through the Prisma client's connection because `prisma db execute`
// hangs against the pooler here, and `prisma db push` would DROP the hand-DDL
// tables the rest of the platform lives in.
//   npx tsx prisma/apply-kaizen-gap-ddl.ts     (or: npm run db:apply-kaizen-gap)
//
// SEPARATELY REQUIRED: the before/after photo work (§1) rides the platform's
// shared Attachment table, which is declared in code and registered for
// "be_kaizen" but has never been created in this database. Run
//   npx tsx prisma/apply-attachment-ddl.ts
// as well; this script checks for it and says so rather than letting the photo
// upload fail at runtime with a confusing 500.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  // ── §2 Cycle time ────────────────────────────────────────────────────────
  // Nullable with no default and NO BACKFILL. A backfill from updatedAt was the
  // obvious shortcut and it is wrong: updatedAt moves on every edit, so it would
  // record "the last time anyone touched this row" as the screening date and the
  // median would measure editing habits rather than committee throughput. Rows
  // that predate these columns contribute nothing, which is the honest answer.
  `ALTER TABLE "BeKaizen" ADD COLUMN IF NOT EXISTS "screenedAt" TIMESTAMP(3)`,
  `ALTER TABLE "BeKaizen" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3)`,

  // ── §4 Replication / §7 closed loop / §3 recognition seam ───────────────
  `ALTER TABLE "BeKaizen" ADD COLUMN IF NOT EXISTS "originKaizenId" TEXT`,
  `ALTER TABLE "BeKaizen" ADD COLUMN IF NOT EXISTS "generatedOplId" TEXT`,
  `ALTER TABLE "BeKaizen" ADD COLUMN IF NOT EXISTS "recognitionEventId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_originKaizenId" ON "BeKaizen" ("originKaizenId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_generatedOplId" ON "BeKaizen" ("generatedOplId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_recognitionEventId" ON "BeKaizen" ("recognitionEventId")`,

  // ── §4 The spread record ────────────────────────────────────────────────
  // No isDeleted/deletedAt/deletedBy/deletionReason: this table is append-only
  // by construction, not by convention. "This idea spread to four plants" is
  // only worth something if the rows behind it cannot be quietly removed when
  // the number looks bad.
  `CREATE TABLE IF NOT EXISTS "BeKaizenReplication" (
     "id" TEXT PRIMARY KEY,
     "sourceKaizenId" TEXT NOT NULL REFERENCES "BeKaizen"("id"),
     "replicaKaizenId" TEXT,
     "replicatedAtPlantId" TEXT NOT NULL,
     "replicatedAtPlantName" TEXT,
     "replicatedById" TEXT NOT NULL,
     "replicatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "notes" TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizenReplication_source" ON "BeKaizenReplication" ("sourceKaizenId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizenReplication_plant" ON "BeKaizenReplication" ("replicatedAtPlantId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizenReplication_replica" ON "BeKaizenReplication" ("replicaKaizenId")`,
  // One idea deploys at one plant once. Enforced in the database rather than in
  // the router, because the double-click that creates the second row does not go
  // through the router's in-memory check twice in the same transaction.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BeKaizenReplication_source_plant"
     ON "BeKaizenReplication" ("sourceKaizenId", "replicatedAtPlantId")`,

  // ── §4/§8 Search at scale ───────────────────────────────────────────────
  // Trigram, not tsvector. The requirement is a debounced typeahead that fires
  // while somebody is still typing the title of the idea they are about to
  // raise — they will have typed "conveyor gu" when the match needs to fire, and
  // to_tsquery has no word to match on yet. Trigram similarity handles the
  // partial word and the misspelling; full-text handles neither.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_title_trgm"
     ON "BeKaizen" USING GIN ("title" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_problem_trgm"
     ON "BeKaizen" USING GIN ("problemStatement" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_improvement_trgm"
     ON "BeKaizen" USING GIN ("proposedImprovement" gin_trgm_ops)`,
];

const REQUIRED_COLUMNS = [
  "screenedAt",
  "approvedAt",
  "originKaizenId",
  "generatedOplId",
  "recognitionEventId",
];

const REQUIRED_INDEXES = [
  "uq_BeKaizenReplication_source_plant",
  "ix_BeKaizen_title_trgm",
  "ix_BeKaizen_problem_trgm",
  "ix_BeKaizen_improvement_trgm",
];

async function main() {
  console.log("Applying Kaizen gap-closure DDL…\n");
  let applied = 0;

  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      applied += 1;
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      console.error(`  ✗ ${label}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  // Verify rather than trust. ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT
  // EXISTS both report success whether they did anything or not, so read the
  // catalogue back before printing a green tick.
  console.log("\nVerifying…");

  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'BeKaizen'`
  );
  const haveCols = new Set(cols.map((c) => c.column_name));
  const missingCols = REQUIRED_COLUMNS.filter((c) => !haveCols.has(c));
  if (missingCols.length) {
    throw new Error(
      `BeKaizen is missing ${missingCols.join(", ")}. Every Kaizen query will ` +
        `500 once the backend restarts on the new models.`
    );
  }
  console.log(`  ✓ BeKaizen — ${REQUIRED_COLUMNS.length} new columns present`);

  const reps = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "BeKaizenReplication"`
  );
  console.log(`  ✓ BeKaizenReplication — ${reps[0].n} row(s)`);

  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`,
    REQUIRED_INDEXES
  );
  const haveIdx = new Set(idx.map((r) => r.indexname));
  const missingIdx = REQUIRED_INDEXES.filter((n) => !haveIdx.has(n));
  if (missingIdx.length) {
    throw new Error(
      `Indexes missing: ${missingIdx.join(", ")}. Without the trigram indexes ` +
        `the similar-ideas search degrades to a sequential ILIKE scan; without ` +
        `the unique index a double-click double-counts the spread figure.`
    );
  }
  console.log(`  ✓ ${REQUIRED_INDEXES.length} indexes present`);

  // The before/after photo feature rides the platform's shared Attachment
  // table. It is declared in app/models/attachment.py and "be_kaizen" is already
  // a registered evidence entity — but the table has never been created in this
  // database, which is why photo upload would 500 rather than 503.
  const att = await prisma.$queryRawUnsafe<{ t: string | null }[]>(
    `SELECT to_regclass('"Attachment"')::text AS t`
  );
  if (!att[0].t) {
    console.log(
      `\n⚠  The shared "Attachment" table does not exist in this database.\n` +
        `   Kaizen before/after photos (§1) ride it via the "be_kaizen" evidence\n` +
        `   registry entry and WILL FAIL until you also run:\n` +
        `       npx tsx prisma/apply-attachment-ddl.ts`
    );
  } else {
    console.log(`  ✓ shared "Attachment" table present — §1 photo upload is backed`);
  }

  console.log(`\n✅  Kaizen gap-closure DDL applied (${applied} statements).`);
  console.log("   Then: npx prisma generate && restart uvicorn.");
  console.log("   Report on pre-existing FAST_TRACK rows with no investment data:");
  console.log("       npx tsx prisma/report-kaizen-fast-track.ts");
}

main()
  .catch((e) => {
    console.error("\n❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
