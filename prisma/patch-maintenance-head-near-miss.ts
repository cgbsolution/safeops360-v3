/**
 * Patch: give MAINTENANCE_HEAD the NEAR_MISS grants it was missing entirely.
 *
 * Bug NM-3 — a Maintenance Head assigned a Near Miss CAPA execution task had no
 * "Near Miss" entry in the left sidebar and could only reach the task through a
 * direct link. Root cause: the role carried OBSERVATION / PTW / INSPECTION
 * grants but not a single NEAR_MISS one, so the permission-filtered nav dropped
 * the module even though the workflow had legitimately assigned them work.
 *
 * The grants mirror the role's existing OBSERVATION shape exactly:
 *   CREATE           → ALL_PLANTS      (anyone may raise a near miss)
 *   READ, EXPORT     → OWN_DEPARTMENT  (puts the module back in navigation)
 *   UPDATE, EXECUTE  → OWN_RECORDS     (act on records they own — incl. the
 *                                       CAPA task, since `actionOwnerId` is an
 *                                       OWN_RECORDS owner field)
 *
 * Idempotent: skips grants that already exist, and never narrows a grant that
 * is already broader than the one requested.
 *
 *   npx tsx prisma/patch-maintenance-head-near-miss.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Scope = "ALL_PLANTS" | "OWN_PLANT" | "OWN_DEPARTMENT" | "OWN_RECORDS";

const GRANTS: { actions: string[]; scope: Scope }[] = [
  { actions: ["CREATE"], scope: "ALL_PLANTS" },
  { actions: ["READ", "EXPORT"], scope: "OWN_DEPARTMENT" },
  { actions: ["UPDATE", "EXECUTE"], scope: "OWN_RECORDS" },
];

// Broader wins — never downgrade a scope that is already wider.
const BREADTH: Record<string, number> = {
  OWN_RECORDS: 0,
  OWN_DEPARTMENT: 1,
  OWN_PLANT: 2,
  ALL_PLANTS: 3,
};

async function main() {
  const role = await prisma.role.findFirst({ where: { code: "MAINTENANCE_HEAD" } });
  if (!role) throw new Error("MAINTENANCE_HEAD role not found");

  const perms = await prisma.permission.findMany({
    where: { module: "NEAR_MISS" },
    select: { id: true, code: true, action: true },
  });
  const byAction = new Map(perms.map((p) => [p.action, p]));

  const existing = await prisma.rolePermission.findMany({
    where: { roleId: role.id, permission: { module: "NEAR_MISS" } },
    select: { id: true, scope: true, permission: { select: { action: true, code: true } } },
  });
  const existingByAction = new Map(existing.map((e) => [e.permission.action, e]));

  let added = 0;
  let widened = 0;
  const missing: string[] = [];

  for (const g of GRANTS) {
    for (const action of g.actions) {
      const perm = byAction.get(action);
      if (!perm) {
        missing.push(`NEAR_MISS.${action}`);
        continue;
      }
      const have = existingByAction.get(action);
      if (!have) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id, scope: g.scope as any },
        });
        console.log(`  + ${perm.code} @ ${g.scope}`);
        added++;
      } else if (BREADTH[have.scope] < BREADTH[g.scope]) {
        await prisma.rolePermission.update({
          where: { id: have.id },
          data: { scope: g.scope as any },
        });
        console.log(`  ~ ${perm.code} ${have.scope} → ${g.scope}`);
        widened++;
      }
    }
  }

  if (missing.length) {
    console.warn(`⚠  Permission rows not found (run seed-rbac first): ${missing.join(", ")}`);
  }
  console.log(
    added === 0 && widened === 0
      ? "✅  MAINTENANCE_HEAD already holds every NEAR_MISS grant — nothing to do."
      : `✅  MAINTENANCE_HEAD: ${added} grant(s) added, ${widened} widened.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
