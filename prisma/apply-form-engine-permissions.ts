// Targeted, idempotent grant of the FORMS.* permissions.
//
// Written as a surgical upsert (NOT seed-rbac.ts, which is destructive) so it is
// safe against prod: it touches only the five FORMS permission rows and the role
// grants listed below. No other role or permission is read or written.
//   npx tsx prisma/apply-form-engine-permissions.ts
//
// WHY THESE CODES ARE THE *BASELINE*, NOT THE WHOLE STORY
// Every FormDefinition names its own `permissionPrefix`, and the engine checks
// '<prefix>.READ' / '.CREATE' / '.UPDATE' / '.PUBLISH' / '.DELETE'. FORMS.* is
// simply the default prefix — the codes a form gets when nobody configured
// anything else, and the codes the shared attachment router uses for a form
// record's evidence. A module shipped on the engine (Sustainability,
// Business Excellence) will carry its OWN prefix and its own grant script, so
// its approvers are not implicitly everyone who can build a form.
//
// Who gets what, and why:
//
//   FORMS.READ    — wide. A form record is an operational record; the people
//                   who work in a plant need to read their own registers.
//   FORMS.CREATE  — wide at the frontline. The whole point of the engine is
//                   that a supervisor can file a Kaizen or a suggestion; a
//                   register only frontline managers can write to is a register
//                   nobody uses.
//   FORMS.UPDATE  — same set as CREATE. Note the engine only permits editing a
//                   DRAFT — an approved record is immutable regardless of this
//                   grant, so UPDATE is not a route to rewriting filed data.
//   FORMS.PUBLISH — narrow, and deliberately NOT the same set as CREATE.
//                   Publishing a definition decides what every future record on
//                   that form means and which workflow approves it. It is a
//                   configuration act, not a data-entry one. This is the code
//                   the no-code Builder (Part B) will gate on.
//   FORMS.DELETE  — narrow. Soft-delete only (the ORM guard blocks a hard
//                   delete outright), but a deleted record still holds its
//                   reference number, so removing one leaves a visible gap in
//                   a register a regulator may read.
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
    code: "FORMS.READ",
    action: "READ",
    description: "View form definitions and the records filed against them",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "CRO", scope: "ALL_PLANTS" },
      { roleCode: "INTERNAL_AUDIT_LEAD", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "WORKER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "FORMS.CREATE",
    action: "CREATE",
    description: "File a new record against a published form",
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
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "WORKER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "FORMS.UPDATE",
    action: "UPDATE",
    description:
      "Edit a draft record and submit it. The engine refuses edits to an approved or closed record regardless of this grant.",
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
      { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
      { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "WORKER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "FORMS.PUBLISH",
    action: "APPROVE",
    description:
      "Author and publish form definitions — decides what every future record on that form means and which workflow approves it. The permission the no-code Builder gates on.",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
    ],
  },
  {
    code: "FORMS.DELETE",
    action: "DELETE",
    description:
      "Soft-delete a form record. The record keeps its reference number, so this leaves a visible gap in the register.",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
    ],
  },
];

async function main() {
  console.log("Applying FORMS permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: "FORMS",
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
    where: { permission: { module: "FORMS" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  FORMS permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }

  // PTW shipped once with nobody holding EXECUTE and no permit could close.
  // The equivalent hole here is nobody holding PUBLISH: not one form could ever
  // go live, and the whole engine would sit inert behind a green tick.
  if (!(byPerm.get("FORMS.PUBLISH") ?? []).length) {
    throw new Error(
      "No role holds FORMS.PUBLISH in this tenant — no form definition could ever be " +
        "published, so no record could be filed. Check the role codes above exist."
    );
  }
  if (!(byPerm.get("FORMS.CREATE") ?? []).length) {
    throw new Error(
      "No role holds FORMS.CREATE in this tenant — forms could be published but never filled in."
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
