// One-off DDL applier for the BRSR Reporting module.
//
// Creates eight NEW tables. Nothing existing is altered — no column is added to
// FactoryEnvPeriod, FactoryProfile, Plant or any other live table, so this
// cannot regress a running module. FactoryEnvPeriod becomes a DERIVED rollup of
// BrsrEnvMetricLine (see backend services/brsr_env_rollup.py); the derivation
// writes to columns that already exist there.
//
//   BrsrReportingCycle       — one filing cycle per financial year
//   BrsrIndicator            — the seeded SEBI indicator catalogue
//   BrsrDataSource           — indicator → module/field mapping (traceability)
//   BrsrPrincipleResponse    — one per principle P1–P9 per cycle
//   BrsrIndicatorValue       — one answered figure + its full provenance
//   BrsrEmissionFactor       — seeded Indian grid/fuel factors, with citation
//   BrsrEnvironmentalMetric  — per-facility, per-period capture header
//   BrsrEnvMetricLine        — one captured quantity
//
// Additive + idempotent (every statement tolerates "already exists"), so it is
// safe to re-run. Applied through the Prisma client's connection because
// `prisma db execute` / `migrate diff` hang against the pooler here, and
// `prisma db push` would drop the drifted hand-DDL tables.
//   npx tsx prisma/apply-brsr-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  // ── BrsrReportingCycle ──
  `CREATE TABLE IF NOT EXISTS "BrsrReportingCycle" (
     "id" TEXT PRIMARY KEY,
     "financialYear" TEXT NOT NULL,
     "periodStart" TIMESTAMP(3) NOT NULL,
     "periodEnd" TIMESTAMP(3) NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "entityName" TEXT,
     "cin" TEXT,
     "stockExchangeCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
     "registeredOfficeAddress" TEXT,
     "contactName" TEXT,
     "contactEmail" TEXT,
     "contactPhone" TEXT,
     "assuranceProvider" TEXT,
     "assuranceType" TEXT,
     "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "autoPopulatedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "lastComputedAt" TIMESTAMP(3),
     "approvedById" TEXT,
     "approvedAt" TIMESTAMP(3),
     "filedById" TEXT,
     "filedAt" TIMESTAMP(3),
     "filingReference" TEXT,
     "snapshotJson" JSONB,
     "snapshotHash" TEXT,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy" TEXT,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false
   )`,
  // Partial — a soft-deleted cycle must not block re-creating the year.
  // Prisma cannot express this, which is why the model carries only @@index.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_BrsrReportingCycle_fy"
     ON "BrsrReportingCycle"("financialYear") WHERE "isDeleted" = false`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrReportingCycle_financialYear" ON "BrsrReportingCycle"("financialYear")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrReportingCycle_status" ON "BrsrReportingCycle"("status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrReportingCycle_isDeleted" ON "BrsrReportingCycle"("isDeleted")`,

  // ── BrsrIndicator ──
  `CREATE TABLE IF NOT EXISTS "BrsrIndicator" (
     "id" TEXT PRIMARY KEY,
     "code" TEXT NOT NULL,
     "section" TEXT NOT NULL,
     "principle" TEXT,
     "indicatorClass" TEXT,
     "label" TEXT NOT NULL,
     "groupLabel" TEXT,
     "guidance" TEXT,
     "valueType" TEXT NOT NULL DEFAULT 'TEXT',
     "unit" TEXT,
     "tableSchemaJson" JSONB,
     "isMandatory" BOOLEAN NOT NULL DEFAULT true,
     "displayOrder" INTEGER NOT NULL DEFAULT 0,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "sebiFormatVersion" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ix_BrsrIndicator_code" ON "BrsrIndicator"("code")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_section_principle" ON "BrsrIndicator"("section","principle","displayOrder")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_section" ON "BrsrIndicator"("section")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_principle" ON "BrsrIndicator"("principle")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_indicatorClass" ON "BrsrIndicator"("indicatorClass")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_displayOrder" ON "BrsrIndicator"("displayOrder")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicator_isActive" ON "BrsrIndicator"("isActive")`,

  // ── BrsrDataSource ──
  `CREATE TABLE IF NOT EXISTS "BrsrDataSource" (
     "id" TEXT PRIMARY KEY,
     "indicatorCode" TEXT NOT NULL,
     "sourceModule" TEXT NOT NULL,
     "sourceEntity" TEXT NOT NULL,
     "sourceField" TEXT,
     "resolverKey" TEXT NOT NULL,
     "resolverArgsJson" JSONB,
     "derivationNote" TEXT,
     "isPrimary" BOOLEAN NOT NULL DEFAULT true,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BrsrDataSource_ind_resolver" ON "BrsrDataSource"("indicatorCode","resolverKey")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrDataSource_indicatorCode" ON "BrsrDataSource"("indicatorCode")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrDataSource_sourceModule" ON "BrsrDataSource"("sourceModule")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrDataSource_module" ON "BrsrDataSource"("sourceModule","isActive")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrDataSource_isActive" ON "BrsrDataSource"("isActive")`,

  // ── BrsrPrincipleResponse ──
  `CREATE TABLE IF NOT EXISTS "BrsrPrincipleResponse" (
     "id" TEXT PRIMARY KEY,
     "cycleId" TEXT NOT NULL REFERENCES "BrsrReportingCycle"("id") ON DELETE CASCADE,
     "principle" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
     "isPlatformSourced" BOOLEAN NOT NULL DEFAULT false,
     "ownerUserId" TEXT,
     "dueDate" TIMESTAMP(3),
     "totalIndicators" INTEGER NOT NULL DEFAULT 0,
     "answeredIndicators" INTEGER NOT NULL DEFAULT 0,
     "autoPopulatedIndicators" INTEGER NOT NULL DEFAULT 0,
     "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "autoPopulatedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "lastComputedAt" TIMESTAMP(3),
     "narrative" TEXT,
     "reviewedById" TEXT,
     "reviewedAt" TIMESTAMP(3),
     "reviewNotes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BrsrPrincipleResponse_cycle_principle" ON "BrsrPrincipleResponse"("cycleId","principle")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrPrincipleResponse_cycleId" ON "BrsrPrincipleResponse"("cycleId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrPrincipleResponse_principle" ON "BrsrPrincipleResponse"("principle")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrPrincipleResponse_status" ON "BrsrPrincipleResponse"("status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrPrincipleResponse_ownerUserId" ON "BrsrPrincipleResponse"("ownerUserId")`,

  // ── BrsrIndicatorValue ──
  `CREATE TABLE IF NOT EXISTS "BrsrIndicatorValue" (
     "id" TEXT PRIMARY KEY,
     "cycleId" TEXT NOT NULL REFERENCES "BrsrReportingCycle"("id") ON DELETE CASCADE,
     "principleResponseId" TEXT REFERENCES "BrsrPrincipleResponse"("id") ON DELETE CASCADE,
     "indicatorCode" TEXT NOT NULL,
     "valueNumber" DOUBLE PRECISION,
     "valueText" TEXT,
     "valueBoolean" BOOLEAN,
     "valueJson" JSONB,
     "unit" TEXT,
     "provenance" TEXT NOT NULL DEFAULT 'MANUAL',
     "notApplicableReason" TEXT,
     "sourceModule" TEXT,
     "resolverKey" TEXT,
     "sourceRecordRefs" JSONB,
     "sourceRecordCount" INTEGER,
     "derivationNote" TEXT,
     "computedAt" TIMESTAMP(3),
     "autoValueNumber" DOUBLE PRECISION,
     "autoValueText" TEXT,
     "overrideReason" TEXT,
     "overriddenById" TEXT,
     "overriddenAt" TIMESTAMP(3),
     "isVerified" BOOLEAN NOT NULL DEFAULT false,
     "verifiedById" TEXT,
     "verifiedAt" TIMESTAMP(3),
     "evidenceNote" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BrsrIndicatorValue_cycle_indicator" ON "BrsrIndicatorValue"("cycleId","indicatorCode")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_cycle_prov" ON "BrsrIndicatorValue"("cycleId","provenance")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_verify" ON "BrsrIndicatorValue"("cycleId","isVerified")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_cycleId" ON "BrsrIndicatorValue"("cycleId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_indicatorCode" ON "BrsrIndicatorValue"("indicatorCode")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_principleResponseId" ON "BrsrIndicatorValue"("principleResponseId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_provenance" ON "BrsrIndicatorValue"("provenance")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_isVerified" ON "BrsrIndicatorValue"("isVerified")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrIndicatorValue_sourceModule" ON "BrsrIndicatorValue"("sourceModule")`,

  // ── BrsrEmissionFactor ──
  `CREATE TABLE IF NOT EXISTS "BrsrEmissionFactor" (
     "id" TEXT PRIMARY KEY,
     "code" TEXT NOT NULL,
     "name" TEXT NOT NULL,
     "factorType" TEXT NOT NULL,
     "scope" TEXT NOT NULL,
     "factorValue" DOUBLE PRECISION NOT NULL,
     "perUnit" TEXT NOT NULL,
     "source" TEXT NOT NULL,
     "sourceYear" TEXT,
     "region" TEXT,
     "validFrom" TIMESTAMP(3),
     "validUntil" TIMESTAMP(3),
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEmissionFactor_lookup" ON "BrsrEmissionFactor"("factorType","scope","isActive")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEmissionFactor_code" ON "BrsrEmissionFactor"("code")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEmissionFactor_factorType" ON "BrsrEmissionFactor"("factorType")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEmissionFactor_scope" ON "BrsrEmissionFactor"("scope")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEmissionFactor_isActive" ON "BrsrEmissionFactor"("isActive")`,

  // ── BrsrEnvironmentalMetric ──
  `CREATE TABLE IF NOT EXISTS "BrsrEnvironmentalMetric" (
     "id" TEXT PRIMARY KEY,
     "cycleId" TEXT NOT NULL REFERENCES "BrsrReportingCycle"("id") ON DELETE CASCADE,
     "siteId" TEXT NOT NULL,
     "siteName" TEXT,
     "periodLabel" TEXT NOT NULL,
     "periodStart" TIMESTAMP(3),
     "periodEnd" TIMESTAMP(3),
     "status" TEXT NOT NULL DEFAULT 'DRAFT',
     "turnoverInr" DOUBLE PRECISION,
     "productionVolume" DOUBLE PRECISION,
     "productionUnit" TEXT,
     "scope3TCo2e" DOUBLE PRECISION,
     "scope3Methodology" TEXT,
     "isWaterPositive" BOOLEAN,
     "hasZeroLiquidDischarge" BOOLEAN,
     "consentStatus" TEXT,
     "submittedById" TEXT,
     "submittedAt" TIMESTAMP(3),
     "verifiedById" TEXT,
     "verifiedAt" TIMESTAMP(3),
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy" TEXT,
     "isDeleted" BOOLEAN NOT NULL DEFAULT false
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BrsrEnvironmentalMetric_cycle_site_period" ON "BrsrEnvironmentalMetric"("cycleId","siteId","periodLabel")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_cycle_status" ON "BrsrEnvironmentalMetric"("cycleId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_cycleId" ON "BrsrEnvironmentalMetric"("cycleId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_siteId" ON "BrsrEnvironmentalMetric"("siteId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_periodLabel" ON "BrsrEnvironmentalMetric"("periodLabel")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_status" ON "BrsrEnvironmentalMetric"("status")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvironmentalMetric_isDeleted" ON "BrsrEnvironmentalMetric"("isDeleted")`,

  // ── BrsrEnvMetricLine ──
  // flowType / destination are NOT NULL DEFAULT 'NA' on purpose: they are part
  // of the unique slot below, and Postgres treats NULLs as distinct — nullable
  // slot columns would let the same category be inserted unlimited times while
  // the unique index silently passed.
  `CREATE TABLE IF NOT EXISTS "BrsrEnvMetricLine" (
     "id" TEXT PRIMARY KEY,
     "metricId" TEXT NOT NULL REFERENCES "BrsrEnvironmentalMetric"("id") ON DELETE CASCADE,
     "stream" TEXT NOT NULL,
     "categoryCode" TEXT NOT NULL,
     "categoryLabel" TEXT,
     "flowType" TEXT NOT NULL DEFAULT 'NA',
     "destination" TEXT NOT NULL DEFAULT 'NA',
     "treatmentLevel" TEXT,
     "quantity" DOUBLE PRECISION,
     "unit" TEXT,
     "scope" TEXT,
     "emissionFactorId" TEXT,
     "factorValue" DOUBLE PRECISION,
     "factorPerUnit" TEXT,
     "factorSource" TEXT,
     "computedTCo2e" DOUBLE PRECISION,
     "dataQuality" TEXT,
     "evidenceNote" TEXT,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedBy" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_BrsrEnvMetricLine_slot" ON "BrsrEnvMetricLine"("metricId","stream","categoryCode","flowType","destination")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_metric_stream" ON "BrsrEnvMetricLine"("metricId","stream")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_metricId" ON "BrsrEnvMetricLine"("metricId")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_categoryCode" ON "BrsrEnvMetricLine"("categoryCode")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_stream" ON "BrsrEnvMetricLine"("stream")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_flowType" ON "BrsrEnvMetricLine"("flowType")`,
  `CREATE INDEX IF NOT EXISTS "ix_BrsrEnvMetricLine_scope" ON "BrsrEnvMetricLine"("scope")`,
];

const TABLES = [
  "BrsrReportingCycle",
  "BrsrIndicator",
  "BrsrDataSource",
  "BrsrPrincipleResponse",
  "BrsrIndicatorValue",
  "BrsrEmissionFactor",
  "BrsrEnvironmentalMetric",
  "BrsrEnvMetricLine",
];

async function main() {
  console.log("Applying BRSR Reporting DDL…");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 84);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  // Verify every table actually landed, rather than trusting that no statement
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
  console.log(`✅  BRSR ready: ${found.size}/${TABLES.length} tables present.`);
  console.log("    Next: npx tsx prisma/seed-brsr.ts  → then restart uvicorn.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
