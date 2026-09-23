// One-off DDL applier for the Business Excellence module (Phase 1).
//
// Creates FIVE new tables and adds ONE nullable column to the existing
// RootCauseAnalysis table ("sourceProblemId"). Nothing else existing is
// altered, so this cannot regress a running module — and the RCA column is
// nullable with no default, so every existing analysis stays valid.
//
//   BeKaizen               — the shop-floor improvement register
//   BeOpl                  — One Point Lesson (a single visual page)
//   BeOplAcknowledgement   — one person's obligation to read one revision
//   BePokaYoke             — a mistake-proofing device
//   BePokaYokeVerification — append-only proof the device still works
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run. Applied through the Prisma client's connection because
// `prisma db execute` / `migrate diff` hang against the pooler here, and
// `prisma db push` would DROP the hand-DDL tables the other modules live in.
//   npx tsx prisma/apply-be-ddl.ts     (or: npm run db:apply-be)
//
// ⚠ ORDERING — RUN THIS BEFORE RESTARTING UVICORN ON THE NEW CODE.
// The backend's SQLAlchemy models add `sourceProblemId` to the mapped
// RootCauseAnalysis entity. Until this script has run, EVERY RCA query 500s on
// "column RootCauseAnalysis.sourceProblemId does not exist" — and the ERM RCA
// register, the cause-to-risk map and the incident investigation panel all read
// it. A LOTO deploy in exactly this order took PTW down for 336 permits.
//
// ⚠ The three record-number unique indexes are PARTIAL (WHERE isDeleted =
// false) and Prisma cannot express that, which is why they are created here and
// the schema declares only the plain lookup index. A soft-deleted record still
// owns its number for numbering purposes — services/business_excellence.py
// scans with include_deleted=True — but must not permanently block the code
// from being re-used at a different plant.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  // ── BeKaizen ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeKaizen" (
     "id" TEXT PRIMARY KEY,
     "kaizenNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "title" TEXT NOT NULL,
     "category" TEXT NOT NULL,
     "lane" TEXT NOT NULL DEFAULT 'STANDARD',
     "lineOrMachine" TEXT,
     "processStep" TEXT,
     "problemStatement" TEXT NOT NULL,
     "currentState" TEXT,
     "proposedImprovement" TEXT NOT NULL,
     "expectedBenefit" TEXT,
     "ownerId" TEXT,
     "targetDate" TIMESTAMP(3),
     "implementedAt" TIMESTAMP(3),
     "implementationNote" TEXT,
     "currency" TEXT NOT NULL DEFAULT 'INR',
     "investmentCost" DOUBLE PRECISION,
     "estimatedAnnualSaving" DOUBLE PRECISION,
     "savingType" TEXT,
     "verifiedAnnualSaving" DOUBLE PRECISION,
     "verifiedById" TEXT,
     "verifiedAt" TIMESTAMP(3),
     "verificationNote" TEXT,
     "yokotenScope" JSONB,
     "rewardPoints" INTEGER,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "workflowInstanceId" TEXT,
     "rejectionReason" TEXT,
     "closedAt" TIMESTAMP(3),
     "sourceModule" TEXT,
     "sourceRecordId" TEXT,
     "sourceRecordRef" TEXT,
     "createdById" TEXT NOT NULL,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeKaizen_plant_no"
     ON "BeKaizen"("plantId", "kaizenNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_plant_status" ON "BeKaizen"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_plant_created" ON "BeKaizen"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_source" ON "BeKaizen"("sourceModule", "sourceRecordId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_owner" ON "BeKaizen"("ownerId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeKaizen_deleted" ON "BeKaizen"("isDeleted")`,

  // ── BeOpl ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeOpl" (
     "id" TEXT PRIMARY KEY,
     "oplNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "title" TEXT NOT NULL,
     "category" TEXT NOT NULL,
     "lineOrMachine" TEXT,
     "contentHtml" TEXT,
     "keyPoints" JSONB,
     "authorId" TEXT NOT NULL,
     "approverId" TEXT,
     "approvedAt" TIMESTAMP(3),
     "effectiveFrom" TIMESTAMP(3),
     "reviewDueAt" TIMESTAMP(3),
     "revision" INTEGER NOT NULL DEFAULT 1,
     "supersedesOplId" TEXT,
     "supersededByOplId" TEXT,
     "audience" JSONB,
     "acknowledgementDueDays" INTEGER NOT NULL DEFAULT 14,
     "competencyId" TEXT,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "workflowInstanceId" TEXT,
     "rejectionReason" TEXT,
     "publishedAt" TIMESTAMP(3),
     "retiredAt" TIMESTAMP(3),
     "sourceModule" TEXT,
     "sourceRecordId" TEXT,
     "sourceRecordRef" TEXT,
     "createdById" TEXT NOT NULL,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeOpl_plant_no"
     ON "BeOpl"("plantId", "oplNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOpl_plant_status" ON "BeOpl"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOpl_plant_created" ON "BeOpl"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOpl_review_due" ON "BeOpl"("reviewDueAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOpl_competency" ON "BeOpl"("competencyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOpl_deleted" ON "BeOpl"("isDeleted")`,

  // ── BeOplAcknowledgement ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeOplAcknowledgement" (
     "id" TEXT PRIMARY KEY,
     "oplId" TEXT NOT NULL,
     "oplRevision" INTEGER NOT NULL DEFAULT 1,
     "personUserId" TEXT NOT NULL,
     "plantId" TEXT NOT NULL,
     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "dueAt" TIMESTAMP(3),
     "readAt" TIMESTAMP(3),
     "acknowledgedAt" TIMESTAMP(3),
     "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
     "acknowledgementNote" TEXT,
     "quizScore" DOUBLE PRECISION,
     "quizPassedAt" TIMESTAMP(3),
     "escalatedAt" TIMESTAMP(3),
     "escalatedToUserId" TEXT,
     "competencyRecordId" TEXT,
     "waivedById" TEXT,
     "waivedReason" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // A real FK: both ends are new tables, so the constraint costs nothing and
  // buys referential integrity. ON DELETE CASCADE never actually fires in
  // practice — BeOpl is a governed entity and is only ever soft-deleted — but
  // it means a hard delete forced in psql cannot leave orphan obligations.
  `DO $$ BEGIN
     ALTER TABLE "BeOplAcknowledgement"
       ADD CONSTRAINT "fk_BeOplAck_opl"
       FOREIGN KEY ("oplId") REFERENCES "BeOpl"("id") ON DELETE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // One obligation per person per REVISION. Not partial: an acknowledgement is
  // never soft-deleted, so there is no live/dead distinction to make.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BeOplAck_opl_person_rev"
     ON "BeOplAcknowledgement"("oplId", "personUserId", "oplRevision")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOplAck_person_status" ON "BeOplAcknowledgement"("personUserId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOplAck_plant_status" ON "BeOplAcknowledgement"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeOplAck_due" ON "BeOplAcknowledgement"("dueAt")`,

  // ── BePokaYoke ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BePokaYoke" (
     "id" TEXT PRIMARY KEY,
     "deviceNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "lineOrMachine" TEXT,
     "processStep" TEXT,
     "title" TEXT NOT NULL,
     "defectModePrevented" TEXT NOT NULL,
     "description" TEXT,
     "deviceType" TEXT NOT NULL,
     "approach" TEXT NOT NULL,
     "reactionMode" TEXT NOT NULL,
     "beforeCondition" TEXT,
     "afterCondition" TEXT,
     "ownerId" TEXT,
     "currency" TEXT NOT NULL DEFAULT 'INR',
     "cost" DOUBLE PRECISION,
     "installedAt" TIMESTAMP(3),
     "verificationFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
     "lastVerifiedAt" TIMESTAMP(3),
     "lastVerificationResult" TEXT,
     "nextVerificationDueAt" TIMESTAMP(3),
     "isBypassed" BOOLEAN NOT NULL DEFAULT false,
     "bypassReason" TEXT,
     "bypassedAt" TIMESTAMP(3),
     "bypassedById" TEXT,
     "bypassApprovedById" TEXT,
     "status" TEXT NOT NULL DEFAULT 'PROPOSED',
     "workflowInstanceId" TEXT,
     "rejectionReason" TEXT,
     "retiredAt" TIMESTAMP(3),
     "sourceKaizenId" TEXT,
     "sourceRcaId" TEXT,
     "createdById" TEXT NOT NULL,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BePokaYoke_plant_no"
     ON "BePokaYoke"("plantId", "deviceNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_plant_status" ON "BePokaYoke"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_plant_created" ON "BePokaYoke"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_due" ON "BePokaYoke"("plantId", "nextVerificationDueAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_bypassed" ON "BePokaYoke"("isBypassed")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_kaizen" ON "BePokaYoke"("sourceKaizenId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePokaYoke_deleted" ON "BePokaYoke"("isDeleted")`,

  // ── BePokaYokeVerification ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BePokaYokeVerification" (
     "id" TEXT PRIMARY KEY,
     "deviceId" TEXT NOT NULL,
     "plantId" TEXT NOT NULL,
     "verifiedById" TEXT NOT NULL,
     "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "result" TEXT NOT NULL,
     "note" TEXT,
     "dueAt" TIMESTAMP(3),
     "capaId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `DO $$ BEGIN
     ALTER TABLE "BePokaYokeVerification"
       ADD CONSTRAINT "fk_BePyVerification_device"
       FOREIGN KEY ("deviceId") REFERENCES "BePokaYoke"("id") ON DELETE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyVerification_device_at" ON "BePokaYokeVerification"("deviceId", "verifiedAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyVerification_plant_result" ON "BePokaYokeVerification"("plantId", "result")`,
  `CREATE INDEX IF NOT EXISTS "ix_BePyVerification_capa" ON "BePokaYokeVerification"("capaId")`,

  // ── RootCauseAnalysis extension (the BE RCA register) ───────────────────
  //
  // The BE view of RCA reuses the existing engine rather than standing up a
  // fourth register, which is what puts BE problems on the cause-to-risk map
  // and in root-cause analytics from day one. `originType` gains
  // PROCESS_PROBLEM, `primaryDomain` gains QUALITY / PRODUCTIVITY / COST and
  // `methodology` gains EIGHT_D / A3 / IS_IS_NOT — all three are TEXT columns
  // validated in Pydantic, NOT Postgres enums, so those need no DDL at all.
  //
  // Only the polymorphic pointer is a real column: an RCA whose origin is a
  // shop-floor problem points at the BeKaizen row that raised it. Deliberately
  // NOT a foreign key — the existing sourceEventId / sourceRiskId /
  // sourceLossEventId are all FK-by-value for the same reason, and matching
  // them keeps one convention on one table.
  `ALTER TABLE "RootCauseAnalysis" ADD COLUMN IF NOT EXISTS "sourceProblemId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ix_RootCauseAnalysis_source_problem"
     ON "RootCauseAnalysis"("sourceProblemId")`,
];

async function main() {
  console.log("Applying Business Excellence DDL…\n");
  let applied = 0;

  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      applied += 1;
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      // Idempotency: every statement above already tolerates re-running via
      // IF NOT EXISTS / EXCEPTION WHEN duplicate_object. Anything that still
      // throws is a real failure and must stop the run rather than leave the
      // schema half-applied.
      console.error(`  ✗ ${label}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  // Verify rather than trust. A CREATE TABLE IF NOT EXISTS reports success
  // whether it created anything or not, so confirm the tables are actually
  // present and readable before printing a green tick.
  const tables = [
    "BeKaizen",
    "BeOpl",
    "BeOplAcknowledgement",
    "BePokaYoke",
    "BePokaYokeVerification",
  ];
  console.log("\nVerifying…");
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${t}"`
    );
    console.log(`  ✓ ${t} — ${rows[0].n} row(s)`);
  }
  const rcaCol = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'RootCauseAnalysis' AND column_name = 'sourceProblemId'`
  );
  if (!rcaCol.length) {
    throw new Error(
      'RootCauseAnalysis."sourceProblemId" is missing after the ALTER — the backend ' +
        "will 500 on every RCA query once it restarts on the new models."
    );
  }
  console.log('  ✓ RootCauseAnalysis."sourceProblemId"');

  console.log(`\n✅  Business Excellence DDL applied (${applied} statements).`);
  console.log("   Next: npm run db:apply-be-permissions");
  console.log("         npx tsx prisma/seed-be-workflows.ts");
  console.log("         npx tsx prisma/seed-be-capa-sources.ts");
  console.log("   Then: npx prisma generate && restart uvicorn.");
}

main()
  .catch((e) => {
    console.error("\n❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
