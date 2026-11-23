// Targeted, idempotent grant of the CSM.* permissions (Contractor Safety Management).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the four CSM permission rows and the role
// grants below.
//   npx tsx prisma/apply-csm-permissions.ts     (or: npm run db:apply-csm-permissions)
//
//   CSM.READ      the CSM hub, contractor register and Contractor 360, applications,
//                 work orders, evaluations, sanctions. Plant-scoped for plant roles.
//   CSM.MANAGE    register contractors, enter / review prequalification (HSE review,
//                 score overrides, recommendation), issue contractor links, upload
//                 documents, raise and activate work orders, run plant mobilisation
//                 (roster, induction, gate clearance), request a sanction.
//                 Questionnaire template admin additionally needs ALL_PLANTS scope.
//   CSM.EVALUATE  create and submit performance evaluations (engineer-in-charge,
//                 department heads, HSE).
//   CSM.APPROVE   the governance decisions: prequalification approval, evaluation
//                 sign-off, suspend / blacklist / reinstate approval. Plant head at
//                 own plant, corporate HSE everywhere. The API also refuses an
//                 approver who recommended / requested / evaluated the same record.
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
    code: "CSM.READ",
    action: "READ",
    description: "View contractor safety management: contractors, prequalification, work orders, evaluations, sanctions",
    grants: [
      ...ALL([...CORPORATE, "CRO", "INTERNAL_AUDIT_LEAD", "COMPLIANCE_OFFICER", "EXECUTIVE_VIEWER", "PROCUREMENT_HEAD"]),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "MAINTENANCE_HEAD",
              "DEPARTMENT_HEAD", "SUPERVISOR", "HR_HEAD", "CONTRACTOR_COORDINATOR"]),
    ],
  },
  {
    code: "CSM.MANAGE",
    action: "UPDATE",
    description: "Register contractors, review prequalification, manage contractor documents, work orders, plant mobilisation; request sanctions",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER", "SAFETY_OFFICER", "CONTRACTOR_COORDINATOR"]),
    ],
  },
  {
    code: "CSM.EVALUATE",
    action: "CREATE",
    description: "Create and submit contractor performance evaluations",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "SAFETY_OFFICER", "CONTRACTOR_COORDINATOR", "MAINTENANCE_HEAD",
              "DEPARTMENT_HEAD"]),
    ],
  },
  {
    code: "CSM.APPROVE",
    action: "APPROVE",
    description: "Approve contractor prequalification, sign off evaluations, approve suspension / blacklisting / reinstatement",
    grants: [...ALL(["SYSTEM_ADMIN", "ADMIN", "CORPORATE_HSE"]), ...OWN(["PLANT_HEAD", "FACTORY_MANAGER"])],
  },
];

async function main() {
  console.log("Applying CSM permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "CSM", action: p.action, description: p.description },
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
    where: { permission: { module: "CSM" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(`${h.role.code}${h.scope === "ALL_PLANTS" ? "*" : ""}`);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  CSM permissions in place (* = all plants):");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // A workflow nobody can approve only fills up. Fail loudly.
  if (!(byPerm.get("CSM.APPROVE") ?? []).length) {
    throw new Error("No role holds CSM.APPROVE in this tenant: no prequalification could ever be approved.");
  }
  // Template admin needs CSM.MANAGE at ALL_PLANTS.
  if (!(byPerm.get("CSM.MANAGE") ?? []).some((r) => r.endsWith("*"))) {
    console.warn("  ⚠ No role holds CSM.MANAGE at all plants: nobody can edit questionnaire templates.");
  }
}

main()
  .catch((e) => {
    console.error("❌  CSM permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
