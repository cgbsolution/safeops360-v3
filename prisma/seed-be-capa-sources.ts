// CAPA source types for Business Excellence.
//
// Additive upsert on natural keys — touches only the two source types and two
// SLA profiles below, and reads the QUALITY / ORGANIZATIONAL categories that
// seed-capa-masters.ts already owns. It does NOT re-seed the CAPA masters.
//   npx tsx prisma/seed-be-capa-sources.ts   (or: npm run seed:be-capa-sources)
//
// POKA_YOKE_FAILURE is the one the code actually calls: a failed periodic
// verification auto-raises a CAPA through services/capa_spawn.py, and
// spawn_capa resolves the source type by this exact code. Until this seed has
// run, that spawn returns null and the failure is recorded on the device with
// no corrective action attached — the verification itself is never lost (the
// spawn sits inside a savepoint), but nobody is tasked with fixing the device.
//
// KAIZEN_INITIATIVE already exists from seed-capa-masters.ts, so it is NOT
// re-created here. It is only re-pointed at the now-live parent module, which
// is a two-field update rather than a new row.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_TYPES = [
  {
    code: "POKA_YOKE_FAILURE",
    name: "Poka Yoke Verification Failure",
    // QUALITY, not SAFETY: a mistake-proofing device that stopped working is a
    // defect-escape risk. Filing it under SAFETY would put it in the wrong
    // queue and give it a CAPA number with the wrong prefix.
    categoryCode: "QUALITY",
    parentModuleLive: true,
    parentModuleName: "POKAYOKE",
    sortOrder: 17,
    description:
      "A mistake-proofing device failed its scheduled check. The line is running without the protection the device was installed to provide, so containment comes before root cause.",
  },
];

// Only ever UPDATES an existing row — never creates one. If seed-capa-masters
// has not been run in this tenant the update is silently skipped rather than
// inventing a source type that file owns.
const REPOINTED = [
  {
    code: "KAIZEN_INITIATIVE",
    parentModuleLive: true,
    parentModuleName: "KAIZEN",
    description:
      "A shop-floor improvement that needs tracked corrective action — raised from the Business Excellence Kaizen register.",
  },
];

const SLA_PROFILES = [
  {
    code: "POKA_YOKE_FAILURE_DEF",
    sourceTypeCode: "POKA_YOKE_FAILURE",
    severity: null as string | null,
    // Deliberately tight. Every hour this device is down is a shift running
    // without the control, so the clock is set by exposure rather than by the
    // convenience of the investigation.
    initialResponseHours: 8,
    rcaDueDays: 7,
    actionsPlannedDueDays: 10,
    closureTargetDays: 30,
    recurrenceCheckDays: 60,
  },
  {
    code: "KAIZEN_INITIATIVE_DEF",
    sourceTypeCode: "KAIZEN_INITIATIVE",
    severity: null as string | null,
    // An improvement action is not an incident. A long, honest clock beats a
    // short one everybody misses and then ignores.
    initialResponseHours: 168,
    rcaDueDays: 30,
    actionsPlannedDueDays: 45,
    closureTargetDays: 120,
    recurrenceCheckDays: 90,
  },
];

async function main() {
  console.log("Seeding Business Excellence CAPA sources…\n");

  for (const st of SOURCE_TYPES) {
    const category = await prisma.capaSourceCategory.findUnique({
      where: { code: st.categoryCode },
    });
    if (!category) {
      throw new Error(
        `CAPA source category "${st.categoryCode}" is missing. Run ` +
          "prisma/seed-capa-masters.ts first — this script is additive and does " +
          "not own the category taxonomy."
      );
    }
    await prisma.capaSourceType.upsert({
      where: { code: st.code },
      create: {
        code: st.code,
        name: st.name,
        description: st.description,
        categoryId: category.id,
        parentModuleLive: st.parentModuleLive,
        parentModuleName: st.parentModuleName,
        sortOrder: st.sortOrder,
        isActive: true,
      },
      update: {
        name: st.name,
        description: st.description,
        categoryId: category.id,
        parentModuleLive: st.parentModuleLive,
        parentModuleName: st.parentModuleName,
        isActive: true,
      },
    });
    console.log(`  ✓ source type ${st.code} (${st.categoryCode})`);
  }

  for (const r of REPOINTED) {
    const existing = await prisma.capaSourceType.findUnique({ where: { code: r.code } });
    if (!existing) {
      console.log(`  – ${r.code} not present in this tenant, skipped`);
      continue;
    }
    await prisma.capaSourceType.update({
      where: { code: r.code },
      data: {
        parentModuleLive: r.parentModuleLive,
        parentModuleName: r.parentModuleName,
        description: r.description,
      },
    });
    console.log(`  ✓ ${r.code} re-pointed at the live ${r.parentModuleName} module`);
  }

  for (const p of SLA_PROFILES) {
    // Skip a profile whose source type is absent rather than creating an
    // orphan the SLA resolver would never find.
    const st = await prisma.capaSourceType.findUnique({
      where: { code: p.sourceTypeCode },
    });
    if (!st) {
      console.log(`  – SLA ${p.code} skipped (source type absent)`);
      continue;
    }
    await prisma.capaSlaProfile.upsert({
      where: { code: p.code },
      create: { ...p, isActive: true },
      update: {
        initialResponseHours: p.initialResponseHours,
        rcaDueDays: p.rcaDueDays,
        actionsPlannedDueDays: p.actionsPlannedDueDays,
        closureTargetDays: p.closureTargetDays,
        recurrenceCheckDays: p.recurrenceCheckDays,
        isActive: true,
      },
    });
    console.log(
      `  ✓ SLA ${p.code} — respond ${p.initialResponseHours}h, close ${p.closureTargetDays}d`
    );
  }

  // Prove the one the runtime depends on is actually resolvable, rather than
  // reporting success on an upsert whose row the spawn helper cannot find.
  const check = await prisma.capaSourceType.findUnique({
    where: { code: "POKA_YOKE_FAILURE" },
    include: { category: true },
  });
  if (!check?.isActive) {
    throw new Error(
      "POKA_YOKE_FAILURE is missing or inactive — a failed device check would " +
        "record the failure but raise no CAPA."
    );
  }
  console.log(
    `\n✅  Verified: POKA_YOKE_FAILURE → ${check.category.name} ` +
      `(CAPA prefix "${check.category.prefix}")`
  );
}

main()
  .catch((e) => {
    console.error("\n❌  CAPA source seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
