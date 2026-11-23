// DDL applier for Process Hazard Analysis (HAZOP / What-If / HAZID), JSL Hisar process safety.
//
//   PhaStudy           study header, workflow, revalidation date
//   PhaTeamMember      study team (platform user or external name)
//   PhaSession         worksheet sessions (date, duration, attendees, nodes covered)
//   PhaNode            nodes (design intent, boundaries, drawing, operating parameters)
//   PhaDeviation       worksheet rows (guideword x parameter, causes, consequences,
//                      safeguards, risk before / after recommendations)
//   PhaRecommendation  recommendations, optionally tracked by a universal CAPA
//
// Six NEW tables, no ALTERs on existing tables: additive, idempotent, safe to re-run.
// Also seeds the PHA_RECOMMENDATION CAPA source type (SAFETY category) and its SLA
// profile with INSERT ... ON CONFLICT DO NOTHING, so "raise as CAPA" works. Without
// it the recommendation is still saved and the API returns a warning instead.
//
// ORDER: run this BEFORE the backend that carries app/models/pha.py serves /api/pha
// traffic. Nothing else in the backend reads these tables, so an un-migrated
// database only breaks the HAZOP screens.
//
// Also run prisma/apply-pha-permissions.ts, or every /api/pha endpoint returns 403.
//
//   npx tsx prisma/apply-pha-ddl.ts     (or: npm run db:apply-pha)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;
const NEW_ID = `md5(random()::text || clock_timestamp()::text)`;

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "PhaStudy" (
    "id" TEXT NOT NULL, "studyNo" TEXT NOT NULL, "plantId" TEXT NOT NULL, "unit" TEXT, "area" TEXT,
    "method" TEXT NOT NULL DEFAULT 'HAZOP', "title" TEXT NOT NULL, "scope" TEXT, "designIntentSummary" TEXT,
    "drawingRefs" JSONB NOT NULL DEFAULT '[]'::jsonb, "riskMatrixId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "facilitatorId" TEXT, "scribeId" TEXT, "approverId" TEXT, "mocId" TEXT,
    "submittedAt" TIMESTAMP(3), "submittedById" TEXT, "reviewComments" TEXT,
    "approvedAt" TIMESTAMP(3), "approvedById" TEXT, "revalidationDueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3), "closedById" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaStudy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhaStudy_method_chk" CHECK ("method" IN ('HAZOP','WHAT_IF','HAZID')),
    CONSTRAINT "PhaStudy_status_chk" CHECK ("status" IN ('DRAFT','IN_PROGRESS','UNDER_REVIEW','APPROVED','CLOSED')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PhaStudy_studyNo_key" ON "PhaStudy" ("studyNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaStudy_plant_status" ON "PhaStudy" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaStudy_isDeleted" ON "PhaStudy" ("isDeleted")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaStudy_revalidation" ON "PhaStudy" ("revalidationDueDate")`,

  `CREATE TABLE IF NOT EXISTS "PhaTeamMember" (
    "id" TEXT NOT NULL, "studyId" TEXT NOT NULL REFERENCES "PhaStudy"("id"),
    "userId" TEXT, "externalName" TEXT, "organisation" TEXT, "discipline" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaTeamMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhaTeamMember_who_chk" CHECK ("userId" IS NOT NULL OR "externalName" IS NOT NULL))`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaTeamMember_study" ON "PhaTeamMember" ("studyId")`,

  `CREATE TABLE IF NOT EXISTS "PhaSession" (
    "id" TEXT NOT NULL, "studyId" TEXT NOT NULL REFERENCES "PhaStudy"("id"),
    "sessionNo" INTEGER NOT NULL, "sessionDate" TIMESTAMP(3) NOT NULL, "durationMinutes" INTEGER,
    "attendeeUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb, "attendeeNames" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "nodeIds" JSONB NOT NULL DEFAULT '[]'::jsonb, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaSession_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_PhaSession_study_no" ON "PhaSession" ("studyId","sessionNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaSession_study" ON "PhaSession" ("studyId")`,

  `CREATE TABLE IF NOT EXISTS "PhaNode" (
    "id" TEXT NOT NULL, "studyId" TEXT NOT NULL REFERENCES "PhaStudy"("id"),
    "nodeNo" INTEGER NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "designIntent" TEXT,
    "boundaries" TEXT, "drawingRef" TEXT, "operatingParameters" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaNode_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaNode_study" ON "PhaNode" ("studyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaNode_isDeleted" ON "PhaNode" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "PhaDeviation" (
    "id" TEXT NOT NULL, "studyId" TEXT NOT NULL REFERENCES "PhaStudy"("id"),
    "nodeId" TEXT NOT NULL REFERENCES "PhaNode"("id"), "rowNo" INTEGER NOT NULL,
    "guideword" TEXT, "parameter" TEXT, "deviation" TEXT NOT NULL,
    "causes" TEXT, "consequences" TEXT, "safeguards" TEXT,
    "severity" INTEGER, "likelihood" INTEGER, "riskScore" INTEGER, "riskLevel" TEXT, "riskColor" TEXT,
    "residualSeverity" INTEGER, "residualLikelihood" INTEGER, "residualScore" INTEGER,
    "residualLevel" TEXT, "residualColor" TEXT, "remarks" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaDeviation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhaDeviation_rating_chk" CHECK (
      ("severity" IS NULL OR "severity" BETWEEN 1 AND 10) AND ("likelihood" IS NULL OR "likelihood" BETWEEN 1 AND 10) AND
      ("residualSeverity" IS NULL OR "residualSeverity" BETWEEN 1 AND 10) AND ("residualLikelihood" IS NULL OR "residualLikelihood" BETWEEN 1 AND 10)))`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaDeviation_node_row" ON "PhaDeviation" ("nodeId","rowNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaDeviation_study" ON "PhaDeviation" ("studyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaDeviation_isDeleted" ON "PhaDeviation" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "PhaRecommendation" (
    "id" TEXT NOT NULL, "studyId" TEXT NOT NULL REFERENCES "PhaStudy"("id"), "plantId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL REFERENCES "PhaNode"("id"), "deviationId" TEXT NOT NULL REFERENCES "PhaDeviation"("id"),
    "recNo" INTEGER NOT NULL, "text" TEXT NOT NULL, "ownerId" TEXT, "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN',
    "justification" TEXT, "closureNote" TEXT, "closedAt" TIMESTAMP(3), "closedById" TEXT,
    "capaId" TEXT, "capaNumber" TEXT, "capaState" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaRecommendation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhaRecommendation_status_chk" CHECK ("status" IN ('OPEN','IN_PROGRESS','CLOSED','REJECTED')),
    CONSTRAINT "PhaRecommendation_priority_chk" CHECK ("priority" IN ('HIGH','MEDIUM','LOW')))`,
  // R-001, R-002 ... are per study. Enforced here so two people raising a
  // recommendation at once cannot both get R-007 (soft-deleted rows keep theirs).
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_PhaRecommendation_study_no" ON "PhaRecommendation" ("studyId","recNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaRecommendation_study" ON "PhaRecommendation" ("studyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaRecommendation_plant_status" ON "PhaRecommendation" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaRecommendation_deviation" ON "PhaRecommendation" ("deviationId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PhaRecommendation_capa" ON "PhaRecommendation" ("capaId")`,

  // ── CAPA source type for recommendations (app/services/pha.py CAPA_SOURCE_CODE) ──
  `INSERT INTO "CapaSourceType" ("id","code","name","description","categoryId","parentModuleLive","parentModuleName","sortOrder","isActive","createdAt","updatedAt")
   SELECT ${NEW_ID}, 'PHA_RECOMMENDATION', 'PHA / HAZOP Recommendation',
          'A recommendation from a HAZOP, What-If or HAZID study, tracked to closure on the universal CAPA engine.',
          c."id", true, 'PHA', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   FROM "CapaSourceCategory" c WHERE c."code" = 'SAFETY'
   ON CONFLICT DO NOTHING`,
  // Process safety recommendations reduce major-accident risk but are often
  // engineering changes (trips, relief, MOC): a realistic closure clock, not an incident's.
  `INSERT INTO "CapaSlaProfile" ("id","code","sourceTypeCode","severity","initialResponseHours","rcaDueDays","actionsPlannedDueDays","closureTargetDays","recurrenceCheckDays","isActive","createdAt","updatedAt")
   VALUES (${NEW_ID}, 'PHA_RECOMMENDATION_DEF', 'PHA_RECOMMENDATION', NULL, 72, 30, 45, 180, 180, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ON CONFLICT DO NOTHING`,
];

const TABLES = ["PhaStudy", "PhaTeamMember", "PhaSession", "PhaNode", "PhaDeviation", "PhaRecommendation"];

async function main() {
  console.log("Applying PHA / HAZOP DDL…\n");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }
  // Verify rather than trust: IF NOT EXISTS / ON CONFLICT report success either way.
  console.log("\nVerifying…");
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${t}"`);
    console.log(`  ${t}: ${r[0].c} rows`);
  }
  const src = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "CapaSourceType" WHERE "code" = 'PHA_RECOMMENDATION'`
  );
  if (Number(src[0].n) === 0) {
    console.warn("\n  ⚠ PHA_RECOMMENDATION CAPA source type was NOT created (no SAFETY CapaSourceCategory?). Run seed-capa-masters first;");
    console.warn("    until then 'raise as CAPA' saves the recommendation and returns a warning.");
  } else {
    console.log("  CapaSourceType PHA_RECOMMENDATION: present");
  }
  const rm = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "RiskMatrix" WHERE "isActive" = true`);
  if (Number(rm[0].n) === 0) {
    console.warn("  ⚠ No active RiskMatrix: studies will rate on the built-in default 5 x 5.");
  }
  console.log("\n✅  PHA tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
