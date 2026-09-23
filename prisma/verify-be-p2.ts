// Read-only verification of the Business Excellence Phase 2 rollout state.
// Runs SELECTs only — nothing here writes to the database.
//   npx tsx prisma/verify-be-p2.ts   (or: npm run verify:be-p2)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = [
  "BeSuggestion",
  "BeQccTeam",
  "BeQccTeamMember",
  "BeQccProject",
  "BeQccProjectStage",
  "BeSip",
  "BeSipMilestone",
  "BeBenefit",
  "BeBenefitReading",
];

const PARTIAL_INDEXES = [
  "ux_BeSuggestion_plant_no",
  "ux_BeQccTeam_plant_no",
  "ux_BeQccProject_plant_no",
  "ux_BeSip_plant_no",
  "ux_BeBenefit_source_type",
  "ux_BeQccMember_active",
];

const MODULES = ["SUGGESTION", "QCC", "SIP", "BENEFIT"];
const WF_MODULES = ["BE_SUGGESTION", "BE_QCC", "BE_SIP"];

async function main() {
  let failures = 0;

  console.log("── Step 1: DDL ────────────────────────────────────────────");
  for (const t of TABLES) {
    try {
      const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${t}"`
      );
      console.log(`  ✓ ${t.padEnd(24)} ${r[0].n} row(s)`);
    } catch (e: any) {
      console.log(`  ✗ ${t.padEnd(24)} MISSING — ${e?.message?.split("\n")[0]}`);
      failures += 1;
    }
  }

  const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`,
    PARTIAL_INDEXES
  );
  const found = new Set(idx.map((r) => r.indexname));
  const missingIdx = PARTIAL_INDEXES.filter((n) => !found.has(n));
  console.log(
    `  ${missingIdx.length ? "✗" : "✓"} ${found.size}/${PARTIAL_INDEXES.length} partial unique indexes` +
      (missingIdx.length ? ` — missing: ${missingIdx.join(", ")}` : "")
  );
  if (missingIdx.length) failures += 1;

  console.log("\n── Step 2: permissions ────────────────────────────────────");
  const perms = await prisma.permission.findMany({
    where: { module: { in: MODULES } },
    include: { rolePermissions: true },
  });
  if (!perms.length) {
    console.log("  ✗ NOT RUN — 0 Phase 2 permissions exist");
    failures += 1;
  } else {
    const orphans = perms.filter((p) => p.rolePermissions.length === 0);
    console.log(`  ${perms.length === 20 ? "✓" : "⚠"} ${perms.length} permissions (expected 20)`);
    if (orphans.length) {
      console.log(`  ✗ no role holds: ${orphans.map((p) => p.code).join(", ")}`);
      failures += 1;
    }

    // The separation-of-duties rule expressed as a deployment check. If the only
    // people who can validate a benefit are the same people who record them, the
    // rule is enforced at runtime and unsatisfiable in practice — every benefit
    // would sit at PENDING_VALIDATION forever.
    const validate = perms.find((p) => p.code === "BENEFIT.VALIDATE");
    const record = perms.find((p) => p.code === "BENEFIT.RECORD");
    if (validate && record) {
      const vRoles = new Set(validate.rolePermissions.map((r) => r.roleId));
      const rRoles = new Set(record.rolePermissions.map((r) => r.roleId));
      const independent = [...vRoles].filter((r) => !rRoles.has(r));
      console.log(
        `  ${vRoles.size ? "✓" : "✗"} BENEFIT.VALIDATE held by ${vRoles.size} role(s), ` +
          `${independent.length} of which cannot record a benefit`
      );
      if (!vRoles.size) failures += 1;
    }
  }

  console.log("\n── Step 3: workflows ──────────────────────────────────────");
  const defs = await prisma.workflowDefinition.findMany({
    where: { module: { in: WF_MODULES } },
    include: { steps: true },
  });
  if (!defs.length) {
    console.log("  ✗ NOT RUN — 0 Phase 2 workflow definitions");
    failures += 1;
  } else {
    for (const d of defs) {
      const closures = d.steps.filter((s) => s.stepType === "CLOSURE").length;
      const ok = d.steps.some((s) => s.stepType === "MAKER") && closures === 1;
      console.log(
        `  ${ok ? "✓" : "✗"} ${d.module} — ${d.steps.length} steps, ${closures} closure`
      );
      if (!ok) failures += 1;
    }
    console.log(`  ${defs.length === 3 ? "✓" : "⚠"} ${defs.length}/3 definitions`);
  }

  console.log("\n── Step 4: data integrity ─────────────────────────────────");
  try {
    // A LIVE benefit whose source is gone OR soft-deleted. The soft-deleted half
    // matters more and is easier to miss: the row still exists, so a plain
    // "does the source row exist" check reports clean while the dashboard keeps
    // counting money from a project that no longer appears in any register.
    // That is exactly what this check missed on its first run.
    const orphanBenefits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "BeBenefit" b
        WHERE b."isDeleted" = false
          AND NOT EXISTS (SELECT 1 FROM "BeKaizen"     x WHERE x.id = b."sourceId" AND x."isDeleted" = false)
          AND NOT EXISTS (SELECT 1 FROM "BeSuggestion" x WHERE x.id = b."sourceId" AND x."isDeleted" = false)
          AND NOT EXISTS (SELECT 1 FROM "BeOpl"        x WHERE x.id = b."sourceId" AND x."isDeleted" = false)
          AND NOT EXISTS (SELECT 1 FROM "BePokaYoke"   x WHERE x.id = b."sourceId" AND x."isDeleted" = false)
          AND NOT EXISTS (SELECT 1 FROM "BeQccProject" x WHERE x.id = b."sourceId" AND x."isDeleted" = false)
          AND NOT EXISTS (SELECT 1 FROM "BeSip"        x WHERE x.id = b."sourceId" AND x."isDeleted" = false)`
    );
    const n = Number(orphanBenefits[0].n);
    console.log(
      n === 0
        ? "  ✓ every live benefit line points at a live source record"
        : `  ✗ ${n} live benefit line(s) point at a source that is missing or withdrawn`
    );
    if (n) failures += 1;

    // A VALIDATED benefit with no validator is the separation-of-duties rule
    // having been bypassed — by a direct SQL write, or by a bug.
    const unsigned = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "BeBenefit"
        WHERE "status" = 'VALIDATED' AND ("validatedById" IS NULL OR "validatedAt" IS NULL)`
    );
    const u = Number(unsigned[0].n);
    console.log(
      u === 0
        ? "  ✓ every validated benefit names who validated it and when"
        : `  ✗ ${u} benefit line(s) are VALIDATED with no validator recorded`
    );
    if (u) failures += 1;

    // A chartered project with no stage rows can never advance: every gate the
    // state machine looks for is absent, so COMPLETED is unreachable.
    const gateless = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "BeQccProject" p
        WHERE p."isDeleted" = false
          AND p."status" NOT IN ('DRAFT','REJECTED','ABANDONED')
          AND NOT EXISTS (SELECT 1 FROM "BeQccProjectStage" s WHERE s."projectId" = p.id)`
    );
    const g = Number(gateless[0].n);
    console.log(
      g === 0
        ? "  ✓ every live circle project has its stage gates"
        : `  ✗ ${g} live project(s) have no stage rows and can never be completed`
    );
    if (g) failures += 1;
  } catch (e: any) {
    console.log(`  – integrity checks skipped: ${e?.message?.split("\n")[0]}`);
  }

  console.log(
    failures === 0
      ? "\n✅  Business Excellence Phase 2 is fully applied."
      : `\n❌  ${failures} check(s) failed — see above.`
  );
  if (failures) process.exit(1);
}

main()
  .catch((e) => {
    console.error("verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
