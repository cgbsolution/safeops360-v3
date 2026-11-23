// Targeted, idempotent grant of the PSSR.* and PSI.* permissions (Pre-Startup
// Safety Review register; PSI library, chemical register and Chem advisor).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the five permission rows below and their
// role grants.
//   npx tsx prisma/apply-pssr-psi-permissions.ts     (or: npm run db:apply-pssr-psi-permissions)
//
//   PSSR.READ     wide: every line manager whose area starts up is expected to see it.
//   PSSR.MANAGE   create / edit reviews, answer checklist items, manage punch items,
//                 submit for sign-off, reopen, close; administer templates.
//                 (The leader and team named on a review can answer items and work
//                 punch items without it; a punch owner can close their own item.)
//   PSSR.SIGNOFF  record a discipline APPROVE / REJECT on the sign-off matrix.
//                 The API checks the permission, not the discipline: who signs for
//                 Electrical is the review leader's call, and the matrix records the name.
//   PSI.READ      wide: the chemical register, PSI documents and the Chem advisor
//                 are reference information for anyone who handles chemicals.
//   PSI.MANAGE    register PSI document revisions, upload files (incl. SDS),
//                 withdraw a revision registered in error.
//
// Roles missing from a tenant are skipped and reported, never created.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const ALL = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "ALL_PLANTS" }));
const OWN = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "OWN_PLANT" }));

const CORPORATE = ["SYSTEM_ADMIN", "ADMIN", "CORPORATE_HSE", "HSE_MANAGER"];
const PLANT_LEADS = ["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER"];

const PERMISSIONS: { code: string; module: string; action: string; description: string; grants: Grant[] }[] = [
  {
    code: "PSSR.READ",
    module: "PSSR",
    action: "READ",
    description: "View pre-startup safety reviews, their checklists, punch lists and sign-off matrix",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER"]),
      ...OWN([...PLANT_LEADS, "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD", "SUPERVISOR",
              "FACILITIES_MANAGER", "ENVIRONMENT_MANAGER", "PERMIT_ISSUER", "QUALITY_MANAGER"]),
    ],
  },
  {
    code: "PSSR.MANAGE",
    module: "PSSR",
    action: "MANAGE",
    description: "Create and run pre-startup safety reviews (checklist, punch items, submit, reopen, close) and administer PSSR templates",
    grants: [
      ...ALL(CORPORATE),
      ...OWN([...PLANT_LEADS, "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD", "FACILITIES_MANAGER"]),
    ],
  },
  {
    code: "PSSR.SIGNOFF",
    module: "PSSR",
    action: "SIGNOFF",
    description: "Record a discipline sign-off (approve / reject) on a pre-startup safety review",
    grants: [
      ...ALL(CORPORATE),
      ...OWN([...PLANT_LEADS, "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD", "FACILITIES_MANAGER",
              "ENVIRONMENT_MANAGER"]),
    ],
  },
  {
    code: "PSI.READ",
    module: "PSI",
    action: "READ",
    description: "View the chemical register, PSI documents and completeness, and use the Chem advisor",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER"]),
      ...OWN([...PLANT_LEADS, "SAFETY_OFFICER", "MAINTENANCE_HEAD", "DEPARTMENT_HEAD", "SUPERVISOR",
              "FACILITIES_MANAGER", "ENVIRONMENT_MANAGER", "PERMIT_ISSUER", "QUALITY_MANAGER", "FIELD_TECHNICIAN",
              "CONTRACTOR_COORDINATOR", "TRAINER"]),
    ],
  },
  {
    code: "PSI.MANAGE",
    module: "PSI",
    action: "MANAGE",
    description: "Register PSI document revisions and upload files (P&IDs, design basis, SDS, ...)",
    grants: [
      ...ALL(CORPORATE),
      ...OWN([...PLANT_LEADS, "SAFETY_OFFICER", "MAINTENANCE_HEAD", "FACILITIES_MANAGER", "ENVIRONMENT_MANAGER"]),
    ],
  },
];

async function main() {
  console.log("Applying PSSR + PSI permissions…\n");
  const missingRoles = new Set<string>();

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
    where: { permission: { module: { in: ["PSSR", "PSI"] } } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  PSSR + PSI permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // A review nobody can sign is a start-up nobody can authorise. Fail loudly.
  for (const must of ["PSSR.MANAGE", "PSSR.SIGNOFF", "PSI.MANAGE"]) {
    if (!(byPerm.get(must) ?? []).length) {
      throw new Error(`No role holds ${must} in this tenant.`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌  PSSR + PSI permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
