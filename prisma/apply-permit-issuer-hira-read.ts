// Targeted, idempotent grant of HIRA.READ to PERMIT_ISSUER.
//
// Why: the permit detail screen and the FLRA screen both render a
// "HIRA — relevant entries" panel, served by
//   GET /api/hira/integrations/for-ptw
//   GET /api/hira/integrations/for-flra
// Both are gated on HIRA.READ. PERMIT_ISSUER was never granted it, so the
// panel rendered a bare "HTTP 403" for the one role that most needs to see
// which assessed hazards drive the permit's risk level before issuing it.
// WORKER, SUPERVISOR, SAFETY_OFFICER and CONTRACTOR_COORDINATOR all had it;
// the Issuer did not. The role even held AGENT.HIRA_INVOKE already — it could
// invoke the HIRA agent but not read the register that agent reasons over.
//
// Read-only, own-plant. It grants no ability to create, edit or approve a HIRA.
//
// Written as a surgical upsert rather than a re-run of seed-rbac.ts, which is
// destructive — matches the "never re-run the destructive seed" rule.
//   npx tsx prisma/apply-permit-issuer-hira-read.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLE_CODE = "PERMIT_ISSUER";
const PERMISSION_CODE = "HIRA.READ";
const SCOPE = "OWN_PLANT";

async function main() {
  const role = await prisma.role.findUnique({ where: { code: ROLE_CODE } });
  if (!role) {
    throw new Error(`Role ${ROLE_CODE} not found — nothing applied.`);
  }

  // The permission already exists (a dozen roles hold it); look it up rather
  // than upserting, so a typo can never mint a second, orphaned permission row.
  const perm = await prisma.permission.findUnique({ where: { code: PERMISSION_CODE } });
  if (!perm) {
    throw new Error(
      `Permission ${PERMISSION_CODE} not found. Expected it to exist already — ` +
        `investigate before creating it, the module seed may not have run.`
    );
  }

  const before = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    create: { roleId: role.id, permissionId: perm.id, scope: SCOPE },
    update: { scope: SCOPE }
  });

  console.log(
    before
      ? `= ${ROLE_CODE} already had ${PERMISSION_CODE} (scope ${before.scope} -> ${SCOPE})`
      : `✓ granted ${ROLE_CODE} -> ${PERMISSION_CODE} (${SCOPE})`
  );

  // Prove it landed by re-reading, rather than trusting the write.
  const after = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }
  });
  if (!after) throw new Error("Grant did not persist — investigate.");
  console.log(`✓ verified: ${ROLE_CODE} holds ${PERMISSION_CODE} at scope ${after.scope}`);
  console.log("\nNote: permissions are cached per user — affected users must re-login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
