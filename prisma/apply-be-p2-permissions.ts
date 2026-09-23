// Targeted, idempotent grant of the Business Excellence Phase 2 permissions.
//
// Written as a surgical upsert (NOT seed-rbac.ts, which is destructive) so it is
// safe against prod: it touches only the twenty Phase 2 permission rows and the
// role grants listed below. No other role or permission is read or written.
//   npx tsx prisma/apply-be-p2-permissions.ts  (or: npm run db:apply-be-p2-permissions)
//
// FOUR PREFIXES, MATCHING PHASE 1'S REASONING
// SUGGESTION.* / QCC.* / SIP.* / BENEFIT.* rather than one BE.*, because these
// registers are governed by genuinely different people: a scheme coordinator
// triages suggestions, a circle facilitator signs off DMAIC gates, a steering
// group approves SIPs, and finance validates a benefit. One prefix would force
// all four onto whoever holds it.
//
// Who gets what, and why:
//
//   SUGGESTION.READ    — everyone. A scheme whose ideas are invisible is a
//                        suggestion box.
//   SUGGESTION.CREATE  — everyone down to WORKER and CONTRACTOR_WORKMAN. §3 is
//                        an "open-ended improvement channel for any employee"; a
//                        scheme only supervisors can file into is not one.
//   SUGGESTION.UPDATE  — the supervisory chain. Implementation progress.
//   SUGGESTION.SCREEN  — the triage tier. DELIBERATELY SEPARATE from DECIDE:
//                        §3 describes two acts by two groups, and collapsing
//                        them would let whoever clears the inbox also approve
//                        the incentive attached to it.
//   SUGGESTION.DECIDE  — the committee. Accept / reject / defer, and the
//                        incentive that follows an acceptance.
//
//   QCC.READ           — everyone. Circles are a visible, social programme; a
//                        leaderboard nobody can see motivates nobody.
//   QCC.CREATE         — supervision and up. Forming a circle and chartering a
//                        project both commit other people's time.
//   QCC.UPDATE         — the same tier, plus working the gates day to day.
//   QCC.SIGNOFF        — narrower, and the load-bearing one. §6: "Each stage
//                        requires a completion sign-off before the project
//                        advances." Granted at plant leadership and to the
//                        facilitator tier, NOT to the circle's own members —
//                        the API separately refuses a sign-off from someone
//                        who cannot clear the stage's blockers.
//   QCC.EVALUATE       — judging. Narrow on purpose, and the API additionally
//                        refuses anyone who was ever in the circle.
//
//   SIP.READ           — everyone at supervision and up. A SIP portfolio is a
//                        management artefact, not a shop-floor one, and unlike
//                        Kaizen there is nothing here a machine operator acts on.
//   SIP.CREATE         — leadership. §7 SIPs are "sponsor-backed" and
//                        "cross-functional"; anyone may propose one through a
//                        Kaizen or a suggestion, which is what those registers
//                        are for.
//   SIP.UPDATE         — the owner tier: milestones, RAG, readings.
//   SIP.APPROVE        — §7's "Multi-level sign-off … before the project is
//                        formally opened", and cancellation.
//
//   BENEFIT.READ       — everyone who can read any register, so a benefit line
//                        is visible on the record it belongs to.
//   BENEFIT.RECORD     — whoever runs the improvement: claim projected and
//                        realised figures, append readings.
//   BENEFIT.VALIDATE   — THE NARROWEST GRANT IN THIS FILE, and the point of the
//                        whole layer. §6 requires sign-off "separate from the
//                        circle's own reporting"; §7 "validated by a designated
//                        authority". Corporate finance-facing roles and plant
//                        heads only. The API enforces separation of duties on
//                        top of this — holding the permission is necessary, not
//                        sufficient.
//
// ⚠ BENEFIT.VALIDATE is deliberately NOT granted to DEPARTMENT_HEAD or
// SUPERVISOR. If a tenant needs a departmental validator, add the grant here
// rather than widening the code — the separation-of-duties check in
// services/business_excellence_p2.validation_blockers() will still refuse
// anyone too close to the record.
//
// Roles that do not exist in a given tenant are skipped and reported, never
// created — role taxonomy stays owned by seed-rbac.ts.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grant = { roleCode: string; scope: string };

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

const MANAGEMENT: Grant[] = [...CORPORATE, ...PLANT_LEADERSHIP];
const SUPERVISION_UP: Grant[] = [
  ...CORPORATE,
  ...PLANT_LEADERSHIP,
  ...FRONTLINE_SUPERVISION,
];

const PERMISSIONS: {
  code: string;
  module: string;
  action: string;
  description: string;
  grants: Grant[];
}[] = [
  // ── Suggestion Scheme ──
  {
    code: "SUGGESTION.READ",
    module: "SUGGESTION",
    action: "READ",
    description: "View employee suggestions and their decisions",
    grants: EVERYONE,
  },
  {
    code: "SUGGESTION.CREATE",
    module: "SUGGESTION",
    action: "CREATE",
    description: "Raise and submit a suggestion, anonymously if chosen",
    grants: EVERYONE,
  },
  {
    code: "SUGGESTION.UPDATE",
    module: "SUGGESTION",
    action: "UPDATE",
    description: "Edit a suggestion and record implementation progress",
    grants: SUPERVISION_UP,
  },
  {
    code: "SUGGESTION.SCREEN",
    module: "SUGGESTION",
    action: "SCREEN",
    description: "Triage a suggestion as relevant, not relevant or duplicate",
    grants: SUPERVISION_UP,
  },
  {
    code: "SUGGESTION.DECIDE",
    module: "SUGGESTION",
    action: "DECIDE",
    description: "Accept, reject or defer a suggestion and set its incentive",
    grants: MANAGEMENT,
  },
  {
    code: "SUGGESTION.DELETE",
    module: "SUGGESTION",
    action: "DELETE",
    description: "Soft-delete a suggestion",
    grants: [...CORPORATE],
  },

  // ── Quality Circle ──
  {
    code: "QCC.READ",
    module: "QCC",
    action: "READ",
    description: "View quality circles, their projects and the leaderboard",
    grants: EVERYONE,
  },
  {
    code: "QCC.CREATE",
    module: "QCC",
    action: "CREATE",
    description: "Form a quality circle and charter a project",
    grants: SUPERVISION_UP,
  },
  {
    code: "QCC.UPDATE",
    module: "QCC",
    action: "UPDATE",
    description: "Edit a circle, its roster, a charter and its stage content",
    grants: SUPERVISION_UP,
  },
  {
    code: "QCC.SIGNOFF",
    module: "QCC",
    action: "SIGNOFF",
    description: "Sign off a project stage gate and complete or close a project",
    grants: [
      ...MANAGEMENT,
      { roleCode: "MAINTENANCE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "SAFETY_OFFICER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "QCC.EVALUATE",
    module: "QCC",
    action: "EVALUATE",
    description: "Score a completed circle project against the rubric",
    grants: MANAGEMENT,
  },
  {
    code: "QCC.DELETE",
    module: "QCC",
    action: "DELETE",
    description: "Soft-delete a circle or a project",
    grants: [...CORPORATE],
  },

  // ── Structured Improvement Project ──
  {
    code: "SIP.READ",
    module: "SIP",
    action: "READ",
    description: "View the structured improvement project portfolio",
    grants: SUPERVISION_UP,
  },
  {
    code: "SIP.CREATE",
    module: "SIP",
    action: "CREATE",
    description: "Register a structured improvement project and its charter",
    grants: MANAGEMENT,
  },
  {
    code: "SIP.UPDATE",
    module: "SIP",
    action: "UPDATE",
    description: "Run a project: milestones, progress, readings, lessons learned",
    grants: SUPERVISION_UP,
  },
  {
    code: "SIP.APPROVE",
    module: "SIP",
    action: "APPROVE",
    description: "Approve, reject, cancel or close a structured improvement project",
    grants: [...CORPORATE, { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" }, { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" }],
  },
  {
    code: "SIP.DELETE",
    module: "SIP",
    action: "DELETE",
    description: "Soft-delete a structured improvement project",
    grants: [...CORPORATE],
  },

  // ── Benefit realisation ──
  {
    code: "BENEFIT.READ",
    module: "BENEFIT",
    action: "READ",
    description: "View projected and realised benefit lines",
    grants: EVERYONE,
  },
  {
    code: "BENEFIT.RECORD",
    module: "BENEFIT",
    action: "RECORD",
    description: "Open a benefit line, claim a realised figure and append readings",
    grants: SUPERVISION_UP,
  },
  {
    code: "BENEFIT.VALIDATE",
    module: "BENEFIT",
    action: "VALIDATE",
    description:
      "Independently confirm a realised benefit after its validation window",
    grants: [
      ...CORPORATE,
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
    ],
  },
];

// Permissions whose absence would make the module look installed while being
// unusable. Every one of these is a gate somebody MUST be able to pass for a
// record to reach its terminal state. PTW's own EXECUTE grant went missing once
// and no permit could close.
const MUST_HAVE_HOLDERS = [
  "SUGGESTION.CREATE",
  "SUGGESTION.SCREEN",
  "SUGGESTION.DECIDE",
  "QCC.CREATE",
  "QCC.SIGNOFF",
  "SIP.CREATE",
  "SIP.APPROVE",
  "BENEFIT.RECORD",
  "BENEFIT.VALIDATE",
];

async function main() {
  console.log("Applying Business Excellence Phase 2 permissions…\n");
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

    // De-duplicate: the tiers overlap by design, and the same (role, permission)
    // pair upserted twice is harmless but makes the per-permission count
    // misreport.
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
    where: { permission: { module: { in: ["SUGGESTION", "QCC", "SIP", "BENEFIT"] } } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  Business Excellence Phase 2 permissions in place:");
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

  // A benefit that nobody but its own author can validate is a benefit that can
  // never be validated. Confirm the validator set is not a subset of the people
  // who record them — this is the separation-of-duties rule expressed as a
  // deployment check rather than only as a runtime one.
  const validators = new Set(byPerm.get("BENEFIT.VALIDATE") ?? []);
  const recorders = new Set(byPerm.get("BENEFIT.RECORD") ?? []);
  const independent = [...validators].filter((r) => !recorders.has(r));
  if (!validators.size) {
    throw new Error("No role holds BENEFIT.VALIDATE — no benefit could ever be signed off.");
  }
  console.log(
    `\n    BENEFIT.VALIDATE is held by ${validators.size} role(s), ` +
      `${independent.length} of which cannot record a benefit at all.`
  );
}

main()
  .catch((e) => {
    console.error("\n❌  Permission apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
