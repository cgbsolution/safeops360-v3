// DDL applier for the EPC tenant partition (backend: app/services/tenant_partition.py).
// Additive + idempotent: adds "tenantId" TEXT NOT NULL DEFAULT 'default' to any EPC
// table that lacks it (today only "ContractorCompany"), and a tenantId index on each.
// Every existing row lands in 'default', so existing users see no change.
//   npx tsx prisma/apply-epc-tenant-partition-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EPC_TABLES = [
  "ConstructionSite",
  "ContractorCompany",
  "ContractorWorker",
  "MobilizationRecord",
  "SiteInduction",
  "GateClearanceCheck",
  "GatePass",
  "SiteComplianceConfig",
];

async function main() {
  for (const table of EPC_TABLES) {
    // ADD COLUMN IF NOT EXISTS with a constant default is metadata-only on PG11+.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default'`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ix_${table}_tenantId" ON "${table}" ("tenantId")`,
    );
    const rows = await prisma.$queryRawUnsafe<{ tenantId: string; n: bigint }[]>(
      `SELECT "tenantId", count(*) AS n FROM "${table}" GROUP BY 1 ORDER BY 1`,
    );
    console.log("✓", table, rows.map((r) => `${r.tenantId}=${r.n}`).join(", ") || "(empty)");
  }
  console.log("EPC tenant partition columns ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
