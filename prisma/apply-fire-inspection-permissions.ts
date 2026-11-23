// Targeted, idempotent grant of the FIRE.* permissions (QR-code fire equipment
// inspections, equipment register, checklist templates).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the three FIRE permission rows and the
// role grants below.
//   npx tsx prisma/apply-fire-inspection-permissions.ts   (or: npm run db:apply-fire-inspection-permissions)
//
//   FIRE.READ     wide. Equipment register, inspection register, due list,
//                 checklists, the Emergency Response page. The API also still
//                 accepts INCIDENT.READ for every fire read (the module's
//                 original gate), so nobody loses access; FIRE.READ exists so a
//                 field inspector can read the fire module without being
//                 given incident access.
//   FIRE.INSPECT  perform an inspection (scan the QR, answer the checklist,
//                 attach photos). Field technicians, supervisors, maintenance
//                 and the safety team. Narrower than INCIDENT.UPDATE on purpose.
//   FIRE.MANAGE   register / edit equipment, take an asset out of service and
//                 return it, edit the checklist templates. Fire officer tier.
//                 (Equipment endpoints also accept INCIDENT.UPDATE, as before;
//                 template edits need FIRE.MANAGE.) Holders can also inspect.
//
// Roles missing from a tenant are skipped and reported, never created.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const ALL = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "ALL_PLANTS" }));
const OWN = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "OWN_PLANT" }));

const CORPORATE = ["SYSTEM_ADMIN", "ADMIN", "CORPORATE_HSE", "HSE_MANAGER"];

const PERMISSIONS: { code: string; action: string; description: string; grants: Grant[] }[] = [
  {
    code: "FIRE.READ",
    action: "READ",
    description: "View fire equipment, inspection records, the due list, checklists and the emergency response summary",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER"]),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD",
              "FACILITIES_MANAGER", "DEPARTMENT_HEAD", "SUPERVISOR", "FIELD_TECHNICIAN", "PERMIT_ISSUER",
              "AUDITOR", "CONTRACTOR_COORDINATOR"]),
    ],
  },
  {
    code: "FIRE.INSPECT",
    action: "INSPECT",
    description: "Perform a QR-code fire equipment inspection: answer the checklist, attach photos, record GPS",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HSE_HEAD", "SAFETY_OFFICER", "MAINTENANCE_HEAD", "FACILITIES_MANAGER", "SUPERVISOR",
              "FIELD_TECHNICIAN"]),
    ],
  },
  {
    code: "FIRE.MANAGE",
    action: "MANAGE",
    description: "Register and edit fire equipment, take it out of / return it to service, edit inspection checklists",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "FACILITIES_MANAGER"]),
    ],
  },
];

async function main() {
  console.log("Applying FIRE permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "FIRE", action: p.action, description: p.description },
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
    console.log(`\n  – roles not present in this tenant, skipped: ${[...missingRoles].sort().join(", ")}`);
  }

  const holders = await prisma.rolePermission.findMany({
    where: { permission: { module: "FIRE" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  FIRE permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // Nobody able to inspect means the QR stickers lead to a read-only page.
  for (const code of ["FIRE.INSPECT", "FIRE.MANAGE"]) {
    if (!(byPerm.get(code) ?? []).length) {
      throw new Error(`No role holds ${code} in this tenant.`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌  FIRE permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
