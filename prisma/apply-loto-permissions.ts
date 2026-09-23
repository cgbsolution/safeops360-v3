// Targeted, idempotent grant of the LOTO.* permissions.
//
// Written as a surgical upsert (NOT seed-rbac.ts, which is destructive) so it is
// safe against prod: it touches only the seven LOTO permission rows and the role
// grants listed below. No other role or permission is read or written.
//   npx tsx prisma/apply-loto-permissions.ts
//
// Who gets what, and why:
//
//   LOTO.READ      — wide. A procedure is a safety artefact; anyone who might
//                    stand at the equipment needs to be able to read it. The
//                    QR field view is unauthenticated anyway (spec §2.3), so
//                    withholding READ from an operator buys nothing and only
//                    stops them finding the procedure from the desk.
//   LOTO.CREATE    — Safety / Engineering / Maintenance. Authoring an isolation
//                    sequence is an engineering act.
//   LOTO.UPDATE    — same set. Note this covers MATERIAL edits, which withdraw
//                    the live approval and force re-publication.
//   LOTO.APPROVE   — narrow, and deliberately a DIFFERENT set from UPDATE at the
//                    plant tier: publishing is what asserts the isolation
//                    sequence is correct and complete. MAINTENANCE_HEAD can
//                    author but not publish; HSE/Plant Head sign it off. This
//                    mirrors the HIRA approve/update split rather than inventing
//                    a new pattern.
//   LOTO.EXECUTE   — who may start a lockout, confirm their own lock, complete a
//                    verification step, and close. Wide at the frontline: this
//                    is the permission a fitter needs at 6 a.m. PTW's own
//                    EXECUTE grant went missing once and no permit could close —
//                    the same failure here would strand equipment locked out, so
//                    the frontline roles are granted explicitly.
//   LOTO.REVIEW    — completes a scheduled evaluation cycle (OSHA annual).
//                    Same tier as APPROVE: a review that concludes "pass" is an
//                    assertion the procedure is still correct.
//   LOTO.DELETE    — soft-delete a procedure. Governance act, narrow.
//
// Roles that do not exist in a given tenant are skipped and reported, never
// created — role taxonomy stays owned by seed-rbac.ts.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const PERMISSIONS: {
  code: string;
  action: string;
  description: string;
  grants: Grant[];
}[] = [
  {
    code: "LOTO.READ",
    action: "READ",
    description:
      "View LOTO procedures, their versions, and lockout execution records",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "CRO", scope: "ALL_PLANTS" },
      { roleCode: "INTERNAL_AUDIT_LEAD", scope: "ALL_PLANTS" },
      { roleCode: "CAMS_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "PERMIT_ISSUER", scope: "OWN_PLANT" },
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "WORKER", scope: "OWN_PLANT" },
      { roleCode: "CONTRACTOR_WORKMAN", scope: "OWN_PLANT" },
      { roleCode: "CONTRACTOR_COORDINATOR", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.CREATE",
    action: "CREATE",
    description: "Author a new LOTO procedure in draft",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.UPDATE",
    action: "UPDATE",
    description:
      "Edit a LOTO procedure — including material edits to isolation points, hardware and verification steps, which create a new version and withdraw the live approval",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.APPROVE",
    action: "APPROVE",
    description:
      "Publish a LOTO procedure — makes a version the one the field sees via QR. Also required to re-publish after a material edit.",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      // Deliberately excludes MAINTENANCE_HEAD / DEPARTMENT_HEAD — they author.
      // A publish step the author can perform alone is not an approval step.
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.EXECUTE",
    action: "EXECUTE",
    description:
      "Start a lockout, confirm your own lock application and removal, complete verification steps, and close an execution",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "PERMIT_ISSUER", scope: "OWN_PLANT" },
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      // The frontline. A lockout that only managers can confirm is a lockout
      // nobody confirms at 6 a.m.
      { roleCode: "WORKER", scope: "OWN_PLANT" },
      { roleCode: "CONTRACTOR_WORKMAN", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.REVIEW",
    action: "REVIEW",
    description:
      "Complete a scheduled LOTO procedure evaluation (OSHA 1910.147 periodic inspection)",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "LOTO.DELETE",
    action: "DELETE",
    description: "Soft-delete (withdraw) a LOTO procedure",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
    ],
  },
];

async function main() {
  console.log("Applying LOTO permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: "LOTO",
        action: p.action,
        description: p.description,
      },
      update: { description: p.description },
    });

    let granted = 0;
    for (const g of p.grants) {
      const role = await prisma.role.findUnique({ where: { code: g.roleCode } });
      if (!role) {
        missingRoles.add(g.roleCode);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id, scope: g.scope },
        update: { scope: g.scope },
      });
      granted += 1;
    }
    console.log(`  ✓ ${p.code} → ${granted}/${p.grants.length} roles`);
  }

  if (missingRoles.size) {
    console.log(
      `\n  – roles not present in this tenant, skipped: ${[...missingRoles].sort().join(", ")}`
    );
  }

  const holders = await prisma.rolePermission.findMany({
    where: { permission: { module: "LOTO" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  LOTO permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }

  // The failure that took PTW down was nobody holding EXECUTE — a permit could
  // be raised and never closed. Same shape of hole here would leave equipment
  // locked out with no way to remove locks, so fail loudly rather than print a
  // green tick over an unusable module.
  if (!(byPerm.get("LOTO.EXECUTE") ?? []).length) {
    throw new Error(
      "No role holds LOTO.EXECUTE in this tenant — no lockout could be started or closed. " +
        "Check that the role codes above exist before using the module."
    );
  }
}

main()
  .catch((e) => {
    console.error("❌  Permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
