// One-off DDL applier for the Form & Workflow Engine (Part A).
//
// Creates TWO new tables and alters NOTHING that already exists:
//
//   FormDefinition  — one version of one form template
//   FormRecord      — one submitted instance of a definition version
//
// Nothing else is touched, so this cannot regress a running module. In
// particular it does NOT create a second workflow engine: a FormRecord submits
// into the platform's existing WorkflowDefinition / WorkflowInstance /
// WorkflowTask tables the same way a Permit does, and attachments reuse the
// shared `Attachment` table via the evidence registry ("form_record"). Two new
// tables is the entire storage footprint of the engine.
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run. Applied through the Prisma client's connection because
// `prisma db execute` / `migrate diff` hang against the pooler here, and
// `prisma db push` would DROP the hand-DDL tables the other modules live in.
//   npx tsx prisma/apply-form-engine-ddl.ts
//
// ⚠ Ordering note: unlike apply-loto-ddl.ts, this script adds NO column to an
// existing table, so it carries no "every Permit query 500s" hazard.
//
// It is NOT, however, free of ordering risk, and the reason is worth knowing.
// The backend adds a fall-through branch to workflow_engine._sync_record_status
// that looks up a FormRecord for any module the engine has no explicit branch
// for — which is most of them. With "FormRecord" absent that SELECT would raise
// mid-transition and, unguarded, would poison the surrounding transaction and
// 500 EVERY workflow transition platform-wide. The branch is therefore wrapped
// in a SAVEPOINT so a missing table degrades to a logged warning instead. That
// guard is what makes running the backend first survivable, not an accident —
// do not remove it, and still run this script first.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = ["FormDefinition", "FormRecord"];

const STATEMENTS: string[] = [
  // ── FormDefinition ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "FormDefinition" (
     "id" TEXT PRIMARY KEY,
     "key" TEXT NOT NULL,
     "version" INTEGER NOT NULL DEFAULT 1,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "title" TEXT NOT NULL,
     "description" TEXT,
     "module" TEXT NOT NULL,
     "schemaJson" JSONB,
     "uiSchemaJson" JSONB,
     "workflowModule" TEXT,
     "workflowRecordType" TEXT,
     "numberPattern" TEXT,
     "storageBinding" JSONB,
     "orgScope" JSONB,
     "permissionPrefix" TEXT NOT NULL DEFAULT 'FORMS',
     "createdById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "publishedById" TEXT,
     "publishedAt" TIMESTAMP(3),
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  // (key, version) is the natural identity — versions are rows, not a child table.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_FormDefinition_key_version"
     ON "FormDefinition" ("key", "version")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormDefinition_key_status"
     ON "FormDefinition" ("key", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormDefinition_module_status"
     ON "FormDefinition" ("module", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormDefinition_isDeleted"
     ON "FormDefinition" ("isDeleted")`,

  // ── FormRecord ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "FormRecord" (
     "id" TEXT PRIMARY KEY,
     "definitionId" TEXT NOT NULL,
     "definitionKey" TEXT NOT NULL,
     "formVersion" INTEGER NOT NULL,
     "module" TEXT NOT NULL,
     "siteId" TEXT NOT NULL,
     "siteName" TEXT,
     "areaId" TEXT,
     "dataJson" JSONB,
     "computedJson" JSONB,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "referenceNo" TEXT,
     "workflowInstanceId" TEXT,
     "createdById" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedById" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "submittedById" TEXT,
     "submittedAt" TIMESTAMP(3),
     "closedAt" TIMESTAMP(3),
     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
     "deletedAt" TIMESTAMP(3),
     "deletedBy" TEXT,
     "deletionReason" TEXT
   )`,
  // FK to the pinned definition version. RESTRICT rather than CASCADE: losing a
  // definition must never silently take its filed records with it. (Both tables
  // are governed soft-delete anyway, so this is a second belt.)
  `DO $$ BEGIN
     ALTER TABLE "FormRecord"
       ADD CONSTRAINT "FormRecord_definitionId_fkey"
       FOREIGN KEY ("definitionId") REFERENCES "FormDefinition"("id")
       ON DELETE RESTRICT ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  // Postgres treats NULLs as distinct, so unlimited drafts may hold a NULL
  // referenceNo while two numbered records can never share one. That is exactly
  // the semantics wanted, and it needs no partial index to get it.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_FormRecord_key_reference"
     ON "FormRecord" ("definitionKey", "referenceNo")`,
  // The register's default query: one form, newest first (platform list-sort
  // convention is createdAt DESC).
  `CREATE INDEX IF NOT EXISTS "ix_FormRecord_key_created"
     ON "FormRecord" ("definitionKey", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormRecord_site_status"
     ON "FormRecord" ("siteId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormRecord_module_status"
     ON "FormRecord" ("module", "status")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormRecord_workflowInstanceId"
     ON "FormRecord" ("workflowInstanceId")`,
  `CREATE INDEX IF NOT EXISTS "ix_FormRecord_isDeleted"
     ON "FormRecord" ("isDeleted")`,
];

async function main() {
  for (const sql of STATEMENTS) {
    const label = sql.replace(/\s+/g, " ").slice(0, 78);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ok   ${label}…`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/already exists|duplicate/i.test(msg)) {
        console.log(`  skip ${label}… (already present)`);
        continue;
      }
      throw e;
    }
  }

  // Verify the tables actually landed rather than trusting that no statement
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

  // And verify the two indexes the engine's correctness actually depends on.
  // uq_FormRecord_key_reference is what makes MAX+1 numbering safe against a
  // collision; without it a duplicate reference number would insert silently.
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('uq_FormRecord_key_reference', 'uq_FormDefinition_key_version')`
  );
  if (idx.length < 2) {
    const have = idx.map((i) => i.indexname).join(", ") || "none";
    throw new Error(
      `Required unique indexes missing (have: ${have}). Reference numbering is ` +
        `not collision-safe without uq_FormRecord_key_reference — do not use the engine.`
    );
  }

  console.log(`\n✅  Form & Workflow Engine ready: ${found.size}/${TABLES.length} tables + 2 unique indexes.`);
  console.log("    No existing table was altered — no other module is affected.");
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
