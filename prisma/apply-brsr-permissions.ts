// Targeted, idempotent grant of the BRSR.* permissions.
//
// Written as a surgical upsert (NOT seed-rbac.ts, which is destructive) so it is
// safe against prod: it touches only the six BRSR permission rows and the role
// grants listed below. No other role or permission is read or written.
//   npx tsx prisma/apply-brsr-permissions.ts
//
// Who gets what, and why:
//
//   BRSR.READ         — wide. A disclosure is a whole-company artefact; the
//                       people who own the source data (HSE, Environment, HR,
//                       Facilities, Risk) need to see how their numbers land in
//                       it, or the auto-population is a black box to exactly the
//                       people best placed to catch it being wrong.
//   BRSR.CREATE       — narrow. Opening a cycle is a governance act.
//   BRSR.UPDATE       — the people who actually fill the disclosure in.
//   BRSR.APPROVE      — sign-off + filing + marking a principle REVIEWED.
//                       ⚠ HSE_MANAGER holds this by an explicit business
//                       decision (Aug 2026), so on this deployment one role can
//                       both prepare and attest a disclosure. The
//                       preparer/approver separation was raised and waived
//                       deliberately — it is NOT an oversight, and it is not to
//                       be "tidied up" by a later refactor. If an assurance
//                       provider queries who signed off relative to who entered
//                       the figures, `BrsrIndicatorValue.createdBy` /
//                       `verifiedById` and `BrsrReportingCycle.approvedById`
//                       carry the actual per-figure trail to answer with.
//   BRSR.ENV_SUBMIT   — per-site environmental capture. OWN_PLANT for the site
//                       roles, so a plant enters its own numbers and no others.
//   BRSR.ENV_VERIFY   — the second pair of eyes on a site submission. NOT
//                       granted to the same site-level roles that submit; a
//                       verification step the submitter can perform on their own
//                       work is not a verification step.
//   BRSR.EXPORT       — pulling the filing-ready export out of the platform.

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
    code: "BRSR.READ",
    action: "READ",
    description: "View BRSR reporting cycles, principle responses, indicator values and the assembled report",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "EXECUTIVE_VIEWER", scope: "ALL_PLANTS" },
      { roleCode: "CRO", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      { roleCode: "ENVIRONMENT_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "HR_HEAD", scope: "ALL_PLANTS" },
      { roleCode: "FACILITIES_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "INTERNAL_AUDIT_LEAD", scope: "ALL_PLANTS" },
      { roleCode: "CAMS_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "VENDOR_RISK_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "BRSR.CREATE",
    action: "CREATE",
    description: "Open a new BRSR reporting cycle for a financial year",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      // Added after HSE Managers hit "Missing permission 'BRSR.CREATE'" in
      // prod. They already hold BRSR.UPDATE at ALL_PLANTS — i.e. they do the
      // actual work of filling the disclosure — so withholding the ability to
      // OPEN the cycle just made them wait on an admin to click one button.
      // ALL_PLANTS because a BRSR cycle belongs to the listed entity and
      // carries no plantId; an OWN_PLANT scope would have nothing to match on.
      // NOTE: BRSR.APPROVE is deliberately NOT granted here — see that block.
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
    ],
  },
  {
    code: "BRSR.UPDATE",
    action: "UPDATE",
    description: "Enter and override BRSR indicator values, run the mapping engine, and edit principle narratives",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      { roleCode: "ENVIRONMENT_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "HR_HEAD", scope: "ALL_PLANTS" },
      { roleCode: "FACILITIES_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "VENDOR_RISK_MANAGER", scope: "ALL_PLANTS" },
    ],
  },
  {
    code: "BRSR.APPROVE",
    action: "APPROVE",
    description: "Approve a BRSR disclosure, mark a principle reviewed, and record the cycle as FILED",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      { roleCode: "CRO", scope: "ALL_PLANTS" },
      // Explicit business decision — see the note above this list.
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
    ],
  },
  {
    code: "BRSR.ENV_SUBMIT",
    action: "ENV_SUBMIT",
    description: "Capture and submit a facility's environmental metrics (energy, water, emissions, waste) for a BRSR cycle",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ENVIRONMENT_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "FACILITIES_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "PLANT_HSE_HEAD", scope: "OWN_PLANT" },
      { roleCode: "FACTORY_MANAGER", scope: "OWN_PLANT" },
      { roleCode: "HSE_MANAGER", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "BRSR.ENV_VERIFY",
    action: "ENV_VERIFY",
    description: "Verify a facility's submitted environmental metrics — the second pair of eyes before the figures reach the disclosure",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "ENVIRONMENT_MANAGER", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      // Deliberately excludes FACTORY_MANAGER / PLANT_HSE_HEAD / HSE_MANAGER —
      // they submit, so verifying their own submission would be no check at all.
      { roleCode: "PLANT_HEAD", scope: "OWN_PLANT" },
    ],
  },
  {
    code: "BRSR.EXPORT",
    action: "EXPORT",
    description: "Export the filing-ready BRSR report and structured data export",
    grants: [
      { roleCode: "SYSTEM_ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "ADMIN", scope: "ALL_PLANTS" },
      { roleCode: "CORPORATE_HSE", scope: "ALL_PLANTS" },
      { roleCode: "COMPLIANCE_OFFICER", scope: "ALL_PLANTS" },
      { roleCode: "CRO", scope: "ALL_PLANTS" },
      { roleCode: "EXECUTIVE_VIEWER", scope: "ALL_PLANTS" },
      { roleCode: "INTERNAL_AUDIT_LEAD", scope: "ALL_PLANTS" },
      // The role that prepares the disclosure needs to pull the draft out to
      // review and circulate it; without this it hits a 403 on its next click
      // after filling the cycle in.
      { roleCode: "HSE_MANAGER", scope: "ALL_PLANTS" },
    ],
  },
];

async function main() {
  console.log("Applying BRSR permissions…\n");
  const missingRoles = new Set<string>();

  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: "BRSR",
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
    where: { permission: { module: "BRSR" } },
    include: { role: true, permission: true },
  });
  const byPerm = new Map<string, string[]>();
  for (const h of holders) {
    const list = byPerm.get(h.permission.code) ?? [];
    list.push(h.role.code);
    byPerm.set(h.permission.code, list);
  }
  console.log("\n✅  BRSR permissions in place:");
  for (const [code, roles] of [...byPerm.entries()].sort()) {
    console.log(`    ${code}: ${roles.sort().join(", ")}`);
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
