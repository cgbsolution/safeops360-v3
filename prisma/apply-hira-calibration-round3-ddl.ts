// One-off DDL applier for HIRA calibration round 3 (NOT YET RUN).
//
// Adds (additive, idempotent):
//   HiraStudy.hiraType  TEXT, nullable  -- TASK_BASED | HAZOP_PHA | FMEA | FIRE_EXPLOSION_STUDY |
//                                          MOC_RISK | EMERGENCY_SCENARIO | OCC_HEALTH | OTHER
//
// No backfill: existing studies (including ACTIVE ones) are not touched. While
// the column is NULL the backend derives the type at read time
// (app/services/hira_calibration/loader.py `_hira_type`): TASK_BASED when the
// entry has the activity / hazard / controls structure, otherwise OTHER.
// Calibration v2 rules run only for TASK_BASED.
//
// Run after prisma/apply-hira-calibration-ddl.ts. The column is read by the
// Python backend with plain SQL after a schema check; add it to the HiraStudy
// model in schema.prisma once this has run everywhere the Prisma client runs.
//   npx tsx prisma/apply-hira-calibration-round3-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `ALTER TABLE "HiraStudy" ADD COLUMN IF NOT EXISTS "hiraType" TEXT`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HiraStudy_hiraType_check') THEN
       ALTER TABLE "HiraStudy" ADD CONSTRAINT "HiraStudy_hiraType_check" CHECK ("hiraType" IS NULL OR "hiraType" IN
         ('TASK_BASED','HAZOP_PHA','FMEA','FIRE_EXPLOSION_STUDY','MOC_RISK','EMERGENCY_SCENARIO','OCC_HEALTH','OTHER'));
     END IF;
   END $$`,
];

async function main() {
  console.log("Applying HIRA calibration round 3 DDL…");
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${sql.trim().split("\n")[0].slice(0, 80)}`);
  }
  console.log("✅  HiraStudy.hiraType ready (NULL = derived at read time; no study was changed).");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
