// Targeted, idempotent grant of the PHA.* permissions (HAZOP / What-If / HAZID studies,
// the process safety hub KPIs).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the four PHA permission rows and the role
// grants below.
//   npx tsx prisma/apply-pha-permissions.ts     (or: npm run db:apply-pha-permissions)
//
//   PHA.READ     wide. Study registers, worksheets and the recommendation
//                register are reference material for operations and maintenance.
//   PHA.CREATE   start a study. The safety and engineering tier that convenes PHAs.
//   PHA.UPDATE   edit a study under way: team, sessions, nodes, worksheet rows,
//                raise and move recommendations, submit for review. (A
//                recommendation's owner can always move their own.)
//   PHA.APPROVE  approve or return a study under review; close an approved study.
//                Narrow: approval accepts the residual risk on behalf of the plant.
//                The API also refuses approval by the study's own facilitator.
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
    code: "PHA.READ",
    action: "READ",
    description: "View PHA / HAZOP studies, worksheets, the recommendation register and the process safety hub",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER", "RISK_CHAMPION"]),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD",
              "DEPARTMENT_HEAD", "SUPERVISOR", "PERMIT_ISSUER", "ENVIRONMENT_MANAGER", "RISK_OWNER"]),
    ],
  },
  {
    code: "PHA.CREATE",
    action: "CREATE",
    description: "Start a PHA / HAZOP, What-If or HAZID study",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD"]),
    ],
  },
  {
    code: "PHA.UPDATE",
    action: "UPDATE",
    description: "Edit a study under way (team, sessions, nodes, worksheet), raise and move recommendations, submit for review",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD"]),
    ],
  },
  {
    code: "PHA.APPROVE",
    action: "APPROVE",
    description: "Approve or return a PHA study under review; close an approved study",
    grants: [...ALL(["SYSTEM_ADMIN", "ADMIN", "CORPORATE_HSE"]), ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER"])],
  },
];

async function main() {
  console.log("Applying PHA permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "PHA", action: p.action, description: p.description },
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
    where: { permission: { module: "PHA" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  PHA permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // A study nobody can approve never leaves review. Fail loudly.
  if (!(byPerm.get("PHA.APPROVE") ?? []).length) {
    throw new Error("No role holds PHA.APPROVE in this tenant: no PHA study could be approved or closed.");
  }
}

main()
  .catch((e) => {
    console.error("❌  PHA permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
