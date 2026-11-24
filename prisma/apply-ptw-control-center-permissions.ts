// Targeted, idempotent grant of the PTW Control Center permissions.
//
// Surgical upsert (NOT seed-rbac.ts, which is destructive): touches only the
// five permission rows below and their role grants. Safe against prod.
//   npx tsx prisma/apply-ptw-control-center-permissions.ts
//
//   PTW_IMPAIRMENT.READ     wide — everyone who can read permits must be able
//                           to see what safety systems are out of service.
//   PTW_IMPAIRMENT.CREATE   raise / restore / cancel an impairment. Fire &
//                           safety, maintenance and the issuers who find one.
//   PTW_IMPAIRMENT.APPROVE  approve an impairment, extend its restore time, and
//                           give the Fire Officer co-sign control on a permit.
//                           Narrow: the backend also refuses self-approval.
//   PTW_ZONE.MANAGE         edit zone guidance (besides the area owner), zone
//                           polygons, the plant layout, run the engine / brief.
//   PTW_KIOSK.MANAGE        issue and revoke wall-display tokens.
//
// Roles that do not exist in this tenant are skipped and reported, never created.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };
const ADMINS: Grant[] = [
  { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
  { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
];

const PERMISSIONS: { code: string; module: string; action: string; description: string; grants: Grant[] }[] = [
  {
    code: "PTW_IMPAIRMENT.READ", module: "PTW", action: "READ",
    description: "View safety-system impairments and their effect on permits",
    grants: [
      ...ADMINS,
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "PERMIT_ISSUER", scope: "OWN_PLANT" },
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACILITIES_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "WORKER", scope: "OWN_PLANT" },
      { roleCode: "CONTRACTOR_WORKMAN", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "PTW_IMPAIRMENT.CREATE", module: "PTW", action: "CREATE",
    description: "Raise, restore or cancel a safety-system impairment",
    grants: [
      ...ADMINS,
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACILITIES_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "PERMIT_ISSUER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "PTW_IMPAIRMENT.APPROVE", module: "PTW", action: "APPROVE",
    description: "Approve an impairment, extend its restore time, and co-sign permits as Fire Officer",
    grants: [
      ...ADMINS,
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "PTW_ZONE.MANAGE", module: "PTW", action: "MANAGE",
    description: "Edit zone guidance, zone polygons and the plant layout for the PTW Control Center",
    grants: [...ADMINS, { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" }, { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" }],
  },
  {
    code: "PTW_KIOSK.MANAGE", module: "PTW", action: "MANAGE",
    description: "Issue and revoke read-only wall-display (kiosk) tokens for the PTW Control Center",
    grants: [...ADMINS, { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" }],
  },
];

async function main() {
  console.log("Applying PTW Control Center permissions…\n");
  const missing = new Set<string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: p.module, action: p.action, description: p.description },
      update: { description: p.description },
    });
    let granted = 0;
    for (const g of p.grants) {
      const role = await prisma.role.findUnique({ where: { code: g.roleCode } });
      if (!role) {
        missing.add(g.roleCode);
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
  if (missing.size) console.log(`\n  – roles not present, skipped: ${[...missing].sort().join(", ")}`);
  const approvers = await prisma.rolePermission.count({ where: { permission: { code: "PTW_IMPAIRMENT.APPROVE" } } });
  if (!approvers) {
    throw new Error("No role holds PTW_IMPAIRMENT.APPROVE — impairments could be raised but never approved.");
  }
  console.log("\n✅ PTW Control Center permissions in place.");
}

main()
  .catch((e) => {
    console.error("❌ Permission apply failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
