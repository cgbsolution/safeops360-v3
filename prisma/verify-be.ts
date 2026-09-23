// Read-only verification of the Business Excellence rollout state.
// Runs SELECTs only — nothing here writes to the database.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = [
  "BeKaizen",
  "BeOpl",
  "BeOplAcknowledgement",
  "BePokaYoke",
  "BePokaYokeVerification",
];

async function main() {
  console.log("── Step 1: DDL ────────────────────────────────────────────");
  for (const t of TABLES) {
    try {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${t}"`
      );
      console.log(`  ✓ ${t.padEnd(24)} ${r[0].n} row(s)`);
    } catch (e: any) {
      console.log(`  ✗ ${t.padEnd(24)} MISSING — ${e?.message?.split("\n")[0]}`);
    }
  }

  const col = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'RootCauseAnalysis' AND column_name = 'sourceProblemId'`
  );
  console.log(
    col.length
      ? '  ✓ RootCauseAnalysis."sourceProblemId" present'
      : '  ✗ RootCauseAnalysis."sourceProblemId" MISSING — every RCA query will 500'
  );

  // Partial unique indexes (Prisma cannot express these; apply-be-ddl.ts owns them)
  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes
      WHERE indexname IN ('ux_BeKaizen_plant_no','ux_BeOpl_plant_no','ux_BePokaYoke_plant_no')`
  );
  console.log(`  ${idx.length === 3 ? "✓" : "✗"} ${idx.length}/3 partial unique number indexes`);

  console.log("\n── Step 2: permissions ────────────────────────────────────");
  const perms = await prisma.permission.findMany({
    where: { module: { in: ["KAIZEN", "OPL", "POKAYOKE"] } },
    include: { rolePermissions: true },
  });
  if (!perms.length) {
    console.log("  ✗ NOT RUN — 0 BE permissions exist");
  } else {
    const orphans = perms.filter((p) => p.rolePermissions.length === 0);
    console.log(`  ✓ ${perms.length} permissions (expected 17)`);
    if (orphans.length) {
      console.log(`  ⚠ no role holds: ${orphans.map((p) => p.code).join(", ")}`);
    }
  }

  console.log("\n── Step 3: workflows ──────────────────────────────────────");
  const defs = await prisma.workflowDefinition.findMany({
    where: { module: { in: ["BE_KAIZEN", "BE_OPL", "BE_POKA_YOKE"] } },
    include: { steps: true },
  });
  if (!defs.length) {
    console.log("  ✗ NOT RUN — 0 BE workflow definitions");
  } else {
    for (const d of defs) {
      console.log(
        `  ✓ ${d.module}${d.recordType ? ` (${d.recordType})` : ""} — ${d.steps.length} steps`
      );
    }
    console.log(`  ${defs.length === 4 ? "✓" : "⚠"} ${defs.length}/4 definitions`);
  }

  console.log("\n── Step 4: CAPA source ────────────────────────────────────");
  const st = await prisma.capaSourceType.findUnique({
    where: { code: "POKA_YOKE_FAILURE" },
    include: { category: true },
  });
  console.log(
    st
      ? `  ✓ POKA_YOKE_FAILURE → ${st.category.name} (prefix "${st.category.prefix}"), active=${st.isActive}`
      : "  ✗ NOT RUN — a failed device check would raise no CAPA"
  );
}

main()
  .catch((e) => {
    console.error("verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
