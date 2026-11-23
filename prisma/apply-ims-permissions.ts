// Targeted, idempotent grant of the IMS.* permissions (IMS / MIS registers + dashboard).
//
// Surgical upsert in the apply-loto-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the four IMS permission rows and the role
// grants below.
//   npx tsx prisma/apply-ims-permissions.ts     (or: npm run db:apply-ims-permissions)
//
//   IMS.READ    wide. The MIS dashboard is a management view; the registers are
//               plant records every line manager is expected to look at.
//   IMS.CREATE  record a toolbox talk, issue a show-cause notice, schedule a
//               meeting, add a MOM action point. Supervisors deliver TBTs, so
//               they need CREATE. Issuing a notice from the UI is limited to the
//               safety and line-management tier below. The API does not check
//               CREATE per record type.
//   IMS.UPDATE  record a notice reply, mark a meeting held, edit minutes, move
//               anyone's action point. (An owner can always move their own.)
//   IMS.CLOSE   close a show-cause notice with a decision; publish minutes.
//               Narrow: a disciplinary decision is a governance act.
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
    code: "IMS.READ",
    action: "READ",
    description: "View the IMS/MIS dashboard, toolbox talks, show cause notices, safety meetings and the MOM tracker",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER"]),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD",
              "DEPARTMENT_HEAD", "SUPERVISOR", "HR_HEAD", "CONTRACTOR_COORDINATOR", "ENVIRONMENT_MANAGER"]),
    ],
  },
  {
    code: "IMS.CREATE",
    action: "CREATE",
    description: "Record a toolbox talk, issue a show cause notice, schedule a safety meeting, add a MOM action point",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD",
              "DEPARTMENT_HEAD", "SUPERVISOR", "CONTRACTOR_COORDINATOR"]),
    ],
  },
  {
    code: "IMS.UPDATE",
    action: "UPDATE",
    description: "Record a show cause reply, mark a meeting held, edit minutes, update any MOM action point",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "DEPARTMENT_HEAD"]),
    ],
  },
  {
    code: "IMS.CLOSE",
    action: "CLOSE",
    description: "Close a show cause notice with a decision; publish meeting minutes",
    grants: [...ALL(CORPORATE), ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER"])],
  },
];

async function main() {
  console.log("Applying IMS permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "IMS", action: p.action, description: p.description },
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
    where: { permission: { module: "IMS" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  IMS permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // A register nobody can close is a register that only grows. Fail loudly.
  if (!(byPerm.get("IMS.CLOSE") ?? []).length) {
    throw new Error("No role holds IMS.CLOSE in this tenant: no notice could be closed and no minutes published.");
  }
}

main()
  .catch((e) => {
    console.error("❌  IMS permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
