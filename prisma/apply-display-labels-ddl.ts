// DDL applier for the tenant display-label override layer. Additive + idempotent:
// three new config tables, no change to any existing table or column.
//   npx tsx prisma/apply-display-labels-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "DisplayLabelProfile" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisplayLabelProfile_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DisplayLabelProfile_code_key" ON "DisplayLabelProfile" ("code")`,

  `CREATE TABLE IF NOT EXISTS "DisplayLabel" (
    "id" TEXT NOT NULL, "profileCode" TEXT NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisplayLabel_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DisplayLabel_profile_key_key" ON "DisplayLabel" ("profileCode","key")`,
  `CREATE INDEX IF NOT EXISTS "ix_DisplayLabel_profile" ON "DisplayLabel" ("profileCode")`,
  // A blank label would render as an empty string; the resolver already ignores
  // blanks, and this keeps them out of the table in the first place.
  `DO $$ BEGIN
     ALTER TABLE "DisplayLabel" ADD CONSTRAINT "DisplayLabel_label_nonblank" CHECK (length(btrim("label")) > 0);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `CREATE TABLE IF NOT EXISTS "PlantDisplayProfile" (
    "plantId" TEXT NOT NULL, "profileCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlantDisplayProfile_pkey" PRIMARY KEY ("plantId"),
    CONSTRAINT "PlantDisplayProfile_plant_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "ix_PlantDisplayProfile_profile" ON "PlantDisplayProfile" ("profileCode")`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log("✓", sql.split("\n")[0].slice(0, 90));
  }
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "PlantDisplayProfile"`);
  console.log(`Display-label tables ready. Plants with a profile: ${n} (existing plants have none → defaults).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
