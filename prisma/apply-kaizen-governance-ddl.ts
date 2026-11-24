// DDL for the Kaizen governance fields the backend has mapped since the first
// commit (app/models/kaizen.py) but that no script ever created. Found in the
// 2026-11-24 production schema audit: every KaizenPost query selects these
// columns, so the Kaizen screens 500 on "column KaizenPost.aiDuplicateFlag does
// not exist" until this runs.
//
//   npx tsx prisma/apply-kaizen-governance-ddl.ts     (npm run db:apply-kaizen-governance)
//
// Additive and idempotent: five nullable/defaulted columns on KaizenPost and
// one new table. Nothing is dropped, renamed or rewritten.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `ALTER TABLE "KaizenPost" ADD COLUMN IF NOT EXISTS "aiDuplicateFlag" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "KaizenPost" ADD COLUMN IF NOT EXISTS "aiLinkedTransactionId" TEXT`,
  `ALTER TABLE "KaizenPost" ADD COLUMN IF NOT EXISTS "aiCategorySuggestion" TEXT`,
  `ALTER TABLE "KaizenPost" ADD COLUMN IF NOT EXISTS "aiFlagReason" TEXT`,
  `ALTER TABLE "KaizenPost" ADD COLUMN IF NOT EXISTS "committeeRotationId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "KaizenCommitteeRotation" (
     "id" TEXT PRIMARY KEY,
     "plantId" TEXT NOT NULL,
     "periodMonth" TEXT NOT NULL,
     "memberUserIds" TEXT[] NOT NULL DEFAULT '{}',
     "hseManagerSeat" BOOLEAN NOT NULL DEFAULT false,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS "KaizenCommitteeRotation_plantId_idx" ON "KaizenCommitteeRotation" ("plantId")`,
];

async function main() {
  console.log("→ Kaizen governance DDL\n");
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${sql.replace(/\s+/g, " ").slice(0, 90)}`);
  }
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'KaizenPost'
       AND column_name IN ('aiDuplicateFlag','aiLinkedTransactionId','aiCategorySuggestion','aiFlagReason','committeeRotationId')`
  );
  if (cols.length !== 5) throw new Error(`Expected 5 KaizenPost columns, found ${cols.length}`);
  console.log("\n✅ Kaizen governance columns and KaizenCommitteeRotation in place.");
}

main()
  .catch((e) => {
    console.error("❌ DDL failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
