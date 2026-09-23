// One-off DDL applier for Business Excellence Phase 2.
//
// Creates NINE new tables. Nothing existing is altered — no ALTER, no new column
// on any live table — so this cannot regress a running module. That is a
// deliberate difference from apply-be-ddl.ts, which had to add
// RootCauseAnalysis."sourceProblemId" and therefore had to run before the
// backend restarted.
//
//   BeSuggestion         — the Suggestion Scheme register (§3)
//   BeQccTeam            — a standing quality circle (§6)
//   BeQccTeamMember      — one person's membership, over a period
//   BeQccProject         — one stage-gated circle project
//   BeQccProjectStage    — one gate, and the sign-off that opened the next
//   BeSip                — a sponsor-backed improvement project (§7)
//   BeSipMilestone       — one tracked deliverable on a SIP
//   BeBenefit            — the shared benefit line, all six workflows (§8)
//   BeBenefitReading     — append-only actual-vs-target measurements
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run. Applied through the Prisma client's connection because
// `prisma db execute` / `migrate diff` hang against the pooler here, and
// `prisma db push` would DROP the hand-DDL tables the other modules live in.
//   npx tsx prisma/apply-be-p2-ddl.ts     (or: npm run db:apply-be-p2)
//
// ⚠ ORDERING — RUN THIS BEFORE RESTARTING UVICORN ON THE NEW CODE.
// Nothing existing changes, so an old backend keeps working against the new
// tables. But the NEW backend maps nine entities that do not exist until this
// runs, and services/rca_core.py now resolves a PROCESS_PROBLEM RCA across
// BeKaizen → BeQccProject → BeSip. A Kaizen id still returns before any Phase 2
// table is touched, so Kaizen RCAs survive an un-applied deploy — but every
// /api/be/suggestions, /qcc, /sip and /benefits path will 500 until this runs.
//
// ⚠ The record-number unique indexes are PARTIAL (WHERE isDeleted = false) and
// Prisma cannot express that, which is why they are created here. A soft-deleted
// record still owns its number — services/business_excellence.py's
// next_record_number() scans with include_deleted=True — but must not
// permanently block the code from being re-used at a different plant.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Columns every governed BE register carries. Repeated verbatim rather than
// interpolated so a reader can see the actual CREATE TABLE, which is what they
// will be comparing against information_schema when something is wrong.
const STATEMENTS: string[] = [
  // ── BeSuggestion ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeSuggestion" (
     "id" TEXT PRIMARY KEY,
     "suggestionNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "title" TEXT NOT NULL,
     "category" TEXT NOT NULL,
     "description" TEXT NOT NULL,
     "expectedBenefit" TEXT,
     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
     "screeningOutcome" TEXT,
     "screeningNote" TEXT,
     "screenedById" TEXT,
     "screenedAt" TIMESTAMP(3),
     "duplicateOfSuggestionId" TEXT,
     "decision" TEXT,
     "decisionRationale" TEXT,
     "decidedById" TEXT,
     "decidedAt" TIMESTAMP(3),
     "deferredUntil" TIMESTAMP(3),
     "ownerId" TEXT,
     "targetDate" TIMESTAMP(3),
     "implementedAt" TIMESTAMP(3),
     "implementationNote" TEXT,
     "incentiveStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
     "incentivePoints" INTEGER,
     "incentiveAmount" DOUBLE PRECISION,
     "currency" TEXT NOT NULL DEFAULT 'INR',
     "incentiveNote" TEXT,
     "incentiveApprovedById" TEXT,
     "incentiveApprovedAt" TIMESTAMP(3),
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "workflowInstanceId" TEXT,
     "rejectionReason" TEXT,
     "closedAt" TIMESTAMP(3),
     "convertedToKaizenId" TEXT,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeSuggestion_plant_no"
     ON "BeSuggestion"("plantId", "suggestionNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSuggestion_plant_status" ON "BeSuggestion"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSuggestion_plant_created" ON "BeSuggestion"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSuggestion_source" ON "BeSuggestion"("sourceModule", "sourceRecordId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSuggestion_creator" ON "BeSuggestion"("createdById")`,

  // ── BeQccTeam ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeQccTeam" (
     "id" TEXT PRIMARY KEY,
     "teamNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "name" TEXT NOT NULL,
     "department" TEXT,
     "motto" TEXT,
     "leaderId" TEXT,
     "facilitatorId" TEXT,
     "formedOn" TIMESTAMP(3),
     "disbandedOn" TIMESTAMP(3),
     "status" TEXT NOT NULL DEFAULT 'FORMING',
     "createdById" TEXT NOT NULL,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeQccTeam_plant_no"
     ON "BeQccTeam"("plantId", "teamNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccTeam_plant_status" ON "BeQccTeam"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccTeam_plant_created" ON "BeQccTeam"("plantId", "createdAt")`,

  // ── BeQccTeamMember ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeQccTeamMember" (
     "id" TEXT PRIMARY KEY,
     "teamId" TEXT NOT NULL REFERENCES "BeQccTeam"("id") ON DELETE CASCADE,
     "userId" TEXT NOT NULL,
     "memberRole" TEXT NOT NULL DEFAULT 'MEMBER',
     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "leftAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // One ACTIVE membership per person per circle. Partial on leftAt IS NULL so a
  // person may rejoin a circle they previously left — Prisma cannot express it.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeQccMember_active"
     ON "BeQccTeamMember"("teamId", "userId") WHERE "leftAt" IS NULL`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccMember_team_user" ON "BeQccTeamMember"("teamId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccMember_user" ON "BeQccTeamMember"("userId")`,

  // ── BeQccProject ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeQccProject" (
     "id" TEXT PRIMARY KEY,
     "projectNo" TEXT,
     "teamId" TEXT NOT NULL REFERENCES "BeQccTeam"("id") ON DELETE RESTRICT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "title" TEXT NOT NULL,
     "category" TEXT NOT NULL,
     "problemStatement" TEXT NOT NULL,
     "selectionRationale" TEXT,
     "priorityScore" DOUBLE PRECISION,
     "scope" TEXT,
     "baselineMetric" TEXT,
     "baselineValue" DOUBLE PRECISION,
     "targetValue" DOUBLE PRECISION,
     "metricUnit" TEXT,
     "targetDate" TIMESTAMP(3),
     "charteredAt" TIMESTAMP(3),
     "methodology" TEXT NOT NULL DEFAULT 'DMAIC',
     "rcaId" TEXT,
     "evaluationRubric" JSONB,
     "evaluationScore" DOUBLE PRECISION,
     "evaluatedById" TEXT,
     "evaluatedAt" TIMESTAMP(3),
     "presentedAt" TIMESTAMP(3),
     "presentationRef" TEXT,
     "actualValue" DOUBLE PRECISION,
     "completedAt" TIMESTAMP(3),
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeQccProject_plant_no"
     ON "BeQccProject"("plantId", "projectNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccProject_plant_status" ON "BeQccProject"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccProject_plant_created" ON "BeQccProject"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccProject_team" ON "BeQccProject"("teamId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccProject_rca" ON "BeQccProject"("rcaId")`,

  // ── BeQccProjectStage ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeQccProjectStage" (
     "id" TEXT PRIMARY KEY,
     "projectId" TEXT NOT NULL REFERENCES "BeQccProject"("id") ON DELETE CASCADE,
     "plantId" TEXT NOT NULL,
     "stage" TEXT NOT NULL,
     "sequence" INTEGER NOT NULL DEFAULT 0,
     "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
     "summary" TEXT,
     "startedAt" TIMESTAMP(3),
     "targetDate" TIMESTAMP(3),
     "signedOffById" TEXT,
     "signedOffAt" TIMESTAMP(3),
     "signOffNote" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "uq_BeQccStage_project_stage" UNIQUE ("projectId", "stage")
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccStage_project_seq" ON "BeQccProjectStage"("projectId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeQccStage_status" ON "BeQccProjectStage"("status")`,

  // ── BeSip ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeSip" (
     "id" TEXT PRIMARY KEY,
     "sipNo" TEXT,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "areaName" TEXT,
     "department" TEXT,
     "title" TEXT NOT NULL,
     "category" TEXT NOT NULL,
     "scope" TEXT NOT NULL,
     "problemStatement" TEXT,
     "sponsorId" TEXT,
     "ownerId" TEXT,
     "metricName" TEXT,
     "metricUnit" TEXT,
     "baselineValue" DOUBLE PRECISION,
     "targetValue" DOUBLE PRECISION,
     "latestActualValue" DOUBLE PRECISION,
     "latestReadingAt" TIMESTAMP(3),
     "startDate" TIMESTAMP(3),
     "targetDate" TIMESTAMP(3),
     "completedAt" TIMESTAMP(3),
     "feasibilityScore" DOUBLE PRECISION,
     "impactScore" DOUBLE PRECISION,
     "priorityScore" DOUBLE PRECISION,
     "lessonsLearned" TEXT,
     "lessonsLearnedOplId" TEXT,
     "currency" TEXT NOT NULL DEFAULT 'INR',
     "investmentCost" DOUBLE PRECISION,
     "rcaId" TEXT,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "workflowInstanceId" TEXT,
     "rejectionReason" TEXT,
     "holdReason" TEXT,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeSip_plant_no"
     ON "BeSip"("plantId", "sipNo") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSip_plant_status" ON "BeSip"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSip_plant_created" ON "BeSip"("plantId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSip_owner" ON "BeSip"("ownerId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSip_priority" ON "BeSip"("priorityScore")`,

  // ── BeSipMilestone ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeSipMilestone" (
     "id" TEXT PRIMARY KEY,
     "sipId" TEXT NOT NULL REFERENCES "BeSip"("id") ON DELETE CASCADE,
     "plantId" TEXT NOT NULL,
     "name" TEXT NOT NULL,
     "description" TEXT,
     "sequence" INTEGER NOT NULL DEFAULT 0,
     "ownerId" TEXT,
     "plannedDate" TIMESTAMP(3),
     "revisedDate" TIMESTAMP(3),
     "actualDate" TIMESTAMP(3),
     "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
     "progressPercent" INTEGER,
     "note" TEXT,
     "createdById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSipMilestone_sip_seq" ON "BeSipMilestone"("sipId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSipMilestone_due" ON "BeSipMilestone"("plantId", "plannedDate")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeSipMilestone_owner" ON "BeSipMilestone"("ownerId")`,

  // ── BeBenefit ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeBenefit" (
     "id" TEXT PRIMARY KEY,
     "plantId" TEXT NOT NULL,
     "siteName" TEXT,
     "sourceType" TEXT NOT NULL,
     "sourceId" TEXT NOT NULL,
     "sourceRef" TEXT,
     "benefitType" TEXT NOT NULL,
     "valueKind" TEXT NOT NULL DEFAULT 'FINANCIAL',
     "currency" TEXT,
     "unit" TEXT,
     "projectedValue" DOUBLE PRECISION,
     "realizedValue" DOUBLE PRECISION,
     "annualisedValue" DOUBLE PRECISION,
     "validationWindowMonths" INTEGER,
     "validationDueAt" TIMESTAMP(3),
     "validatedById" TEXT,
     "validatedAt" TIMESTAMP(3),
     "validationNote" TEXT,
     "validatingAuthorityId" TEXT,
     "status" TEXT NOT NULL DEFAULT 'PROJECTED',
     "note" TEXT,
     "createdById" TEXT NOT NULL,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  // One benefit line per (record, benefit type). A project that saved money AND
  // cut defects gets two rows, which is right; two COST_SAVING rows on one
  // project is double-counting on the §8 rollup, and this refuses it.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BeBenefit_source_type"
     ON "BeBenefit"("sourceType", "sourceId", "benefitType") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefit_source" ON "BeBenefit"("sourceType", "sourceId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefit_plant_status" ON "BeBenefit"("plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefit_due" ON "BeBenefit"("plantId", "validationDueAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefit_authority" ON "BeBenefit"("validatingAuthorityId")`,

  // ── BeBenefitReading ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "BeBenefitReading" (
     "id" TEXT PRIMARY KEY,
     "benefitId" TEXT NOT NULL REFERENCES "BeBenefit"("id") ON DELETE CASCADE,
     "plantId" TEXT NOT NULL,
     "readingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "periodLabel" TEXT,
     "actualValue" DOUBLE PRECISION NOT NULL,
     "targetValue" DOUBLE PRECISION,
     "note" TEXT,
     "recordedById" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefitReading_benefit_at" ON "BeBenefitReading"("benefitId", "readingAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_BeBenefitReading_plant" ON "BeBenefitReading"("plantId")`,
];

const TABLES = [
  "BeSuggestion",
  "BeQccTeam",
  "BeQccTeamMember",
  "BeQccProject",
  "BeQccProjectStage",
  "BeSip",
  "BeSipMilestone",
  "BeBenefit",
  "BeBenefitReading",
];

async function main() {
  console.log("Applying Business Excellence Phase 2 DDL…\n");
  let applied = 0;

  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      applied += 1;
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      // Idempotency: every statement above already tolerates re-running via
      // IF NOT EXISTS. Anything that still throws is a real failure and must
      // stop the run rather than leave the schema half-applied.
      console.error(`  ✗ ${label}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  // Verify rather than trust. CREATE TABLE IF NOT EXISTS reports success whether
  // it created anything or not, so confirm the tables are present and readable
  // before printing a green tick.
  console.log("\nVerifying…");
  for (const t of TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${t}"`
    );
    console.log(`  ✓ ${t} — ${rows[0].n} row(s)`);
  }

  // The partial indexes are the part most likely to be silently missing, since
  // a re-run of an older version of this file would create the tables without
  // them and every statement would still report success.
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'ux_BeSuggestion_plant_no','ux_BeQccTeam_plant_no','ux_BeQccProject_plant_no',
        'ux_BeSip_plant_no','ux_BeBenefit_source_type','ux_BeQccMember_active')`
  );
  const found = new Set(idx.map((r) => r.indexname));
  const missing = [
    "ux_BeSuggestion_plant_no",
    "ux_BeQccTeam_plant_no",
    "ux_BeQccProject_plant_no",
    "ux_BeSip_plant_no",
    "ux_BeBenefit_source_type",
    "ux_BeQccMember_active",
  ].filter((n) => !found.has(n));
  if (missing.length) {
    throw new Error(
      `Partial unique indexes missing: ${missing.join(", ")}. Record numbering ` +
        `will collide and benefit lines will double-count without them.`
    );
  }
  console.log(`  ✓ 6 partial unique indexes`);

  console.log(`\n✅  Business Excellence Phase 2 DDL applied (${applied} statements).`);
  console.log("   Next: npx tsx prisma/apply-be-p2-permissions.ts");
  console.log("         npx tsx prisma/seed-be-p2-workflows.ts");
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
