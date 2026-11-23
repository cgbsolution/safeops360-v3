// Targeted, idempotent grant of the KB.* permissions (Knowledge Bank).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the three KB permission rows and their
// role grants.
//   npx tsx prisma/apply-knowledge-bank-permissions.ts     (or: npm run db:apply-knowledge-bank-permissions)
//
//   KB.READ     EVERY role in the Role table, ALL_PLANTS. The client asked for
//               the bank to be "read accessible to everyone inside company", so
//               the list of roles is read from the database, not hard-coded: a
//               role added later gets it on the next run of this script. Read
//               is company-wide; a document's plant says where it applies, not
//               who may read it.
//   KB.MANAGE   create documents, upload versions, edit metadata, submit for
//               review, mark reviewed, make obsolete, see acknowledgement
//               reports. Corporate HSE / admins at ALL_PLANTS (only they can
//               manage company-wide documents); plant HSE at OWN_PLANT.
//   KB.APPROVE  publish a version under review or send it back. Narrower:
//               publishing makes a document the controlled copy for everyone.
//
// Roles missing from a tenant are skipped and reported, never created.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const ALL = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "ALL_PLANTS" }));
const OWN = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "OWN_PLANT" }));

const CORPORATE = ["SYSTEM_ADMIN", "ADMIN", "CORPORATE_HSE", "HSE_MANAGER"];

const MANAGED: { code: string; action: string; description: string; grants: Grant[] }[] = [
  {
    code: "KB.MANAGE",
    action: "MANAGE",
    description: "Knowledge bank: create documents, upload versions, edit, submit for review, mark reviewed, make obsolete, view acknowledgement reports",
    grants: [
      ...ALL(CORPORATE),
      ...OWN(["PLANT_HSE_HEAD", "SAFETY_OFFICER", "FACTORY_MANAGER", "ENVIRONMENT_MANAGER", "COMPLIANCE_OFFICER"]),
    ],
  },
  {
    code: "KB.APPROVE",
    action: "APPROVE",
    description: "Knowledge bank: publish a document version under review, or send it back",
    grants: [...ALL(CORPORATE), ...OWN(["PLANT_HEAD", "PLANT_HSE_HEAD", "FACTORY_MANAGER"])],
  },
];

async function main() {
  console.log("Applying Knowledge Bank permissions…\n");

  // KB.READ: every role that exists, at ALL_PLANTS.
  const read = await prisma.permission.upsert({
    where: { code: "KB.READ" },
    create: { code: "KB.READ", module: "KB", action: "READ", description: "Read the knowledge bank: every published standard, SOP, checklist and policy, company-wide" },
    update: { description: "Read the knowledge bank: every published standard, SOP, checklist and policy, company-wide" },
  });
  const roles = await prisma.role.findMany({ select: { id: true, code: true } });
  for (const role of roles) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: read.id } },
      create: { roleId: role.id, permissionId: read.id, scope: "ALL_PLANTS" },
      update: { scope: "ALL_PLANTS" },
    });
  }
  console.log(`  ✓ KB.READ → ${roles.length}/${roles.length} roles (every role in the Role table, ALL_PLANTS)`);

  const missingRoles = new Set<string>();
  for (const p of MANAGED) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "KB", action: p.action, description: p.description },
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
    where: { permission: { module: "KB" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(`${h.role.code}(${h.scope})`);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  Knowledge Bank permissions in place:");
  for (const [code, list] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${code === "KB.READ" ? `${list.length} roles` : list.sort().join(", ")}`);
  }

  // Verify the "everyone can read" promise and that someone can run the bank.
  const readHolders = (byPerm.get("KB.READ") ?? []).length;
  if (readHolders < roles.length) {
    throw new Error(`KB.READ is held by ${readHolders} of ${roles.length} roles; everyone in the company must be able to read.`);
  }
  const allPlantsManagers = holders.filter((h) => h.permission.code === "KB.MANAGE" && h.scope === "ALL_PLANTS").length;
  if (!allPlantsManagers) {
    throw new Error("No role holds KB.MANAGE at ALL_PLANTS: nobody could create or maintain a company-wide document.");
  }
  if (!(byPerm.get("KB.APPROVE") ?? []).length) {
    throw new Error("No role holds KB.APPROVE in this tenant: no document could ever be published.");
  }
}

main()
  .catch((e) => {
    console.error("❌  Knowledge Bank permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
