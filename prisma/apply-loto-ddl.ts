// One-off DDL applier for the LOTO (Lockout/Tagout) module.
//
// Creates nine NEW tables and adds ONE nullable column to the existing Permit
// table ("lotoExecutionId"). Nothing else existing is altered, so this cannot
// regress a running module — and the Permit column is nullable with no default,
// so every existing permit stays valid and PTW keeps working before the backend
// is restarted.
//
//   LotoProcedure             — the reusable library entry
//   LotoEnergySource          — energy sources on a procedure
//   LotoIsolationPoint        — ordered isolation points
//   LotoHardwareRequirement   — locks/tags/hasps the job needs
//   LotoVerificationStep      — ordered zero-energy checklist
//   LotoProcedureVersion      — immutable per-version body snapshot
//   LotoExecution             — one actual lockout event
//   LotoExecutionParticipant  — per-person lock apply/remove confirmation
//   LotoVerificationRecord    — completed verification steps on an execution
//   LotoReviewLog             — scheduled evaluation-cycle audit trail
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run. Applied through the Prisma client's connection because
// `prisma db execute` / `migrate diff` hang against the pooler here, and
// `prisma db push` would DROP the hand-DDL tables the other modules live in.
//   npx tsx prisma/apply-loto-ddl.ts
//
// ⚠ Ordering note: the backend's SQLAlchemy models add `lotoExecutionId` to the
// mapped Permit entity. Until this script has run, EVERY Permit query 500s on
// "column Permit.lotoExecutionId does not exist" — run this BEFORE restarting
// uvicorn on the new code, not after.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  // ── LotoProcedure ──
  `CREATE TABLE IF NOT EXISTS "LotoProcedure" (
     "id" TEXT PRIMARY KEY,
     "procedureCode" TEXT NOT NULL,
     "siteId" TEXT NOT NULL,
     "siteName" TEXT,
     "area" TEXT,
     "areaId" TEXT,
     "equipmentId" TEXT,
     "equipmentName" TEXT,
     "equipmentTag" TEXT,
     "title" TEXT NOT NULL,
     "description" TEXT,
     "status" TEXT NOT NULL DEFAULT 'draft',
     "version" INTEGER NOT NULL DEFAULT 1,
     "publishedVersionId" TEXT,
     "qrCodeToken" TEXT,
     "reviewFrequencyMonths" INTEGER NOT NULL DEFAULT 12,
     "lastReviewedAt" TIMESTAMP(3),
     "lastReviewedById" TEXT,
     "nextReviewDueAt" TIMESTAMP(3),
     "createdById" TEXT,
     "updatedById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  // procedureCode is unique PER SITE, and only among LIVE rows — a soft-deleted
  // procedure must not permanently burn its code. Prisma cannot express a
  // partial unique index, which is why the model declares only @@index.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_LotoProcedure_site_code"
     ON "LotoProcedure"("siteId", "procedureCode") WHERE "isDeleted" = false`,
  // The QR token is the public field-access key: globally unique, and unique
  // even across soft-deleted rows so a withdrawn procedure's token can never be
  // re-issued to a different piece of equipment.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_LotoProcedure_qrCodeToken"
     ON "LotoProcedure"("qrCodeToken") WHERE "qrCodeToken" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedure_site_status" ON "LotoProcedure"("siteId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedure_equipmentId" ON "LotoProcedure"("equipmentId")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedure_review_due" ON "LotoProcedure"("nextReviewDueAt", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedure_isDeleted" ON "LotoProcedure"("isDeleted")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedure_createdAt" ON "LotoProcedure"("createdAt")`,

  // ── LotoEnergySource ──
  `CREATE TABLE IF NOT EXISTS "LotoEnergySource" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "sequence" INTEGER NOT NULL DEFAULT 0,
     "energyType" TEXT NOT NULL,
     "magnitude" TEXT,
     "locationDescription" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoEnergySource_proc_seq" ON "LotoEnergySource"("procedureId", "sequence")`,

  // ── LotoIsolationPoint ──
  `CREATE TABLE IF NOT EXISTS "LotoIsolationPoint" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "sequence" INTEGER NOT NULL,
     "energySourceId" TEXT REFERENCES "LotoEnergySource"("id") ON DELETE SET NULL,
     "location" TEXT NOT NULL,
     "isolationMethod" TEXT NOT NULL,
     "lockType" TEXT,
     "verificationMethod" TEXT,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoIsolationPoint_proc_seq" ON "LotoIsolationPoint"("procedureId", "sequence")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoIsolationPoint_energySourceId" ON "LotoIsolationPoint"("energySourceId")`,

  // ── LotoHardwareRequirement ──
  `CREATE TABLE IF NOT EXISTS "LotoHardwareRequirement" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "itemType" TEXT NOT NULL,
     "description" TEXT,
     "quantityRequired" INTEGER NOT NULL DEFAULT 1,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoHardwareRequirement_proc" ON "LotoHardwareRequirement"("procedureId")`,

  // ── LotoVerificationStep ──
  `CREATE TABLE IF NOT EXISTS "LotoVerificationStep" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "sequence" INTEGER NOT NULL,
     "stepText" TEXT NOT NULL,
     "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
     "requiresSignoff" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoVerificationStep_proc_seq" ON "LotoVerificationStep"("procedureId", "sequence")`,

  // ── LotoProcedureVersion ──
  `CREATE TABLE IF NOT EXISTS "LotoProcedureVersion" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "version" INTEGER NOT NULL,
     "snapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
     "isPublished" BOOLEAN NOT NULL DEFAULT false,
     "publishedAt" TIMESTAMP(3),
     "publishedById" TEXT,
     "supersededAt" TIMESTAMP(3),
     "changeSummary" TEXT,
     "changeType" TEXT NOT NULL DEFAULT 'MATERIAL',
     "createdById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // The version number is the audit anchor — one row per (procedure, version),
  // enforced in the DB so a concurrent double-publish cannot mint two v3s.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_LotoProcedureVersion_proc_version"
     ON "LotoProcedureVersion"("procedureId", "version")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoProcedureVersion_proc_published"
     ON "LotoProcedureVersion"("procedureId", "isPublished")`,

  // ── LotoExecution ──
  `CREATE TABLE IF NOT EXISTS "LotoExecution" (
     "id" TEXT PRIMARY KEY,
     "number" TEXT NOT NULL,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id"),
     "procedureVersionId" TEXT REFERENCES "LotoProcedureVersion"("id"),
     "procedureVersionSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
     "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
     "ptwId" TEXT,
     "ptwNumber" TEXT,
     "siteId" TEXT NOT NULL,
     "siteName" TEXT,
     "initiatedById" TEXT NOT NULL,
     "initiatedByName" TEXT,
     "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isGroupLockout" BOOLEAN NOT NULL DEFAULT false,
     "status" TEXT NOT NULL DEFAULT 'locks_applied',
     "workStartedAt" TIMESTAMP(3),
     "locksRemovedAt" TIMESTAMP(3),
     "closedById" TEXT,
     "closedAt" TIMESTAMP(3),
     "closureNotes" TEXT,
     "abortedById" TEXT,
     "abortedAt" TIMESTAMP(3),
     "abortReason" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  // Unique across EVERY row, soft-deleted included: the number is a property of
  // the table, not of what a caller may see. The generator reads max+1 with the
  // soft-delete filter disabled for exactly this reason (never count+1 — that
  // pattern re-issued live numbers and 500'd Schedule Audit).
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_LotoExecution_number" ON "LotoExecution"("number")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecution_proc_status" ON "LotoExecution"("procedureId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecution_site_status" ON "LotoExecution"("siteId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecution_ptwId" ON "LotoExecution"("ptwId")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecution_createdAt" ON "LotoExecution"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecution_isDeleted" ON "LotoExecution"("isDeleted")`,

  // ── LotoExecutionParticipant ──
  `CREATE TABLE IF NOT EXISTS "LotoExecutionParticipant" (
     "id" TEXT PRIMARY KEY,
     "executionId" TEXT NOT NULL REFERENCES "LotoExecution"("id") ON DELETE CASCADE,
     "userId" TEXT NOT NULL,
     "userName" TEXT,
     "userRole" TEXT,
     "participantRole" TEXT NOT NULL DEFAULT 'secondary',
     "assignedIsolationPointIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
     "lockTagNumber" TEXT,
     "lockAppliedAt" TIMESTAMP(3),
     "lockAppliedConfirmed" BOOLEAN NOT NULL DEFAULT false,
     "lockRemovedAt" TIMESTAMP(3),
     "lockRemovedConfirmed" BOOLEAN NOT NULL DEFAULT false,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // One row per person per lockout. Without this a double-POST could create two
  // participant rows for the same user, and "all confirmed" would then be
  // satisfiable while a real person's lock is still on the equipment.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_LotoExecutionParticipant_exec_user"
     ON "LotoExecutionParticipant"("executionId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecutionParticipant_exec" ON "LotoExecutionParticipant"("executionId")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoExecutionParticipant_user" ON "LotoExecutionParticipant"("userId")`,

  // ── LotoVerificationRecord ──
  `CREATE TABLE IF NOT EXISTS "LotoVerificationRecord" (
     "id" TEXT PRIMARY KEY,
     "executionId" TEXT NOT NULL REFERENCES "LotoExecution"("id") ON DELETE CASCADE,
     "stepId" TEXT NOT NULL,
     "sequence" INTEGER NOT NULL DEFAULT 0,
     "stepText" TEXT,
     "completedById" TEXT NOT NULL,
     "completedByName" TEXT,
     "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "photoUrl" TEXT,
     "signoff" BOOLEAN NOT NULL DEFAULT false,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_LotoVerificationRecord_exec_step"
     ON "LotoVerificationRecord"("executionId", "stepId")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoVerificationRecord_exec" ON "LotoVerificationRecord"("executionId")`,

  // ── LotoReviewLog ──
  `CREATE TABLE IF NOT EXISTS "LotoReviewLog" (
     "id" TEXT PRIMARY KEY,
     "procedureId" TEXT NOT NULL REFERENCES "LotoProcedure"("id") ON DELETE CASCADE,
     "status" TEXT NOT NULL DEFAULT 'pending',
     "dueAt" TIMESTAMP(3) NOT NULL,
     "reviewedById" TEXT,
     "reviewedByName" TEXT,
     "reviewedAt" TIMESTAMP(3),
     "outcome" TEXT,
     "notes" TEXT,
     "newVersionId" TEXT,
     "notifiedAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // At most ONE pending review per procedure. The daily scan runs unconditionally
  // over every due procedure; without this constraint a scan that ran twice
  // before a human acted would stack duplicate review rows and notify twice.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_LotoReviewLog_one_pending"
     ON "LotoReviewLog"("procedureId") WHERE "status" = 'pending'`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoReviewLog_proc_status" ON "LotoReviewLog"("procedureId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_LotoReviewLog_status_due" ON "LotoReviewLog"("status", "dueAt")`,

  // ── Permit cross-reference (spec §6 — the ONLY PTW-side schema change) ──
  // Nullable, no default, no constraint on existing rows: every permit already
  // in the table remains valid and PTW behaviour is unchanged until someone
  // explicitly links a lockout.
  `ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "lotoExecutionId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ix_Permit_lotoExecutionId" ON "Permit"("lotoExecutionId")`,
];

const TABLES = [
  "LotoProcedure",
  "LotoEnergySource",
  "LotoIsolationPoint",
  "LotoHardwareRequirement",
  "LotoVerificationStep",
  "LotoProcedureVersion",
  "LotoExecution",
  "LotoExecutionParticipant",
  "LotoVerificationRecord",
  "LotoReviewLog",
];

async function main() {
  console.log("Applying LOTO (Lockout/Tagout) DDL…");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 84);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  // Verify every table actually landed rather than trusting that no statement
  // threw — CREATE TABLE IF NOT EXISTS is silent about what it skipped.
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    TABLES
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = TABLES.filter((t) => !found.has(t));
  if (missing.length) {
    throw new Error(`Tables missing after apply: ${missing.join(", ")}`);
  }

  // And verify the Permit column specifically — this one is the regression risk.
  // The backend's mapped Permit entity now declares lotoExecutionId, so if this
  // column is absent EVERY permit query 500s, not just the LOTO ones.
  const col = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Permit'
        AND column_name = 'lotoExecutionId'`
  );
  if (col.length === 0) {
    throw new Error('Permit."lotoExecutionId" is missing after apply — do NOT restart uvicorn.');
  }

  console.log(`✅  LOTO ready: ${found.size}/${TABLES.length} tables + Permit.lotoExecutionId present.`);
  console.log("    Next: npx tsx prisma/apply-loto-permissions.ts");
  console.log("          npx prisma generate  → then restart uvicorn.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
