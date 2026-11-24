// DDL for the PTW Control Center v2 (docs/ptw-control-center/PLAN.md §3).
//
//   npx tsx prisma/apply-ptw-control-center-ddl.ts        (npm run db:apply-ptw-control-center)
//
// Additive and idempotent — safe to re-run, safe against prod:
//   • 10 new tables (PlantLayout, ZoneGuidance, Impairment, ImpairmentRule,
//     SimopsRule, PermitControl, PermitEvent, PtwException, PtwShiftBrief,
//     PtwKioskToken), every one carrying tenantId DEFAULT 'default' — the
//     backend's QueryScope filters tenantId unconditionally.
//   • nullable columns on two existing tables: Area.geometry / sortOrder /
//     layoutId and PermitCrewMember.checkedInAt / checkedOutAt. Neither the
//     Prisma models nor the SQLAlchemy models map these (so nothing breaks
//     before this runs); the control-center code reads them with guarded SQL.
//   • ptw_step_key(status, step_name) — the pipeline step classifier. MUST
//     match app/services/ptw_ops/steps.py:step_key (pinned by a backend test).
//   • two AFTER triggers that write "PermitEvent" on EVERY pipeline step change,
//     whatever code path made it (Python engine, lifecycle routes, scheduler
//     expiry, the Next.js sweep): one on "Permit".status, one on
//     "WorkflowInstance"."currentStepName" (approval sub-steps all sit under
//     status SUBMITTED). A row is written only when the step key changes.
//   • backfill: one synthetic PermitEvent per permit that has none, stamped at
//     the best-known entry time of its current step (falls back to createdAt).
//   • the default impairment and SIMOPS rules (same values as
//     app/services/ptw_ops/defaults.py).
//
// Permissions are separate: npx tsx prisma/apply-ptw-control-center-permissions.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT = `"tenantId" TEXT NOT NULL DEFAULT 'default'`;

const STATEMENTS: string[] = [
  // ── existing tables: nullable additions ──
  `ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "geometry" JSONB`,
  `ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER`,
  `ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "layoutId" TEXT`,
  `ALTER TABLE "PermitCrewMember" ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMPTZ`,
  `ALTER TABLE "PermitCrewMember" ADD COLUMN IF NOT EXISTS "checkedOutAt" TIMESTAMPTZ`,

  // ── layout + zone guidance ──
  `CREATE TABLE IF NOT EXISTS "PlantLayout" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL UNIQUE REFERENCES "Plant"("id") ON DELETE CASCADE,
     "storagePath" TEXT, "imageUrl" TEXT, "widthPx" INTEGER, "heightPx" INTEGER,
     "widthM" DOUBLE PRECISION CHECK ("widthM" IS NULL OR "widthM" > 0),
     "heightM" DOUBLE PRECISION CHECK ("heightM" IS NULL OR "heightM" > 0),
     "updatedById" TEXT, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS "ZoneGuidance" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL REFERENCES "Plant"("id") ON DELETE CASCADE,
     "areaId" TEXT NOT NULL UNIQUE REFERENCES "Area"("id") ON DELETE CASCADE,
     "restrictedHours" TEXT,
     "instructions" TEXT[] NOT NULL DEFAULT '{}',
     "mandatoryPpe" TEXT[] NOT NULL DEFAULT '{}',
     "assemblyPoint" TEXT, "extinguisherLocations" TEXT,
     "permitTypeRules" JSONB NOT NULL DEFAULT '[]',
     "updatedById" TEXT, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "ZoneGuidance_plantId_idx" ON "ZoneGuidance" ("plantId")`,

  // ── impairments ──
  `CREATE TABLE IF NOT EXISTS "Impairment" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL REFERENCES "Plant"("id"),
     "code" TEXT NOT NULL,
     "systemType" TEXT NOT NULL CHECK ("systemType" IN
        ('sprinkler','fire_detection','fire_alarm','gas_detection','interlock','emergency_lighting','other')),
     "systemName" TEXT NOT NULL,
     "areaId" TEXT REFERENCES "Area"("id"),
     "reason" TEXT NOT NULL,
     "startedAt" TIMESTAMPTZ NOT NULL,
     "plannedRestoreAt" TIMESTAMPTZ,
     "restoredAt" TIMESTAMPTZ, "restoredById" TEXT,
     "precautions" TEXT[] NOT NULL DEFAULT '{}',
     "approvedById" TEXT, "approvedAt" TIMESTAMPTZ,
     "status" TEXT NOT NULL DEFAULT 'requested'
        CHECK ("status" IN ('requested','approved','active','restored','cancelled')),
     "cancelledReason" TEXT,
     "escalationCount" INTEGER NOT NULL DEFAULT 0,
     "lastEscalatedAt" TIMESTAMPTZ,
     "createdById" TEXT NOT NULL,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "Impairment_plant_status_idx" ON "Impairment" ("tenantId", "plantId", "status")`,
  `CREATE INDEX IF NOT EXISTS "Impairment_areaId_idx" ON "Impairment" ("areaId")`,
  // A code is unique among the OPEN impairments of a plant (SZ-03 can be impaired again next month).
  `CREATE UNIQUE INDEX IF NOT EXISTS "Impairment_open_code_key" ON "Impairment" ("tenantId", "plantId", "code")
     WHERE "status" IN ('requested','approved','active')`,

  `CREATE TABLE IF NOT EXISTS "ImpairmentRule" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT REFERENCES "Plant"("id") ON DELETE CASCADE,
     "systemType" TEXT NOT NULL,
     "permitType" TEXT NOT NULL,
     "effect" TEXT NOT NULL CHECK ("effect" IN ('block_new','require_controls','allow')),
     "requiredControls" TEXT[] NOT NULL DEFAULT '{}',
     "message" TEXT,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS "SimopsRule" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT REFERENCES "Plant"("id") ON DELETE CASCADE,
     "permitTypeA" TEXT NOT NULL, "permitTypeB" TEXT NOT NULL,
     "minDistanceM" DOUBLE PRECISION CHECK ("minDistanceM" IS NULL OR "minDistanceM" >= 0),
     "sameArea" BOOLEAN NOT NULL DEFAULT true,
     "severity" TEXT NOT NULL DEFAULT 'critical' CHECK ("severity" IN ('critical','high','medium','low')),
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,

  // ── permit controls (require_controls gate) ──
  `CREATE TABLE IF NOT EXISTS "PermitControl" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "permitId" TEXT NOT NULL REFERENCES "Permit"("id") ON DELETE CASCADE,
     "controlKey" TEXT NOT NULL,
     "satisfiedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "satisfiedById" TEXT NOT NULL,
     "attachmentId" TEXT, "note" TEXT,
     UNIQUE ("permitId", "controlKey"))`,

  // ── lifecycle events ──
  `CREATE TABLE IF NOT EXISTS "PermitEvent" (
     "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text), ${TENANT},
     "permitId" TEXT NOT NULL REFERENCES "Permit"("id") ON DELETE CASCADE,
     "fromStep" TEXT, "toStep" TEXT NOT NULL,
     "actorId" TEXT, "actorRole" TEXT, "note" TEXT,
     "synthetic" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "PermitEvent_permit_createdAt_idx" ON "PermitEvent" ("permitId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "PermitEvent_toStep_createdAt_idx" ON "PermitEvent" ("toStep", "createdAt")`,

  // ── exceptions, briefs, kiosk ──
  `CREATE TABLE IF NOT EXISTS "PtwException" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL REFERENCES "Plant"("id"),
     "ruleKey" TEXT NOT NULL,
     "severity" TEXT NOT NULL CHECK ("severity" IN ('critical','high','medium','low')),
     "dedupeKey" TEXT NOT NULL,
     "permitId" TEXT, "impairmentId" TEXT, "areaId" TEXT,
     "title" TEXT NOT NULL, "detail" TEXT, "ref" TEXT,
     "openedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "resolvedAt" TIMESTAMPTZ,
     "ownerUserId" TEXT,
     "notified" JSONB NOT NULL DEFAULT '[]',
     "acknowledgedAt" TIMESTAMPTZ, "acknowledgedById" TEXT,
     "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PtwException_open_dedupe_key" ON "PtwException" ("tenantId", "plantId", "dedupeKey")
     WHERE "resolvedAt" IS NULL`,
  `CREATE INDEX IF NOT EXISTS "PtwException_plant_open_idx" ON "PtwException" ("plantId", "resolvedAt")`,
  `CREATE TABLE IF NOT EXISTS "PtwShiftBrief" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL REFERENCES "Plant"("id") ON DELETE CASCADE,
     "shift" TEXT NOT NULL,
     "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "text" TEXT NOT NULL, "inputsHash" TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "PtwShiftBrief_plant_generated_idx" ON "PtwShiftBrief" ("plantId", "generatedAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "PtwKioskToken" (
     "id" TEXT PRIMARY KEY, ${TENANT},
     "plantId" TEXT NOT NULL REFERENCES "Plant"("id") ON DELETE CASCADE,
     "label" TEXT NOT NULL,
     "tokenHash" TEXT NOT NULL UNIQUE,
     "createdById" TEXT NOT NULL,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "revokedAt" TIMESTAMPTZ, "lastSeenAt" TIMESTAMPTZ)`,

  // ── payload-path index (open permits by plant) ──
  `CREATE INDEX IF NOT EXISTS "Permit_plant_status_validTo_idx" ON "Permit" ("plantId", "status", "validTo")`,
  `CREATE INDEX IF NOT EXISTS "Permit_plant_closedAt_idx" ON "Permit" ("plantId", "closedAt")`,

  // ── pipeline step classifier (mirror of steps.py:step_key) ──
  `CREATE OR REPLACE FUNCTION ptw_step_key(p_status TEXT, p_step TEXT) RETURNS TEXT
   LANGUAGE sql IMMUTABLE AS $$
     SELECT CASE
       WHEN upper(coalesce(p_status,'')) IN ('SUBMITTED','ISSUER_APPROVED','SAFETY_APPROVED','PLANT_HEAD_APPROVED') THEN
         CASE
           WHEN lower(coalesce(p_step,'')) LIKE '%issuer%' THEN 'ISSUER_REVIEW'
           WHEN lower(coalesce(p_step,'')) LIKE '%safety%' THEN 'SAFETY_REVIEW'
           WHEN lower(coalesce(p_step,'')) LIKE '%plant head%' OR lower(coalesce(p_step,'')) LIKE '%plant_head%'
             THEN 'PLANT_HEAD_APPROVAL'
           ELSE 'APPROVAL'
         END
       WHEN upper(p_status) IN ('APPROVED','ISSUED') THEN 'AWAITING_ACCEPT'
       WHEN upper(p_status) IN ('WORK_COMPLETED','HANDBACK_INSPECTION') THEN 'CLOSURE_PENDING'
       WHEN coalesce(p_status,'') = '' THEN 'DRAFT'
       ELSE upper(p_status)
     END
   $$`,

  // Best-effort actor: newest evidence / workflow history row in this
  // transaction (now() is the transaction start), else the session GUC, else NULL.
  `CREATE OR REPLACE FUNCTION ptw_event_actor(p_permit TEXT) RETURNS TEXT
   LANGUAGE sql STABLE AS $$
     SELECT coalesce(
       (SELECT e."actorId" FROM "PermitActionEvidence" e
         WHERE e."permitId" = p_permit AND e."capturedAt" >= now() - interval '1 minute'
         ORDER BY e."capturedAt" DESC LIMIT 1),
       (SELECT h."performedById" FROM "WorkflowHistory" h
          JOIN "WorkflowInstance" wi ON wi.id = h."instanceId"
         WHERE wi.module = 'PTW' AND wi."recordId" = p_permit AND h."performedAt" >= now() - interval '1 minute'
         ORDER BY h."performedAt" DESC LIMIT 1),
       nullif(current_setting('safeops.actor_id', true), ''))
   $$`,

  `CREATE OR REPLACE FUNCTION ptw_record_event(p_permit TEXT, p_to TEXT, p_tenant TEXT) RETURNS void
   LANGUAGE plpgsql AS $$
   DECLARE
     v_last TEXT;
     v_actor TEXT;
   BEGIN
     SELECT "toStep" INTO v_last FROM "PermitEvent" WHERE "permitId" = p_permit
       ORDER BY "createdAt" DESC LIMIT 1;
     IF v_last IS NOT DISTINCT FROM p_to THEN
       RETURN;
     END IF;
     v_actor := ptw_event_actor(p_permit);
     INSERT INTO "PermitEvent" ("id", "tenantId", "permitId", "fromStep", "toStep", "actorId", "actorRole", "createdAt")
     VALUES (md5(random()::text || clock_timestamp()::text), coalesce(p_tenant, 'default'), p_permit, v_last, p_to,
             v_actor, (SELECT u.role FROM "User" u WHERE u.id = v_actor), clock_timestamp());
   END $$`,

  `CREATE OR REPLACE FUNCTION ptw_permit_status_event() RETURNS trigger
   LANGUAGE plpgsql AS $$
   BEGIN
     IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
       RETURN NEW;
     END IF;
     PERFORM ptw_record_event(NEW.id,
       ptw_step_key(NEW.status::text,
         (SELECT wi."currentStepName" FROM "WorkflowInstance" wi WHERE wi.module = 'PTW' AND wi."recordId" = NEW.id)),
       'default');
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS "Permit_ptw_event" ON "Permit"`,
  `CREATE TRIGGER "Permit_ptw_event" AFTER INSERT OR UPDATE OF "status" ON "Permit"
     FOR EACH ROW EXECUTE FUNCTION ptw_permit_status_event()`,

  `CREATE OR REPLACE FUNCTION ptw_workflow_step_event() RETURNS trigger
   LANGUAGE plpgsql AS $$
   DECLARE
     v_status TEXT;
   BEGIN
     IF NEW.module <> 'PTW' THEN
       RETURN NEW;
     END IF;
     IF TG_OP = 'UPDATE' AND NEW."currentStepName" IS NOT DISTINCT FROM OLD."currentStepName" THEN
       RETURN NEW;
     END IF;
     SELECT p.status::text INTO v_status FROM "Permit" p WHERE p.id = NEW."recordId";
     IF v_status IS NULL THEN
       RETURN NEW;
     END IF;
     PERFORM ptw_record_event(NEW."recordId", ptw_step_key(v_status, NEW."currentStepName"), 'default');
     RETURN NEW;
   END $$`,
  `DROP TRIGGER IF EXISTS "WorkflowInstance_ptw_event" ON "WorkflowInstance"`,
  `CREATE TRIGGER "WorkflowInstance_ptw_event" AFTER INSERT OR UPDATE OF "currentStepName" ON "WorkflowInstance"
     FOR EACH ROW EXECUTE FUNCTION ptw_workflow_step_event()`,
];

// One synthetic event per permit that has none, at the best-known time its
// current step began. Only touches permits with no PermitEvent row at all.
const BACKFILL = `
INSERT INTO "PermitEvent" ("id", "tenantId", "permitId", "fromStep", "toStep", "note", "synthetic", "createdAt")
SELECT md5(random()::text || p.id), 'default', p.id, NULL, k.step, 'backfill', true,
       coalesce(
         CASE
           WHEN k.step IN ('ISSUER_REVIEW','SAFETY_REVIEW','PLANT_HEAD_APPROVAL','APPROVAL') THEN
             (SELECT max(t."assignedAt") FROM "WorkflowTask" t
               WHERE t.module = 'PTW' AND t."recordId" = p.id AND t.status IN ('PENDING','OVERDUE','ESCALATED'))
           WHEN k.step = 'AWAITING_ACCEPT' THEN p."issuedAt"
           WHEN k.step = 'ACTIVE' THEN p."activatedAt"
           WHEN k.step = 'SUSPENDED' THEN p."suspendedAt"
           WHEN k.step = 'CLOSURE_PENDING' THEN coalesce(p."siteVerifiedAt", p."workCompletedAt")
           WHEN k.step = 'CLOSED' THEN p."closedAt"
           WHEN k.step = 'EXPIRED' THEN coalesce(p."autoExpiredAt", p."expiredAt", p."validTo")
           WHEN k.step = 'CANCELLED' THEN p."cancelledAt"
         END,
         p."createdAt")
FROM "Permit" p
CROSS JOIN LATERAL (SELECT ptw_step_key(p.status::text,
    (SELECT wi."currentStepName" FROM "WorkflowInstance" wi WHERE wi.module = 'PTW' AND wi."recordId" = p.id)) AS step) k
WHERE NOT EXISTS (SELECT 1 FROM "PermitEvent" e WHERE e."permitId" = p.id)`;

// Same values as app/services/ptw_ops/defaults.py.
const IMPAIRMENT_RULES: [string, string, string, string[]][] = [
  ["sprinkler", "HOT_WORK", "block_new", ["fire_watch", "fire_officer_cosign"]],
  ["fire_detection", "HOT_WORK", "block_new", ["fire_watch", "fire_officer_cosign"]],
  ["gas_detection", "CONFINED_SPACE", "require_controls", ["continuous_gas_monitor", "attendant"]],
  ["gas_detection", "HOT_WORK", "require_controls", ["continuous_gas_monitor", "attendant"]],
  ["fire_alarm", "*", "require_controls", ["hourly_patrol", "no_unattended_work"]],
  ["fire_alarm", "HOT_WORK", "block_new", ["fire_watch", "hourly_patrol"]],
];
const SIMOPS_RULES: [string, string, number | null, boolean, string][] = [
  ["HOT_WORK", "CONFINED_SPACE", 15, true, "critical"],
  ["HOT_WORK", "EXCAVATION", 10, true, "critical"],
  ["HOT_WORK", "ELECTRICAL_LOTO", null, true, "high"],
  ["LIFTING", "WORK_AT_HEIGHT", null, true, "high"],
  ["LIFTING", "EXCAVATION", null, true, "high"],
  ["CONFINED_SPACE", "ELECTRICAL_LOTO", null, true, "high"],
];

async function main() {
  console.log("→ PTW Control Center DDL\n");
  for (const sql of STATEMENTS) {
    const head = sql.replace(/\s+/g, " ").slice(0, 90);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓ ${head}`);
    } catch (e: any) {
      console.error(`  ✗ ${head}\n    ${e?.message ?? e}`);
      throw e;
    }
  }

  const n = await prisma.$executeRawUnsafe(BACKFILL);
  console.log(`\n  ✓ PermitEvent backfill: ${n} synthetic event(s)`);

  let rules = 0;
  for (const [i, [system, ptype, effect, controls]] of IMPAIRMENT_RULES.entries()) {
    rules += await prisma.$executeRaw`
      INSERT INTO "ImpairmentRule" ("id", "systemType", "permitType", "effect", "requiredControls")
      VALUES (${`default-imp-${i}`}, ${system}, ${ptype}, ${effect}, ${controls})
      ON CONFLICT ("id") DO NOTHING`;
  }
  for (const [i, [a, b, dist, same, sev]] of SIMOPS_RULES.entries()) {
    rules += await prisma.$executeRaw`
      INSERT INTO "SimopsRule" ("id", "permitTypeA", "permitTypeB", "minDistanceM", "sameArea", "severity")
      VALUES (${`default-simops-${i}`}, ${a}, ${b}, ${dist}, ${same}, ${sev})
      ON CONFLICT ("id") DO NOTHING`;
  }
  console.log(`  ✓ default rules inserted: ${rules} (existing rows left untouched)`);

  const [{ events }] = await prisma.$queryRawUnsafe<{ events: bigint }[]>(
    `SELECT count(*)::bigint AS events FROM "PermitEvent"`
  );
  console.log(`\n✅ PTW Control Center DDL applied. PermitEvent rows: ${events}`);
}

main()
  .catch((e) => {
    console.error("❌ DDL failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
