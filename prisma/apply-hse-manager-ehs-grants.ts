// Grants the HSE_MANAGER role the EHS-core permissions it was missing.
//
//   npx tsx prisma/apply-hse-manager-ehs-grants.ts            (dry run — prints what would change)
//   npx tsx prisma/apply-hse-manager-ehs-grants.ts --apply    (writes)
//
// Found in the 2026-11-24 access audit: HSE_MANAGER holds 345 grants but none
// for legal compliance obligations, field-capture create, EHS masters, RCA
// taxonomy, CAMS audit-type config, crisis activation / drills, or read access
// to the risk register, KRIs, losses and controls — so those menus and buttons
// never appeared for an HSE Manager. Surgical upsert: touches only HSE_MANAGER
// rows for the codes below; never removes a grant. Scope matches the role's
// existing grants (ALL_PLANTS).
//
// Deliberately NOT granted (governance / other owners — grant per site policy):
//   COMPLIANCE.WAIVE, CAPTURE.UNMASK (reporter anonymity), CONFIGURATION.ROLES /
//   USERS / WORKFLOWS, CAMS.TEMPLATE_APPROVE (they author templates — approving
//   their own would defeat the check), ERM write actions, APPETITE.*,
//   INSURANCE.*, VENDOR.*, BIA.*, SCENARIO / HORIZON / PLAN writes.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROLE = "HSE_MANAGER";
const SCOPE = "ALL_PLANTS";

const CODES: { code: string; why: string }[] = [
  { code: "COMPLIANCE.READ", why: "legal / statutory obligations register" },
  { code: "COMPLIANCE.MANAGE", why: "maintain EHS obligations and tasks" },
  { code: "COMPLIANCE.ATTEST", why: "attest EHS compliance" },
  { code: "COMPLIANCE.VERIFY", why: "verify compliance evidence" },
  { code: "CAPTURE.CREATE", why: "raise a field capture (voice / photo report)" },
  { code: "CONFIGURATION.MASTERS", why: "EHS masters: dropdowns, hazards, categories" },
  { code: "RCA.TAXONOMY_ADMIN", why: "root-cause taxonomy used in investigations" },
  { code: "CAMS.TYPE_CONFIG", why: "audit / inspection type configuration" },
  { code: "CRISIS.ACTIVATE", why: "activate emergency / crisis response" },
  { code: "EXERCISE.WRITE", why: "plan emergency drills and exercises" },
  { code: "EXERCISE.COMPLETE", why: "record drill outcomes" },
  { code: "BCM.READ", why: "see continuity plans that EHS emergencies hand over to" },
  { code: "ERM.READ", why: "see the enterprise risk register EHS risks roll up into" },
  { code: "KRI.READ", why: "see EHS key risk indicators" },
  { code: "LOSS.READ", why: "see loss events from incidents" },
  { code: "LOSS.CREATE", why: "record the loss from an incident" },
  { code: "CONTROL.READ", why: "see the controls library EHS controls map to" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const role = await prisma.role.findUnique({ where: { code: ROLE } });
  if (!role) throw new Error(`Role ${ROLE} not found`);

  const have = new Set(
    (await prisma.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } })).map(
      (rp) => rp.permission.code
    )
  );
  let added = 0;
  const missingPerm: string[] = [];
  console.log(`${apply ? "Applying" : "DRY RUN —"} EHS grants for ${ROLE}\n`);
  for (const { code, why } of CODES) {
    if (have.has(code)) {
      console.log(`  = ${code} (already granted)`);
      continue;
    }
    const perm = await prisma.permission.findUnique({ where: { code } });
    if (!perm) {
      missingPerm.push(code);
      console.log(`  ! ${code} — permission row does not exist in this tenant, skipped`);
      continue;
    }
    console.log(`  + ${code}  — ${why}`);
    if (apply) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id, scope: SCOPE },
        update: {},
      });
    }
    added += 1;
  }
  console.log(
    `\n${apply ? "Granted" : "Would grant"} ${added} permission(s)` +
      (missingPerm.length ? `; ${missingPerm.length} code(s) not present in this tenant` : "") +
      (apply ? "." : ". Re-run with --apply to write.")
  );
  if (apply && added) console.log("Users pick this up on their next page load (client cache is 5 min).");
}

main()
  .catch((e) => {
    console.error("❌ HSE Manager grant failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
