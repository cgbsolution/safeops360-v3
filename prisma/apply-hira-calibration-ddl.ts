// One-off DDL applier for HIRA calibration v2 (feature flag hira.calibration.v2).
//
// Adds (all additive, idempotent):
//   HiraEntryHazard  likelihoodScore / severityScore / rationales / ratingSource / regulationSuggested
//                    (R2: each hazard carries its own rating)
//   HiraEntryControl appliesToHazardIds        (controls credit only the hazards they address)
//   HiraEntryRecommendedControl ownerRole / appliesToHazardIds / calibrationRef
//   HiraCalibrationConfig   versioned settings per tenant (plantId NULL) / plant, incl. the flag mode
//   HiraRegulationMap       hazard -> suggested regulation reference (editable without a deploy)
//   hira_copilot_shadow_runs  v1 / v2 side-by-side log
//
// Data:
//   STD_5X5 cell L2 x S2 -> MODERATE, so every cell follows one set of bands
//   (<=3 LOW, 4-6 MODERATE, 8-12 HIGH, >=15 CRITICAL). Stored entries are NOT
//   changed: an entry saved as L2 x S2 = LOW keeps that until it is next edited
//   (which creates a new version on approved/active studies, as today).
//   Seeds the default regulation map rows (Factories Act, 1948; marked "verify").
//   No calibration config rows are created: the flag stays OFF everywhere.
//
// Applied through the Prisma client's connection, like the other apply-*-ddl.ts
// scripts (prisma migrate / db push are not usable against this pooler).
//   npx tsx prisma/apply-hira-calibration-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REGULATION_MAP: { family: string; regulation: string; section: string }[] = [
  { family: "LIFTING", regulation: "Factories Act, 1948", section: "Sec. 29 (lifting machines, chains, ropes and lifting tackles)" },
  { family: "HEIGHT", regulation: "Factories Act, 1948", section: "Sec. 32 (floors, stairs and means of access); Sec. 33 (pits, sumps, openings in floors)" },
  { family: "MACHINERY", regulation: "Factories Act, 1948", section: "Sec. 21 (fencing of machinery)" },
  { family: "PRESSURE", regulation: "Factories Act, 1948", section: "Sec. 31 (pressure plant)" },
  { family: "FIRE_EXPLOSION", regulation: "Factories Act, 1948", section: "Sec. 38 (precautions in case of fire)" },
  { family: "DUST", regulation: "Factories Act, 1948", section: "Sec. 14 (dust and fume)" },
  { family: "MANUAL_HANDLING", regulation: "Factories Act, 1948", section: "Sec. 34 (excessive weights)" },
  { family: "CONFINED_SPACE", regulation: "Factories Act, 1948", section: "Sec. 36 (precautions against dangerous fumes, gases, etc.)" },
];

const STATEMENTS: string[] = [
  // ── per-hazard rating ──
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "likelihoodScore" INTEGER`,
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "severityScore" INTEGER`,
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "likelihoodRationale" TEXT`,
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "severityRationale" TEXT`,
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "ratingSource" TEXT`,
  `ALTER TABLE "HiraEntryHazard" ADD COLUMN IF NOT EXISTS "regulationSuggested" BOOLEAN NOT NULL DEFAULT false`,

  // ── control -> hazard link ──
  `ALTER TABLE "HiraEntryControl" ADD COLUMN IF NOT EXISTS "appliesToHazardIds" JSONB`,

  // ── recommendation owner role / targets / catalogue ref ──
  `ALTER TABLE "HiraEntryRecommendedControl" ADD COLUMN IF NOT EXISTS "ownerRole" TEXT`,
  `ALTER TABLE "HiraEntryRecommendedControl" ADD COLUMN IF NOT EXISTS "appliesToHazardIds" JSONB`,
  `ALTER TABLE "HiraEntryRecommendedControl" ADD COLUMN IF NOT EXISTS "calibrationRef" TEXT`,

  // ── versioned calibration settings + flag ──
  `CREATE TABLE IF NOT EXISTS "HiraCalibrationConfig" (
     "id" TEXT PRIMARY KEY,
     "plantId" TEXT,
     "version" INTEGER NOT NULL DEFAULT 1,
     "mode" TEXT NOT NULL DEFAULT 'OFF',
     "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "note" TEXT,
     "createdById" TEXT,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "HiraCalibrationConfig_plantId_idx" ON "HiraCalibrationConfig" ("plantId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HiraCalibrationConfig_plant_version_key"
     ON "HiraCalibrationConfig" (COALESCE("plantId", ''), "version")`,

  // ── regulation map ──
  `CREATE TABLE IF NOT EXISTS "HiraRegulationMap" (
     "id" TEXT PRIMARY KEY,
     "plantId" TEXT,
     "hazardCode" TEXT,
     "hazardCategory" TEXT,
     "family" TEXT,
     "regulation" TEXT NOT NULL,
     "section" TEXT,
     "note" TEXT,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "sortOrder" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "HiraRegulationMap_plantId_idx" ON "HiraRegulationMap" ("plantId")`,

  // ── shadow log ──
  `CREATE TABLE IF NOT EXISTS "hira_copilot_shadow_runs" (
     "id" TEXT PRIMARY KEY,
     "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
     "plant_id" TEXT,
     "entry_id" TEXT,
     "surface" TEXT NOT NULL,
     "mode" TEXT NOT NULL,
     "engine_version" TEXT NOT NULL,
     "config_version" JSONB,
     "v1" JSONB,
     "v2" JSONB,
     "summary" JSONB,
     "user_id" TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS "hira_copilot_shadow_runs_plant_idx" ON "hira_copilot_shadow_runs" ("plant_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "hira_copilot_shadow_runs_entry_idx" ON "hira_copilot_shadow_runs" ("entry_id")`,

  // ── one set of bands: STD_5X5 L2 x S2 = 4 is MODERATE (as L1 x S4 and L4 x S1) ──
  `UPDATE "RiskMatrixCell" c SET "riskLevel" = 'MODERATE', "colorHex" = '#F59E0B',
       "actionRequired" = 'Reduce ALARP', "responseTimeDays" = 60
     FROM "RiskMatrix" m
     WHERE m.id = c."matrixId" AND m.code = 'STD_5X5'
       AND c."likelihoodScore" = 2 AND c."severityScore" = 2 AND c."riskLevel" <> 'MODERATE'`,
];

async function main() {
  console.log("Applying HIRA calibration v2 DDL…");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 80);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  // Seed the default regulation map once (rows stay editable afterwards).
  const existing = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*)::bigint AS c FROM "HiraRegulationMap" WHERE "plantId" IS NULL`
  );
  if (Number(existing[0].c) === 0) {
    let i = 0;
    for (const r of REGULATION_MAP) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "HiraRegulationMap" ("id","plantId","family","regulation","section","note","sortOrder")
         VALUES (md5(random()::text || clock_timestamp()::text), NULL, $1, $2, $3, $4, $5)`,
        r.family, r.regulation, r.section, "Suggested mapping - verify applicability for the plant and state.", i++
      );
    }
    console.log(`  ✓ seeded ${REGULATION_MAP.length} regulation map rows`);
  }

  const cell = await prisma.$queryRawUnsafe<{ level: string }[]>(
    `SELECT c."riskLevel" AS level FROM "RiskMatrixCell" c JOIN "RiskMatrix" m ON m.id = c."matrixId"
      WHERE m.code = 'STD_5X5' AND c."likelihoodScore" = 2 AND c."severityScore" = 2`
  );
  console.log(`✅  Calibration v2 schema ready. STD_5X5 L2xS2 = ${cell[0]?.level ?? "n/a"}. Flag mode: OFF (no config rows).`);
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
