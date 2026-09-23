// Grant the <MODULE>.APPROVE permissions the workflow engine demands for the
// six Business Excellence modules.
//
//   npx tsx prisma/apply-be-workflow-approve-permissions.ts
//   (or: npm run db:apply-be-wf-approve)
//
// WHY THIS EXISTS
// services/workflow_engine.py::_assert_can_act builds the permission code from
// the TASK'S MODULE, not from the register's own prefix:
//
//     perm_code = f"{task.module}.{perm_action}"      # e.g. "BE_KAIZEN.APPROVE"
//     if perm_code not in rows: raise WorkflowError(...)
//
// So a BE_KAIZEN task needs BE_KAIZEN.APPROVE — which is a DIFFERENT code from
// KAIZEN.APPROVE, the one apply-be-permissions.ts grants and the one the
// register's own transition endpoints check.
//
// Neither BE phase created these. The consequence, found by seeding a realistic
// dataset and trying to drive it: **every BE record submitted since Phase 1 went
// live on 2026-08-20 has been stuck at its first workflow step**, because nobody
// on the system could approve the task. The register looked fine — the record
// showed SUBMITTED, the task appeared in the right inbox — and the approve
// button returned "Missing permission 'BE_KAIZEN.APPROVE'".
//
// This is the same shape as the PTW.EXECUTE grant that went missing and left
// 336 permits uncloseable.
//
// ⚠ HIRA_REVIEW and HIRA_STUDY have the identical hole. They are NOT touched
// here — different module, different owner, and silently granting permissions
// across a module boundary is how an RBAC model stops meaning anything. Raised
// separately.
//
// WHO GETS THEM
// Exactly the roles that appear as `approverRole` on the seeded workflow
// definitions, plus the corporate tier that administers every module. This is
// deliberately NOT "everyone who holds KAIZEN.APPROVE": the workflow permission
// is a second gate on top of task assignment, and widening it past the people
// the chains actually route to would make it decorative.
//
// Idempotent upsert. Touches only these six permission rows and their grants.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const CORPORATE: Grant[] = [
  { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
  { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
];

// Every role named as an approver on a BE workflow definition.
const APPROVERS: Grant[] = [
  { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
  { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
  { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
  { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
  { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
  { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
];

const MODULES = [
  { code: "BE_KAIZEN", label: "Kaizen" },
  { code: "BE_SUGGESTION", label: "Suggestion Scheme" },
  { code: "BE_OPL", label: "One Point Lesson" },
  { code: "BE_POKA_YOKE", label: "Poka Yoke" },
  { code: "BE_QCC", label: "Quality Circle project" },
  { code: "BE_SIP", label: "Structured Improvement Project" },
];

async function main() {
  console.log("Granting the workflow-engine APPROVE permissions for Business Excellence…\n");
  const missingRoles = new Set<string>();
  const grants = [...CORPORATE, ...APPROVERS];

  for (const m of MODULES) {
    const code = `${m.code}.APPROVE`;
    const perm = await prisma.permission.upsert({
      where: { code },
      create: {
        code,
        module: m.code,
        action: "APPROVE",
        description: `Act on a ${m.label} workflow task (approve / reject) from the inbox`,
      },
      update: { module: m.code, action: "APPROVE" },
    });

    const seen = new Set<string>();
    let n = 0;
    for (const g of grants) {
      if (seen.has(g.roleCode)) continue;
      seen.add(g.roleCode);
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
      n += 1;
    }
    console.log(`  ✓ ${code.padEnd(24)} → ${n} roles`);
  }

  if (missingRoles.size) {
    console.log(`\n  – roles absent in this tenant, skipped: ${[...missingRoles].sort().join(", ")}`);
  }

  // Prove it: every role named as an approver on a live BE definition must now
  // actually hold the code its tasks will demand. A definition that routes to a
  // role which cannot act is a chain that stalls forever.
  console.log("\nVerifying every BE workflow definition can actually be approved…");
  const defs = await prisma.workflowDefinition.findMany({
    where: { module: { in: MODULES.map((m) => m.code) }, isActive: true },
    include: { steps: true },
  });
  const broken: string[] = [];
  for (const d of defs) {
    for (const step of d.steps) {
      if (!step.approverRole) continue;
      const holds = await prisma.rolePermission.findFirst({
        where: {
          role: { code: step.approverRole },
          permission: { code: `${d.module}.APPROVE` },
        },
      });
      const tag = `${d.module}/${step.name} → ${step.approverRole}`;
      if (holds) {
        console.log(`  ✓ ${tag}`);
      } else {
        console.log(`  ✗ ${tag} — cannot act on its own task`);
        broken.push(tag);
      }
    }
  }
  if (broken.length) {
    throw new Error(
      `These workflow steps route to a role that cannot approve them:\n  - ${broken.join("\n  - ")}`
    );
  }

  console.log(`\n✅  ${MODULES.length} workflow APPROVE permissions granted and verified.`);
}

main()
  .catch((e) => {
    console.error("\n❌  Grant failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
