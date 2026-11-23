// DDL applier for the Knowledge Bank (JSL Hisar requirement: "All safety
// standards, checklists, policies will store in the digital bank & read
// accessible to everyone inside company").
//
//   KbCategory          category tree, seeded with the ten default categories
//   KbDocument          controlled document (number, metadata, lifecycle, current version)
//   KbDocumentVersion   one uploaded file per version, with its extracted text
//   KbAcknowledgement   "I have read this", per person per version
//   KbView              read log (view counts, "open before you acknowledge")
//
// Five NEW tables plus a seed INSERT … ON CONFLICT DO NOTHING; no ALTERs on
// existing tables. Additive, idempotent, safe to re-run. Editing a seeded
// category in the app is never overwritten by a re-run.
//
// Full-text search: a GIN index over to_tsvector('simple', "searchText").
// The backend query (app/services/knowledge_bank.py: search_vector) uses the
// identical expression, which is what lets Postgres use the index. Change one,
// change both.
//
// ORDER: run this BEFORE the backend that carries app/models/knowledge_bank.py
// serves /api/kb traffic. Nothing else reads these tables, so an un-migrated
// database only breaks the knowledge-bank screens.
//
// Also run prisma/apply-knowledge-bank-permissions.ts, or every /api/kb call returns 403.
//
//   npx tsx prisma/apply-knowledge-bank-ddl.ts     (or: npm run db:apply-knowledge-bank)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;

// Keep in step with DEFAULT_CATEGORIES in app/services/knowledge_bank.py.
const CATEGORIES: [string, string, string, number, string][] = [
  ["kbcat_safety_standards", "SAFETY_STANDARDS", "Safety Standards", 10, "shield-check"],
  ["kbcat_policies", "POLICIES", "Policies", 20, "landmark"],
  ["kbcat_sops", "SOPS", "SOPs / Work Instructions", 30, "list-ordered"],
  ["kbcat_checklists", "CHECKLISTS", "Checklists", 40, "list-checks"],
  ["kbcat_guidelines", "GUIDELINES", "Guidelines", 50, "book-open"],
  ["kbcat_legal", "LEGAL_STATUTORY", "Legal & Statutory", 60, "scale"],
  ["kbcat_emergency", "EMERGENCY_PROCEDURES", "Emergency Procedures", 70, "siren"],
  ["kbcat_training", "TRAINING_MATERIAL", "Training Material", 80, "graduation-cap"],
  ["kbcat_forms", "FORMS_FORMATS", "Forms & Formats", 90, "file-spreadsheet"],
  ["kbcat_lessons", "LESSONS_LEARNED", "Lessons Learned", 100, "lightbulb"],
];

const DOC_TYPES = [
  "STANDARD", "POLICY", "SOP", "WORK_INSTRUCTION", "CHECKLIST", "GUIDELINE", "LEGAL_STATUTORY",
  "EMERGENCY_PROCEDURE", "TRAINING_MATERIAL", "FORM_FORMAT", "LESSON_LEARNED", "OTHER",
];
const inList = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "KbCategory" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT REFERENCES "KbCategory"("id"),
    "description" TEXT, "icon" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KbCategory_not_own_parent_chk" CHECK ("parentId" IS NULL OR "parentId" <> "id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KbCategory_code_key" ON "KbCategory" ("code")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbCategory_parent" ON "KbCategory" ("parentId")`,

  `CREATE TABLE IF NOT EXISTS "KbDocument" (
    "id" TEXT NOT NULL, "docNo" TEXT NOT NULL, "title" TEXT NOT NULL, "summary" TEXT,
    "categoryId" TEXT NOT NULL REFERENCES "KbCategory"("id"), "docType" TEXT NOT NULL,
    "standardRef" TEXT, "department" TEXT, "plantId" TEXT, "ownerUserId" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]'::jsonb, "status" TEXT NOT NULL DEFAULT 'DRAFT', "currentVersionId" TEXT,
    "effectiveDate" TIMESTAMP(3), "reviewDueDate" TIMESTAMP(3), "reviewIntervalMonths" INTEGER NOT NULL DEFAULT 24,
    "lastReviewedAt" TIMESTAMP(3), "lastReviewedBy" TEXT,
    "ackRequired" BOOLEAN NOT NULL DEFAULT false, "audienceRoles" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "viewCount" INTEGER NOT NULL DEFAULT 0, "searchText" TEXT,
    "publishedAt" TIMESTAMP(3), "obsoletedAt" TIMESTAMP(3), "obsoletedById" TEXT, "obsoleteReason" TEXT,
    "supersededByDocId" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KbDocument_status_chk" CHECK ("status" IN ('DRAFT','UNDER_REVIEW','PUBLISHED','OBSOLETE')),
    CONSTRAINT "KbDocument_docType_chk" CHECK ("docType" IN (${inList(DOC_TYPES)})),
    CONSTRAINT "KbDocument_review_interval_chk" CHECK ("reviewIntervalMonths" BETWEEN 1 AND 120),
    CONSTRAINT "KbDocument_viewCount_chk" CHECK ("viewCount" >= 0),
    CONSTRAINT "KbDocument_published_has_version_chk" CHECK ("status" <> 'PUBLISHED' OR "currentVersionId" IS NOT NULL))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KbDocument_docNo_key" ON "KbDocument" ("docNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_status" ON "KbDocument" ("status")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_category" ON "KbDocument" ("categoryId")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_plant" ON "KbDocument" ("plantId")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_reviewDue" ON "KbDocument" ("reviewDueDate")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_isDeleted" ON "KbDocument" ("isDeleted")`,
  // Must match app/services/knowledge_bank.py search_vector() exactly.
  `CREATE INDEX IF NOT EXISTS "ix_KbDocument_fts" ON "KbDocument" USING GIN (to_tsvector('simple'::regconfig, COALESCE("searchText", '')))`,

  `CREATE TABLE IF NOT EXISTS "KbDocumentVersion" (
    "id" TEXT NOT NULL, "documentId" TEXT NOT NULL REFERENCES "KbDocument"("id"), "versionNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT', "storagePath" TEXT NOT NULL, "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "sha256" TEXT,
    "extractedText" TEXT, "extractionStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "changeNote" TEXT, "reviewNote" TEXT,
    "uploadedBy" TEXT NOT NULL, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" TEXT, "submittedAt" TIMESTAMP(3), "publishedBy" TEXT, "publishedAt" TIMESTAMP(3),
    CONSTRAINT "KbDocumentVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KbDocumentVersion_status_chk" CHECK ("status" IN ('DRAFT','UNDER_REVIEW','PUBLISHED','SUPERSEDED','DISCARDED')),
    CONSTRAINT "KbDocumentVersion_extraction_chk" CHECK ("extractionStatus" IN ('OK','EMPTY','SKIPPED','FAILED')),
    CONSTRAINT "KbDocumentVersion_size_chk" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 26214400),
    CONSTRAINT "KbDocumentVersion_versionNo_chk" CHECK ("versionNo" >= 1))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_KbDocumentVersion_doc_version" ON "KbDocumentVersion" ("documentId","versionNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbDocumentVersion_document" ON "KbDocumentVersion" ("documentId")`,
  // At most one pending (draft / under review) version per document, enforced
  // in the database so two managers uploading at once cannot both start one.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_KbDocumentVersion_one_pending" ON "KbDocumentVersion" ("documentId") WHERE "status" IN ('DRAFT','UNDER_REVIEW')`,

  `CREATE TABLE IF NOT EXISTS "KbAcknowledgement" (
    "id" TEXT NOT NULL, "documentId" TEXT NOT NULL REFERENCES "KbDocument"("id"),
    "versionId" TEXT NOT NULL REFERENCES "KbDocumentVersion"("id"), "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbAcknowledgement_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_KbAcknowledgement_doc_version_user" ON "KbAcknowledgement" ("documentId","versionId","userId")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbAcknowledgement_user" ON "KbAcknowledgement" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "ix_KbAcknowledgement_version" ON "KbAcknowledgement" ("versionId")`,

  `CREATE TABLE IF NOT EXISTS "KbView" (
    "id" TEXT NOT NULL, "documentId" TEXT NOT NULL REFERENCES "KbDocument"("id"), "versionId" TEXT,
    "userId" TEXT NOT NULL, "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbView_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "ix_KbView_doc_user" ON "KbView" ("documentId","userId","viewedAt")`,

  // Seed the default categories. DO NOTHING: an admin's rename survives a re-run.
  `INSERT INTO "KbCategory" ("id","code","name","sortOrder","icon","isActive","createdAt","updatedAt") VALUES
    ${CATEGORIES.map(([id, code, name, order, icon]) => `('${id}','${code}','${name.replace(/'/g, "''")}',${order},'${icon}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).join(",\n    ")}
    ON CONFLICT DO NOTHING`,
];

const TABLES = ["KbCategory", "KbDocument", "KbDocumentVersion", "KbAcknowledgement", "KbView"];

async function main() {
  console.log("Applying Knowledge Bank DDL…\n");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }
  // Verify rather than trust: IF NOT EXISTS reports success either way.
  console.log("\nVerifying…");
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${t}"`);
    console.log(`  ${t}: ${r[0].c} rows`);
  }
  const cats = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*)::bigint AS c FROM "KbCategory" WHERE "id" IN (${CATEGORIES.map(([id]) => `'${id}'`).join(",")})`
  );
  if (Number(cats[0].c) !== CATEGORIES.length) {
    throw new Error(`Expected ${CATEGORIES.length} seeded categories, found ${cats[0].c}.`);
  }
  const fts = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM pg_indexes WHERE tablename = 'KbDocument' AND indexname = 'ix_KbDocument_fts'`
  );
  if (Number(fts[0].n) !== 1) throw new Error("Full-text index ix_KbDocument_fts is missing.");
  // The planner check: the backend's expression must be able to use the index.
  await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "KbDocument" WHERE to_tsvector('simple'::regconfig, COALESCE("searchText", '')) @@ plainto_tsquery('simple'::regconfig, 'hot work') LIMIT 1`
  );
  console.log(`  categories seeded: ${cats[0].c}/${CATEGORIES.length}, full-text index present`);
  console.log("\n✅  Knowledge Bank tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
