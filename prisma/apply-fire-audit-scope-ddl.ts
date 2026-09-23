// DDL applier for Fire Safety AUDIT scope — which fire assets a CAMS Fire
// Safety audit engagement covers. Additive + idempotent: one new link table.
//
// A routine checklist run is one CamsEngagement per (asset, template, period)
// and carries its asset in `sourceEntityId`. An AUDIT covers many assets, so the
// "Include in audit" action on an asset writes a row here instead.
//   npx tsx prisma/apply-fire-audit-scope-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "CamsEngagementAsset" (
    "id" TEXT NOT NULL, "engagementId" TEXT NOT NULL, "sourceModule" TEXT NOT NULL DEFAULT 'FIRE',
    "entityId" TEXT NOT NULL, "addedBy" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CamsEngagementAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CamsEngagementAsset_engagement_fkey" FOREIGN KEY ("engagementId")
      REFERENCES "CamsEngagement"("id") ON DELETE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_CamsEngagementAsset" ON "CamsEngagementAsset" ("engagementId","sourceModule","entityId")`,
  `CREATE INDEX IF NOT EXISTS "ix_CamsEngagementAsset_entity" ON "CamsEngagementAsset" ("sourceModule","entityId")`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log("✓", sql.split("\n")[0].slice(0, 90));
  }
  console.log("✅  CamsEngagementAsset ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
