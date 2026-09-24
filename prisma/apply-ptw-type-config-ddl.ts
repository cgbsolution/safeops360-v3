// DDL applier for per-plant PTW permit-type curation. Additive + idempotent:
// one new config table, no change to any existing table or column. A plant with
// no row keeps the full permit-type set and the Hot Work default.
//   npx tsx prisma/apply-ptw-type-config-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "PlantPermitTypeConfig" (
    "plantId" TEXT NOT NULL,
    "enabledTypes" TEXT[] NOT NULL,
    "defaultType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlantPermitTypeConfig_pkey" PRIMARY KEY ("plantId"),
    CONSTRAINT "PlantPermitTypeConfig_plant_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE)`,
  // The default card must be one of the enabled cards, and the set can't be empty.
  `DO $$ BEGIN
     ALTER TABLE "PlantPermitTypeConfig" ADD CONSTRAINT "PlantPermitTypeConfig_default_enabled"
       CHECK ("defaultType" = ANY ("enabledTypes") AND cardinality("enabledTypes") > 0);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log("✓", sql.split("\n")[0].slice(0, 90));
  }
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "PlantPermitTypeConfig"`);
  console.log(`PTW type-config table ready. Plants with curation: ${n} (others keep the full set).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
