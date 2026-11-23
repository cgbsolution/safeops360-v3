// DDL applier for Process Safety: PSSR (Pre-Startup Safety Review) and the PSI
// document library (JSL Hisar "MOC & PSSR" and "PSI advisor / Chem advisor").
//
//   PssrTemplate / PssrTemplateItem  PSSR checklist master (+ default steel-plant template seed)
//   PssrReview                       one pre-startup safety review
//   PssrItem                         checklist copied from the template; a NO is a punch item
//   PssrSignoff                      sign-off matrix (one current decision per discipline)
//   PsiDocument                      PSI document revisions (P&ID, PFD, ... and SDS linked to a chemical)
//
// Six NEW tables, no ALTER on any existing table, so this is additive and
// idempotent (CREATE ... IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING) and
// safe to re-run. It also seeds:
//   * the default steel-plant PSSR template (45 items, 14 sections). The rows
//     mirror app/services/pssr.py DEFAULT_TEMPLATE; tests/test_pssr.py checks they agree.
//   * CAPA source type PSSR_PUNCH (+ SLA profile) so a category-B punch item can
//     raise a CAPA under its own source. Without it the backend falls back to MOC_ACTION.
//
// The chemical register reads the existing Facilities "HazardousMaterial" table;
// SDS files are PsiDocument rows (docType SDS, hazardousMaterialId set), so no
// column is added to HazardousMaterial.
//
// ORDER: run this BEFORE deploying the backend that carries app/models/pssr.py and
// app/models/psi.py. Only the /api/pssr, /api/psi and /api/evidence/pssr_item
// paths read these tables, so an un-migrated database breaks only those screens.
//
// Then run prisma/apply-pssr-psi-permissions.ts, or every endpoint returns 403.
//
//   npx tsx prisma/apply-pssr-psi-ddl.ts     (or: npm run db:apply-pssr-psi)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;
const DISCIPLINES = `'PROCESS','MECHANICAL','ELECTRICAL','INSTRUMENTATION','SAFETY','OPERATIONS','PLANT_HEAD'`;

const STATEMENTS: string[] = [
  // ── PSSR template ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "PssrTemplate" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "plantId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PssrTemplate_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PssrTemplate_code_key" ON "PssrTemplate" ("code")`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrTemplate_isDeleted" ON "PssrTemplate" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "PssrTemplateItem" (
    "id" TEXT NOT NULL, "templateId" TEXT NOT NULL REFERENCES "PssrTemplate"("id"),
    "section" TEXT NOT NULL, "sectionOrder" INTEGER NOT NULL DEFAULT 0, "itemOrder" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL, "guidance" TEXT, "discipline" TEXT NOT NULL,
    "defaultPunchCategory" TEXT NOT NULL DEFAULT 'A', "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PssrTemplateItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PssrTemplateItem_cat_chk" CHECK ("defaultPunchCategory" IN ('A','B')),
    CONSTRAINT "PssrTemplateItem_discipline_chk" CHECK ("discipline" IN (${DISCIPLINES})))`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrTemplateItem_template" ON "PssrTemplateItem" ("templateId","sectionOrder","itemOrder")`,

  // ── PSSR review ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "PssrReview" (
    "id" TEXT NOT NULL, "pssrNo" TEXT NOT NULL, "plantId" TEXT NOT NULL, "area" TEXT, "unit" TEXT,
    "title" TEXT NOT NULL, "scope" TEXT, "trigger" TEXT NOT NULL,
    "mocId" TEXT, "mocNumber" TEXT, "phaStudyId" TEXT, "templateId" TEXT,
    "plannedStartupDate" TIMESTAMP(3), "leaderId" TEXT NOT NULL,
    "teamUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb, "requiredDisciplines" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'DRAFT', "submittedAt" TIMESTAMP(3), "decidedAt" TIMESTAMP(3), "noGoReason" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0, "lastReopenReason" TEXT, "lastReopenedAt" TIMESTAMP(3),
    "actualStartupDate" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "closedById" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PssrReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PssrReview_status_chk" CHECK ("status" IN ('DRAFT','IN_PROGRESS','PENDING_APPROVAL','APPROVED_GO','NO_GO','CLOSED')),
    CONSTRAINT "PssrReview_trigger_chk" CHECK ("trigger" IN ('NEW_FACILITY','MODIFICATION','TURNAROUND','RESTART_AFTER_SHUTDOWN','OTHER')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PssrReview_pssrNo_key" ON "PssrReview" ("pssrNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrReview_plant_status" ON "PssrReview" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrReview_moc" ON "PssrReview" ("mocId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrReview_isDeleted" ON "PssrReview" ("isDeleted")`,

  // A NO is always a punch item and a YES / NA never is (PssrItem_punch_iff_no_chk).
  `CREATE TABLE IF NOT EXISTS "PssrItem" (
    "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL REFERENCES "PssrReview"("id"), "plantId" TEXT NOT NULL,
    "templateItemId" TEXT, "section" TEXT NOT NULL, "sectionOrder" INTEGER NOT NULL DEFAULT 0,
    "itemOrder" INTEGER NOT NULL DEFAULT 0, "question" TEXT NOT NULL, "guidance" TEXT, "discipline" TEXT NOT NULL,
    "defaultPunchCategory" TEXT NOT NULL DEFAULT 'A',
    "response" TEXT, "remarks" TEXT, "verifiedById" TEXT, "verifiedAt" TIMESTAMP(3),
    "punchCategory" TEXT, "punchDescription" TEXT, "punchStatus" TEXT, "punchOwnerId" TEXT, "punchDueDate" TIMESTAMP(3),
    "punchClosedAt" TIMESTAMP(3), "punchClosedById" TEXT, "punchClosureNote" TEXT,
    "capaId" TEXT, "capaNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PssrItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PssrItem_response_chk" CHECK ("response" IS NULL OR "response" IN ('YES','NO','NA')),
    CONSTRAINT "PssrItem_punchCategory_chk" CHECK ("punchCategory" IS NULL OR "punchCategory" IN ('A','B')),
    CONSTRAINT "PssrItem_punchStatus_chk" CHECK ("punchStatus" IS NULL OR "punchStatus" IN ('OPEN','CLOSED')),
    CONSTRAINT "PssrItem_punch_iff_no_chk" CHECK ((COALESCE("response", '') = 'NO') = ("punchStatus" IS NOT NULL)))`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrItem_review" ON "PssrItem" ("reviewId","sectionOrder","itemOrder")`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrItem_punch_owner" ON "PssrItem" ("punchOwnerId","punchStatus")`,

  `CREATE TABLE IF NOT EXISTS "PssrSignoff" (
    "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL REFERENCES "PssrReview"("id"), "discipline" TEXT NOT NULL,
    "userId" TEXT NOT NULL, "decision" TEXT NOT NULL, "comment" TEXT, "signedAt" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PssrSignoff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PssrSignoff_decision_chk" CHECK ("decision" IN ('APPROVE','REJECT')),
    CONSTRAINT "PssrSignoff_discipline_chk" CHECK ("discipline" IN (${DISCIPLINES})))`,
  // One current decision per discipline per review, enforced in the database.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_PssrSignoff_current" ON "PssrSignoff" ("reviewId","discipline") WHERE "isCurrent"`,
  `CREATE INDEX IF NOT EXISTS "ix_PssrSignoff_review" ON "PssrSignoff" ("reviewId","isCurrent")`,

  // ── PSI documents ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "PsiDocument" (
    "id" TEXT NOT NULL, "plantId" TEXT NOT NULL, "unitArea" TEXT, "docType" TEXT NOT NULL, "docNo" TEXT NOT NULL,
    "revision" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "hazardousMaterialId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CURRENT', "supersedesId" TEXT, "issuedDate" TIMESTAMP(3), "reviewDue" TIMESTAMP(3),
    "fileName" TEXT, "storagePath" TEXT, "fileSize" INTEGER, "mimeType" TEXT, "fileUploadedAt" TIMESTAMP(3), "uploadedById" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PsiDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PsiDocument_status_chk" CHECK ("status" IN ('CURRENT','SUPERSEDED')),
    CONSTRAINT "PsiDocument_docType_chk" CHECK ("docType" IN ('PID','PFD','DESIGN_BASIS','RELIEF_SYSTEM_DESIGN','ELECTRICAL_AREA_CLASSIFICATION','MATERIAL_AND_ENERGY_BALANCE','EQUIPMENT_DATASHEET','SAFE_OPERATING_LIMITS','SDS','OTHER')),
    CONSTRAINT "PsiDocument_sds_chk" CHECK ("docType" <> 'SDS' OR "hazardousMaterialId" IS NOT NULL))`,
  // A revision label is used once per document, and only one revision is CURRENT.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_PsiDocument_revision" ON "PsiDocument" ("plantId","docNo","revision") WHERE "isDeleted" = false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_PsiDocument_current" ON "PsiDocument" ("plantId","docNo") WHERE "isDeleted" = false AND "status" = 'CURRENT'`,
  `CREATE INDEX IF NOT EXISTS "ix_PsiDocument_plant_type_status" ON "PsiDocument" ("plantId","docType","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_PsiDocument_plant_docno" ON "PsiDocument" ("plantId","docNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_PsiDocument_material" ON "PsiDocument" ("hazardousMaterialId")`,
  `CREATE INDEX IF NOT EXISTS "ix_PsiDocument_isDeleted" ON "PsiDocument" ("isDeleted")`,
];

// ── seeds ────────────────────────────────────────────────────────────────────
const TEMPLATE_SQL = `INSERT INTO "PssrTemplate" ("id","code","name","description","plantId","isDefault","isActive","isDeleted","createdAt","updatedAt")
VALUES ('pssr-tpl-steel-default', 'STEEL_PLANT_DEFAULT', 'Steel plant PSSR (default)',
  'Default pre-startup safety review for steel plant commissioning, modifications, turnarounds and restarts (14 sections).',
  NULL, true, true, false, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING`;

// Mirrors app/services/pssr.py DEFAULT_TEMPLATE (checked by tests/test_pssr.py).
const TEMPLATE_ITEMS_SQL = `INSERT INTO "PssrTemplateItem" ("id","templateId","section","sectionOrder","itemOrder","question","guidance","discipline","defaultPunchCategory","isDeleted","createdAt","updatedAt")
VALUES
  ('pssr-tpl-steel-default-01-01', 'pssr-tpl-steel-default', 'Design & construction per specification', 1, 1, 'Equipment installed per the approved design, drawings and specifications', 'Walk down against the IFC drawings; note every field change.', 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-01-02', 'pssr-tpl-steel-default', 'Design & construction per specification', 1, 2, 'Materials of construction verified against specification (PMI done for alloy / stainless piping and fittings)', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-01-03', 'pssr-tpl-steel-default', 'Design & construction per specification', 1, 3, 'Civil and structural work complete: foundations grouted, platforms, handrails and toe boards fitted', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-01-04', 'pssr-tpl-steel-default', 'Design & construction per specification', 1, 4, 'Deviations from the approved design captured and approved through MOC', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-02-01', 'pssr-tpl-steel-default', 'P&ID / as-built drawings updated', 2, 1, 'Red-lined P&IDs and layouts reflecting the installed system are available in the control room', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-02-02', 'pssr-tpl-steel-default', 'P&ID / as-built drawings updated', 2, 2, 'Final as-built P&IDs, PFDs and layouts issued to the PSI library', 'May follow start-up; track as a B punch with a due date.', 'PROCESS', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-02-03', 'pssr-tpl-steel-default', 'P&ID / as-built drawings updated', 2, 3, 'Equipment datasheets, line list and instrument index updated', NULL, 'PROCESS', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-03-01', 'pssr-tpl-steel-default', 'Operating procedures', 3, 1, 'Start-up, normal operation, shutdown and emergency shutdown SOPs written or updated and approved', NULL, 'OPERATIONS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-03-02', 'pssr-tpl-steel-default', 'Operating procedures', 3, 2, 'Safe operating limits and the consequences of deviation documented', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-03-03', 'pssr-tpl-steel-default', 'Operating procedures', 3, 3, 'Maintenance procedures and preventive maintenance schedule set up in the CMMS', NULL, 'MECHANICAL', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-04-01', 'pssr-tpl-steel-default', 'Training done', 4, 1, 'Operators trained on the new or modified procedures; training records available', NULL, 'OPERATIONS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-04-02', 'pssr-tpl-steel-default', 'Training done', 4, 2, 'Maintenance staff and contractors briefed on the change and its hazards', NULL, 'OPERATIONS', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-04-03', 'pssr-tpl-steel-default', 'Training done', 4, 3, 'Emergency response team briefed on new hazards and response', NULL, 'SAFETY', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-05-01', 'pssr-tpl-steel-default', 'PHA / HAZOP recommendations closed', 5, 1, 'PHA / HAZOP / HIRA completed for the new or changed facility', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-05-02', 'pssr-tpl-steel-default', 'PHA / HAZOP recommendations closed', 5, 2, 'All pre-start-up PHA / HAZOP recommendations closed, or formally deferred with risk acceptance', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-05-03', 'pssr-tpl-steel-default', 'PHA / HAZOP recommendations closed', 5, 3, 'HIRA register updated for new or changed activities', NULL, 'SAFETY', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-06-01', 'pssr-tpl-steel-default', 'MOC complete', 6, 1, 'MOC approved and every pre-start-up MOC action complete', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-06-02', 'pssr-tpl-steel-default', 'MOC complete', 6, 2, 'Temporary changes carry an expiry date and a removal plan', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-07-01', 'pssr-tpl-steel-default', 'Equipment integrity & tests', 7, 1, 'Pressure / leak / hydro tests done for vessels, piping and hydraulic systems; certificates available', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-07-02', 'pssr-tpl-steel-default', 'Equipment integrity & tests', 7, 2, 'Rotating equipment aligned, lubricated and no-load trial run completed', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-07-03', 'pssr-tpl-steel-default', 'Equipment integrity & tests', 7, 3, 'Cranes, hoists and lifting tackle load-tested and certified by a competent person', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-07-04', 'pssr-tpl-steel-default', 'Equipment integrity & tests', 7, 4, 'Refractory dry-out / heating curve completed for furnaces, ladles and tundishes where applicable', NULL, 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-07-05', 'pssr-tpl-steel-default', 'Equipment integrity & tests', 7, 5, 'Water-cooled elements (panels, moulds, tuyeres) pressure-tested; cooling water flow and low-flow alarms proven', 'Water in contact with molten metal is an explosion hazard.', 'MECHANICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-08-01', 'pssr-tpl-steel-default', 'Relief / safety systems tested', 8, 1, 'Relief valves and rupture discs set, tested and tagged; relief paths unobstructed', NULL, 'INSTRUMENTATION', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-08-02', 'pssr-tpl-steel-default', 'Relief / safety systems tested', 8, 2, 'Emergency stops and emergency trip systems function-tested', NULL, 'INSTRUMENTATION', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-08-03', 'pssr-tpl-steel-default', 'Relief / safety systems tested', 8, 3, 'Fixed gas detection (CO, O2 deficiency, flammable gas) calibrated and alarming at the right locations', NULL, 'INSTRUMENTATION', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-09-01', 'pssr-tpl-steel-default', 'Interlocks & alarms', 9, 1, 'Safety interlocks / SIFs proof-tested; every bypass removed and logged', NULL, 'INSTRUMENTATION', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-09-02', 'pssr-tpl-steel-default', 'Interlocks & alarms', 9, 2, 'Alarm set points match the safe operating limits; alarms tested through to DCS / PLC', NULL, 'INSTRUMENTATION', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-09-03', 'pssr-tpl-steel-default', 'Interlocks & alarms', 9, 3, 'Control logic changes backed up and documented', NULL, 'INSTRUMENTATION', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-10-01', 'pssr-tpl-steel-default', 'Fire protection & emergency response ready', 10, 1, 'Fire detection and suppression (hydrants, sprinklers, extinguishers, cable gallery protection) in place and tested', NULL, 'SAFETY', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-10-02', 'pssr-tpl-steel-default', 'Fire protection & emergency response ready', 10, 2, 'Escape routes, emergency lighting, signage and assembly points available', NULL, 'SAFETY', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-10-03', 'pssr-tpl-steel-default', 'Fire protection & emergency response ready', 10, 3, 'On-site emergency plan updated for the new hazards (molten metal, gas leak, chemical spill)', NULL, 'SAFETY', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-10-04', 'pssr-tpl-steel-default', 'Fire protection & emergency response ready', 10, 4, 'Safety showers and eyewash stations working where chemicals are handled', NULL, 'SAFETY', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-11-01', 'pssr-tpl-steel-default', 'Electrical classification', 11, 1, 'Hazardous area classification done and equipment Ex-rated for its zone', NULL, 'ELECTRICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-11-02', 'pssr-tpl-steel-default', 'Electrical classification', 11, 2, 'Earthing, bonding and lightning protection tested; insulation resistance values recorded', NULL, 'ELECTRICAL', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-11-03', 'pssr-tpl-steel-default', 'Electrical classification', 11, 3, 'Protection relay settings tested; switchgear labelled; single-line diagram updated', NULL, 'ELECTRICAL', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-12-01', 'pssr-tpl-steel-default', 'LOTO / PTW readiness', 12, 1, 'Isolation points identified, labelled and included in LOTO procedures', NULL, 'OPERATIONS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-12-02', 'pssr-tpl-steel-default', 'LOTO / PTW readiness', 12, 2, 'All work permits on the system closed; temporary blinds / spades removed and the blind list reconciled', NULL, 'OPERATIONS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-12-03', 'pssr-tpl-steel-default', 'LOTO / PTW readiness', 12, 3, 'Mechanical completion handed over from projects / maintenance to operations and signed', NULL, 'OPERATIONS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-13-01', 'pssr-tpl-steel-default', 'Housekeeping & access', 13, 1, 'Scaffolding, debris and temporary materials removed; area clean', NULL, 'OPERATIONS', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-13-02', 'pssr-tpl-steel-default', 'Housekeeping & access', 13, 2, 'Safe access and egress, machine guards, barricades, equipment nameplates and line markings in place', NULL, 'SAFETY', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-13-03', 'pssr-tpl-steel-default', 'Housekeeping & access', 13, 3, 'PPE requirements posted and the PPE available at the point of use', NULL, 'SAFETY', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-14-01', 'pssr-tpl-steel-default', 'Environmental', 14, 1, 'Emission controls (fume extraction, bag filters, dedusting) commissioned', NULL, 'PROCESS', 'A', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-14-02', 'pssr-tpl-steel-default', 'Environmental', 14, 2, 'Effluent, drainage, spill containment and waste disposal arrangements ready', NULL, 'PROCESS', 'B', false, NOW(), NOW()),
  ('pssr-tpl-steel-default-14-03', 'pssr-tpl-steel-default', 'Environmental', 14, 3, 'Statutory consents (CTO, PESO, boiler, factory licence amendment) obtained where required', NULL, 'SAFETY', 'A', false, NOW(), NOW())

ON CONFLICT ("id") DO NOTHING`;

// CAPA source for category-B punch items (Safety category). Inserts nothing if
// the CAPA masters are not seeded; the backend then falls back to MOC_ACTION.
const CAPA_SOURCE_SQL = `INSERT INTO "CapaSourceType" ("id","code","name","description","categoryId","parentModuleLive","parentModuleName","sortOrder","isActive","createdAt","updatedAt")
SELECT 'capa-src-pssr-punch', 'PSSR_PUNCH', 'PSSR Punch Item',
  'Category-B punch item from a pre-startup safety review (may close after start-up).',
  c."id", true, 'PSSR', 6, true, NOW(), NOW()
FROM "CapaSourceCategory" c WHERE c."code" = 'SAFETY'
ON CONFLICT ("code") DO NOTHING`;

const CAPA_SLA_SQL = `INSERT INTO "CapaSlaProfile" ("id","code","sourceTypeCode","severity","initialResponseHours","rcaDueDays","actionsPlannedDueDays","closureTargetDays","recurrenceCheckDays","isActive","createdAt","updatedAt")
VALUES ('capa-sla-pssr-punch', 'PSSR_PUNCH_DEF', 'PSSR_PUNCH', NULL, 72, 14, 21, 30, 90, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING`;

const TABLES = ["PssrTemplate", "PssrTemplateItem", "PssrReview", "PssrItem", "PssrSignoff", "PsiDocument"];

async function main() {
  console.log("Applying PSSR + PSI DDL…\n");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  console.log("\nSeeding the default steel-plant PSSR template…");
  await prisma.$executeRawUnsafe(TEMPLATE_SQL);
  const added = await prisma.$executeRawUnsafe(TEMPLATE_ITEMS_SQL);
  console.log(`  ✓ template items inserted this run: ${added} (existing ids are left untouched)`);

  console.log("\nSeeding CAPA source PSSR_PUNCH…");
  const src = await prisma.$executeRawUnsafe(CAPA_SOURCE_SQL);
  const exists = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "CapaSourceType" WHERE "code" = 'PSSR_PUNCH'`
  );
  if (Number(exists[0].n) === 0) {
    console.warn("  ⚠ CapaSourceCategory 'SAFETY' not found: PSSR punch CAPAs will use the MOC_ACTION source.");
  } else {
    console.log(`  ✓ PSSR_PUNCH source type ${src ? "created" : "already present"}`);
    await prisma.$executeRawUnsafe(CAPA_SLA_SQL);
  }

  // Verify rather than trust: IF NOT EXISTS reports success either way.
  console.log("\nVerifying…");
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${t}"`);
    console.log(`  ${t}: ${r[0].c} rows`);
  }
  const items = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*)::bigint AS c FROM "PssrTemplateItem" WHERE "templateId" = 'pssr-tpl-steel-default' AND "isDeleted" = false`
  );
  console.log(`  default template items: ${items[0].c}`);
  // The chemical register reads Facilities' HazardousMaterial; warn if that DDL never ran.
  const hm = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'HazardousMaterial'`
  );
  if (Number(hm[0].n) === 0) {
    console.warn("\n  ⚠ HazardousMaterial table is missing: run prisma/apply-factory-ext-ddl.ts too, or the chemical register will 500.");
  }
  console.log("\n✅  PSSR + PSI tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
