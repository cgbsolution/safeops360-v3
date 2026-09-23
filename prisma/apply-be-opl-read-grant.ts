// Give OPL.READ to every role, so nobody can be handed a reading obligation
// they are locked out of.
//
//   npx tsx prisma/apply-be-opl-read-grant.ts   (or: npm run db:apply-be-opl-read)
//
// THE BUG
// services/business_excellence.resolve_opl_audience() expands an OPL's audience
// spec BY ROLE and writes a BeOplAcknowledgement row per person. The permission
// grant in apply-be-permissions.ts, meanwhile, enumerated a fixed set of tiers
// (corporate / plant leadership / frontline supervision / frontline). Any role
// outside those tiers can therefore be ASSIGNED a lesson and then refused when
// it tries to open or acknowledge it.
//
// Found by seeding a realistic OPL and having its audience try to discharge the
// obligation: FIELD_TECHNICIAN got 7 assignments and a 403.
//
// The failure is quiet and it corrupts the one number the module exists to
// report. "62% acknowledged" would sit there forever, and the missing 38% would
// be people who never had a way to comply. Phase 1's own comment on this
// permission reads "everyone, including contractors — a lesson nobody can open
// teaches nobody anything"; the intent was always universal and only the
// enumeration was wrong.
//
// WHY UNIVERSAL RATHER THAN "ADD FIELD_TECHNICIAN"
// Adding the one role that happens to exist in this tenant would leave the same
// trap for the next role somebody creates. An OPL audience can name ANY role, so
// the read grant has to cover any role. This is the one BE permission where
// universal is the correct scope rather than a shortcut.
//
// Scope is OWN_PLANT for everyone except the corporate tier — reading a lesson
// is not a reason to see other plants' registers.
//
// ⚠ Deliberately NOT widened here: KAIZEN.READ, SUGGESTION.READ, QCC.READ and
// BENEFIT.READ have the same enumerated-tier shape. Those are cosmetic by
// comparison — a role that lacks them simply does not see a register, and no
// obligation is created that it cannot meet. They are worth a look, but
// widening five modules' RBAC as a side effect of an OPL fix is not the way.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CORPORATE_SCOPE = new Set([
  "SYSTEM_ADMIN",
  "ADMIN",
  "CORPORATE_HSE",
  "HSE_MANAGER",
]);

async function main() {
  console.log("Granting OPL.READ to every role…\n");

  const perm = await prisma.permission.findUnique({ where: { code: "OPL.READ" } });
  if (!perm) throw new Error("OPL.READ does not exist — run apply-be-permissions.ts first.");

  const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
  const before = await prisma.rolePermission.count({ where: { permissionId: perm.id } });

  let added = 0;
  for (const role of roles) {
    const existing = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    });
    if (existing) continue;
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: perm.id,
        scope: CORPORATE_SCOPE.has(role.code) ? "ALL_PLANTS" : "OWN_PLANT",
      },
    });
    console.log(`  + ${role.code}`);
    added += 1;
  }

  console.log(`\n  ${before} role(s) already held it, ${added} added, ${roles.length} total.`);

  // Prove the thing that was actually broken: nobody currently carrying an
  // acknowledgement obligation is locked out of discharging it.
  const stranded = await prisma.$queryRawUnsafe<{ role: string; n: bigint }[]>(
    `SELECT u.role, count(*)::bigint AS n
       FROM "BeOplAcknowledgement" a
       JOIN "User" u ON u.id = a."personUserId"
      WHERE NOT EXISTS (
            SELECT 1 FROM "UserRole" ur
              JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
              JOIN "Permission" p ON p.id = rp."permissionId"
             WHERE ur."userId" = u.id AND p.code = 'OPL.READ')
      GROUP BY u.role`
  );
  if (stranded.length) {
    console.log("\n  ✗ still locked out of their own assignments:");
    for (const s of stranded) console.log(`      ${s.role}: ${s.n}`);
    throw new Error("Some assignees still cannot read the lesson they were given.");
  }
  console.log("  ✓ every person holding an acknowledgement obligation can open the lesson");

  console.log("\n✅  OPL.READ is universal.");
  console.log("   ⚠ Restart uvicorn — permissions are cached in-process for 5 minutes.");
}

main()
  .catch((e) => {
    console.error("\n❌  Grant failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
