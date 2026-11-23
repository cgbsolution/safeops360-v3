// Targeted, idempotent grant of the INTEGRATION.* permissions (external-system
// connectors: JSL SAS portal and any later ones).
//
// Surgical upsert in the apply-ims-permissions.ts pattern (NOT seed-rbac.ts,
// which is destructive). Touches only the two INTEGRATION permission rows and
// the role grants below.
//   npx tsx prisma/apply-integrations-permissions.ts   (or: npm run db:apply-integrations-permissions)
//
//   INTEGRATION.READ    see endpoint configuration and the sync log (payloads
//                       contain observation data). Admins only.
//   INTEGRATION.MANAGE  create / edit endpoints and field mappings, test the
//                       connection, push, sync now, retry failed rows. Admins
//                       only: an endpoint decides what plant data leaves the
//                       platform and where it goes.
//
// Neither is plant-scoped: an endpoint is deployment-wide configuration.
//
// NOT granted here: the inbound service account. Observations received from an
// external system are created under the endpoint's service user, which needs
// OBSERVATION.CREATE at the receiving plant through its ordinary role.
//
// Roles missing from a tenant are skipped and reported, never created.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

const ALL = (codes: string[]): Grant[] => codes.map((roleCode) => ({ roleCode, scope: "ALL_PLANTS" }));

const ADMINS = ["SYSTEM_ADMIN", "ADMIN"];

const PERMISSIONS: { code: string; action: string; description: string; grants: Grant[] }[] = [
  {
    code: "INTEGRATION.READ",
    action: "READ",
    description: "View external-system integration endpoints (JSL SAS) and the sync log, including payloads",
    grants: ALL(ADMINS),
  },
  {
    code: "INTEGRATION.MANAGE",
    action: "MANAGE",
    description: "Configure integration endpoints and field mappings, test connections, push, sync and retry",
    grants: ALL(ADMINS),
  },
];

async function main() {
  console.log("Applying INTEGRATION permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, module: "INTEGRATION", action: p.action, description: p.description },
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
    where: { permission: { module: "INTEGRATION" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  INTEGRATION permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }
  // An integration nobody can configure is dead configuration. Fail loudly.
  if (!(byPerm.get("INTEGRATION.MANAGE") ?? []).length) {
    throw new Error("No role holds INTEGRATION.MANAGE in this tenant: nobody could configure the JSL SAS connector.");
  }
}

main()
  .catch((e) => {
    console.error("❌  INTEGRATION permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
