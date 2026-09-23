// Targeted, idempotent grant of the Business Excellence permissions.
//
// Written as a surgical upsert (NOT seed-rbac.ts, which is destructive) so it is
// safe against prod: it touches only the seventeen BE permission rows and the
// role grants listed below. No other role or permission is read or written.
//   npx tsx prisma/apply-be-permissions.ts   (or: npm run db:apply-be-permissions)
//
// THREE PREFIXES, NOT ONE
// KAIZEN.* / OPL.* / POKAYOKE.* rather than a single BE.*, because the three
// registers are genuinely governed by different people: a supervisor screens
// improvement ideas, a trainer approves a lesson, a quality engineer signs off a
// mistake-proofing device. One prefix would force all three onto whoever holds
// it. This matches how LOTO, PTW and HIRA each own their own codes.
//
// Who gets what, and why:
//
//   KAIZEN.READ    — everyone. A suggestion scheme whose ideas are invisible to
//                    the people who might copy them is a suggestion box.
//   KAIZEN.CREATE  — everyone down to WORKER and CONTRACTOR_WORKMAN. The person
//                    standing at the machine is the one who can see the waste;
//                    a Kaizen programme that only supervisors can file into is
//                    the single most common way these die.
//   KAIZEN.UPDATE  — the author's supervisory chain. Covers implementation
//                    progress, not screening.
//   KAIZEN.APPROVE — screening committee tier. Decides what gets funded.
//   KAIZEN.VERIFY  — narrow, and deliberately a DIFFERENT gate from APPROVE:
//                    confirming a saving actually landed is a finance-facing
//                    claim, and the API separately refuses to let the person who
//                    raised the idea verify their own savings.
//   OPL.READ       — everyone, including contractors. A lesson nobody can open
//                    teaches nobody anything.
//   OPL.CREATE     — trainers, engineers, supervisors: the people who witness
//                    the trouble case worth writing up.
//   OPL.APPROVE    — narrower. Approving a lesson asserts the content is
//                    correct, and PUBLISH is what puts an acknowledgement
//                    obligation onto other people's inboxes.
//   POKAYOKE.*     — engineering / quality / maintenance. VERIFY is granted
//                    WIDE at the frontline on purpose: the periodic check is
//                    done at the machine by whoever is on shift, and the whole
//                    register is worthless if only a manager can record one.
//                    PTW's own EXECUTE grant went missing once and no permit
//                    could close; the same hole here would leave every device
//                    permanently overdue.
//
// Roles that do not exist in a given tenant are skipped and reported, never
// created — role taxonomy stays owned by seed-rbac.ts.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

// Reused grant sets, so a role added to a tier lands on every permission in it
// rather than on whichever ones somebody remembered.
const CORPORATE: Grant[] = [
  { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "ADMIN", scope: "ALL_PLANTS" },
  { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
  { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
];

const PLANT_LEADERSHIP: Grant[] = [
  { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
  { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
  { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
  { roleCode: "DEPARTMENT_HEAD", scope: "OWN_PLANT" },
];

const FRONTLINE_SUPERVISION: Grant[] = [
  { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
  { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
  { roleCode: "SUPERVISOR", scope: "OWN_PLANT" },
];

const FRONTLINE: Grant[] = [
  { roleCode: "WORKER", scope: "OWN_PLANT" },
  { roleCode: "CONTRACTOR_WORKMAN", scope: "OWN_PLANT" },
  { roleCode: "CONTRACTOR_COORDINATOR", scope: "OWN_PLANT" },
];

const EVERYONE: Grant[] = [
  ...CORPORATE,
  ...PLANT_LEADERSHIP,
  ...FRONTLINE_SUPERVISION,
  ...FRONTLINE,
];

const PERMISSIONS: {
  code: string;
  module: string;
  action: string;
  description: string;
  grants: Grant[];
}[] = [
  // ── Kaizen ──
  {
    code: "KAIZEN.READ",
    module: "KAIZEN",
    action: "READ",
    description: "View shop-floor improvement ideas and their savings",
    grants: EVERYONE,
  },
  {
    code: "KAIZEN.CREATE",
    module: "KAIZEN",
    action: "CREATE",
    description: "Raise and submit a shop-floor improvement idea",
    grants: EVERYONE,
  },
  {
    code: "KAIZEN.UPDATE",
    module: "KAIZEN",
    action: "UPDATE",
    description: "Edit an improvement idea and record implementation progress",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION],
  },
  {
    code: "KAIZEN.APPROVE",
    module: "KAIZEN",
    action: "APPROVE",
    description: "Screen, approve, park or reject an improvement idea",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" }],
  },
  {
    code: "KAIZEN.VERIFY",
    module: "KAIZEN",
    action: "VERIFY",
    description: "Confirm the realised annual saving and close an improvement",
    grants: [...CORPORATE, { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" }, { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" }],
  },
  {
    code: "KAIZEN.DELETE",
    module: "KAIZEN",
    action: "DELETE",
    description: "Soft-delete an improvement idea",
    grants: [...CORPORATE],
  },

  // ── One Point Lesson ──
  {
    code: "OPL.READ",
    module: "OPL",
    action: "READ",
    description: "Open a One Point Lesson and acknowledge your own assignment",
    grants: EVERYONE,
  },
  {
    code: "OPL.CREATE",
    module: "OPL",
    action: "CREATE",
    description: "Author a One Point Lesson and submit it for review",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION],
  },
  {
    code: "OPL.UPDATE",
    module: "OPL",
    action: "UPDATE",
    description: "Edit a draft or in-review One Point Lesson",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION],
  },
  {
    code: "OPL.APPROVE",
    module: "OPL",
    action: "APPROVE",
    description: "Approve, publish to the floor, or retire a One Point Lesson",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP],
  },
  {
    code: "OPL.DELETE",
    module: "OPL",
    action: "DELETE",
    description: "Soft-delete an unpublished One Point Lesson",
    grants: [...CORPORATE],
  },

  // ── Poka Yoke ──
  {
    code: "POKAYOKE.READ",
    module: "POKAYOKE",
    action: "READ",
    description: "View mistake-proofing devices and their verification history",
    grants: EVERYONE,
  },
  {
    code: "POKAYOKE.CREATE",
    module: "POKAYOKE",
    action: "CREATE",
    description: "Propose a mistake-proofing device",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION],
  },
  {
    code: "POKAYOKE.UPDATE",
    module: "POKAYOKE",
    action: "UPDATE",
    description: "Edit a device, mark it installed, and log or end a bypass",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION],
  },
  {
    code: "POKAYOKE.VERIFY",
    module: "POKAYOKE",
    action: "VERIFY",
    description: "Record a periodic check that a device still functions",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP, ...FRONTLINE_SUPERVISION, ...FRONTLINE],
  },
  {
    code: "POKAYOKE.APPROVE",
    module: "POKAYOKE",
    action: "APPROVE",
    description: "Approve a proposed device, or retire one from the line",
    grants: [...CORPORATE, ...PLANT_LEADERSHIP],
  },
  {
    code: "POKAYOKE.DELETE",
    module: "POKAYOKE",
    action: "DELETE",
    description: "Soft-delete a device record",
    grants: [...CORPORATE],
  },
];

// A module with nobody holding one of these is unusable in a way that is not
// obvious from the screen — the button is simply absent and everyone assumes
// the feature is missing. Fail loudly rather than print a green tick over it.
const MUST_HAVE_HOLDERS = [
  "KAIZEN.CREATE",
  "KAIZEN.APPROVE",
  "KAIZEN.VERIFY",
  "OPL.APPROVE",
  "POKAYOKE.VERIFY",
];

async function main() {
  console.log("Applying Business Excellence permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: p.module,
        action: p.action,
        description: p.description,
      },
      update: { module: p.module, action: p.action, description: p.description },
    });

    // De-duplicate: EVERYONE is built by spreading overlapping tiers, and the
    // same (role, permission) pair upserted twice is harmless but makes the
    // per-permission count misreport.
    const seen = new Set<string>();
    let granted = 0;
    for (const g of p.grants) {
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
      granted += 1;
    }
    console.log(`  ✓ ${p.code} → ${granted}/${seen.size} roles`);
  }

  if (missingRoles.size) {
    console.log(
      `\n  – roles not present in this tenant, skipped: ${[...missingRoles].sort().join(", ")}`
    );
  }

  const holders = await prisma.rolePermission.findMany({
    where: { permission: { module: { in: ["KAIZEN", "OPL", "POKAYOKE"] } } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  Business Excellence permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
  }

  const orphaned = MUST_HAVE_HOLDERS.filter((c) => !(byPerm.get(c) ?? []).length);
  if (orphaned.length) {
    throw new Error(
      `No role holds ${orphaned.join(", ")} in this tenant. The module would look ` +
        "installed while being unusable — check that the role codes listed above " +
        "exist before going live."
    );
  }
}

main()
  .catch((e) => {
    console.error("\n❌  Permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
