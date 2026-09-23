// Workflow definitions for the three Business Excellence Phase 2 registers.
//
// Idempotent and NON-DESTRUCTIVE, like seed-be-workflows.ts and unlike
// app/seed/seed_workflows.py, which deletes and recreates every step and is
// explicitly unsafe on a database with in-flight work. This script creates a
// definition only if one does not already exist for the module, and leaves any
// existing one — including hand-edits made through /configuration/workflows —
// completely alone.
//   npx tsx prisma/seed-be-p2-workflows.ts  (or: npm run seed:be-p2-workflows)
//
// WHY THREE MORE DEFINITIONS
// Same reasoning as Phase 1: these approvals are different acts. Screening a
// suggestion decides whether it is worth anybody's attention; chartering a
// circle project commits a team's time for months; approving a SIP commits a
// sponsor's budget. Sharing a chain would mean re-routing one silently
// re-routed the others.
//
// ⚠ WHAT THE ENGINE DOES AND DOES NOT DRIVE HERE
// The workflow instance carries the record only as far as its FIRST state:
// SCREENING for a suggestion, CHARTERED for a QCC project, APPROVED for a SIP —
// see _ON_APPROVED in services/business_excellence_p2.py. Everything after that
// is the register's own state machine, because a DMAIC gate sequence and a
// milestone tracker are not approval chains and modelling them as one would put
// five CHECKER steps in front of work that has not started yet.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type StepSeed = {
  sequence: number;
  stepType: "MAKER" | "CHECKER" | "ASSIGNEE_TASK" | "VERIFIER" | "CLOSURE";
  name: string;
  approverRole?: string;
  approverField?: string;
  slaHours?: number;
  notes?: string;
};

type DefinitionSeed = {
  module: string;
  recordType: string | null;
  name: string;
  description: string;
  steps: StepSeed[];
};

const DEFINITIONS: DefinitionSeed[] = [
  {
    module: "BE_SUGGESTION",
    recordType: null,
    name: "Suggestion Scheme — screening committee",
    description:
      "A suggestion is triaged by the scheme coordinator, then decided by the committee. Two steps because §3 describes two distinct acts by two different groups.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Submit",
        approverField: "ORIGINATOR",
        notes:
          "The submitter. An anonymous suggestion still records who raised it for the audit trail — the identity is withheld from every reader except the submitter, not discarded.",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Triage",
        approverRole: "SUPERVISOR",
        // Two working days. §3's reporting measures "average decision
        // turnaround"; a triage step that takes a week makes that number
        // meaningless before the committee has even seen the suggestion.
        slaHours: 48,
        notes:
          "Relevant, not relevant, or a duplicate of something already raised? A duplicate must name the suggestion it duplicates, or it is a rejection nobody admitted to.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Committee decision",
        approverRole: "DEPARTMENT_HEAD",
        slaHours: 168,
        notes:
          "Accept, reject or defer — and give a reason on every one of them, including acceptances. The submitter sees it, and it is the only thing that teaches people what a good suggestion looks like.",
      },
    ],
  },
  {
    module: "BE_QCC",
    recordType: null,
    name: "Quality Circle — project charter approval",
    description:
      "A circle's chosen problem is approved before the team commits months to it. The DMAIC/PDCA gates that follow are the register's own stage sign-offs, not steps in this chain.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Charter",
        approverField: "ORIGINATOR",
        notes: "The circle leader or facilitator proposing the project.",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Facilitator review",
        approverRole: "DEPARTMENT_HEAD",
        slaHours: 96,
        notes:
          "Is the problem the right size for a circle, is the baseline real and measurable, and is the target honest? A charter with an unmeasurable baseline produces a benefit nobody can validate at the end.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Steering approval",
        approverRole: "PLANT_HEAD",
        slaHours: 120,
        notes:
          "Approving commits the circle's time. Confirm the target date is one the team can meet alongside their day jobs — an abandoned circle project costs more morale than it ever saved.",
      },
    ],
  },
  {
    module: "BE_SIP",
    recordType: null,
    name: "Structured Improvement Project — multi-level sign-off",
    description:
      "§7's 'project owner → department head → BE/leadership' chain, run before the project is formally opened.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Submit charter",
        approverField: "ORIGINATOR",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Departmental review",
        approverRole: "DEPARTMENT_HEAD",
        slaHours: 120,
        notes:
          "Feasibility and impact. The two scores set the priority the portfolio sorts on, so a generous score here quietly outranks somebody else's project.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Leadership approval",
        approverRole: "PLANT_HEAD",
        slaHours: 168,
        notes:
          "Approving opens the project and commits the sponsor. Confirm the sponsor and the owner are different people — the benefit sign-off at the end depends on there being an independent voice.",
      },
    ],
  },
];

const MODULES = ["BE_SUGGESTION", "BE_QCC", "BE_SIP"];

async function main() {
  console.log("Seeding Business Excellence Phase 2 workflow definitions…\n");
  let created = 0;
  let skipped = 0;

  for (const d of DEFINITIONS) {
    const existing = await prisma.workflowDefinition.findFirst({
      where: { module: d.module, recordType: d.recordType },
      include: { steps: true },
    });

    if (existing) {
      // Never touch an existing definition. Somebody may have re-routed it
      // through /configuration/workflows, and silently reverting that is worse
      // than not seeding at all.
      console.log(
        `  – ${d.module}${d.recordType ? ` (${d.recordType})` : ""} already exists ` +
          `with ${existing.steps.length} step(s) — left untouched`
      );
      skipped += 1;
      continue;
    }

    const def = await prisma.workflowDefinition.create({
      data: {
        module: d.module,
        recordType: d.recordType,
        name: d.name,
        description: d.description,
        isActive: true,
        steps: {
          create: d.steps.map((s) => ({
            sequence: s.sequence,
            stepType: s.stepType,
            name: s.name,
            approverRole: s.approverRole ?? null,
            approverField: s.approverField ?? null,
            slaHours: s.slaHours ?? null,
            slaUnit: s.slaHours ? "HOURS" : null,
            notes: s.notes ?? null,
          })),
        },
      },
      include: { steps: true },
    });
    console.log(
      `  ✓ ${d.module}${d.recordType ? ` (${d.recordType})` : ""} — ` +
        `${def.steps.length} steps: ${d.steps.map((s) => s.name).join(" → ")}`
    );
    created += 1;
  }

  // The engine refuses to start an instance without a MAKER step and without an
  // executable step after it, and it raises rather than returning — which the
  // submit endpoints catch and downgrade to a warning so the register still
  // works. Verify here so a broken definition is found at seed time rather than
  // as a silently workflow-less record six weeks later.
  const defs = await prisma.workflowDefinition.findMany({
    where: { module: { in: MODULES } },
    include: { steps: true },
  });
  const broken: string[] = [];
  for (const def of defs) {
    const sorted = [...def.steps].sort((a, b) => a.sequence - b.sequence);
    const maker = sorted.find((s) => s.stepType === "MAKER");
    if (!maker) {
      broken.push(`${def.module}: no MAKER step`);
      continue;
    }
    if (!sorted.some((s) => s.sequence > maker.sequence)) {
      broken.push(`${def.module}: nothing executable after the MAKER step`);
    }
    const closures = sorted.filter((s) => s.stepType === "CLOSURE");
    if (!closures.length) {
      broken.push(`${def.module}: no CLOSURE step — the record could never finish`);
    }
    if (closures.length > 1) {
      // INCIDENT/* shipped with two CLOSURE steps and became unsaveable through
      // the workflow admin UI. Catch it here rather than at the point somebody
      // tries to edit the chain.
      broken.push(
        `${def.module}: ${closures.length} CLOSURE steps — the admin UI cannot save this`
      );
    }
  }
  if (broken.length) {
    throw new Error(`Unusable workflow definition(s):\n  - ${broken.join("\n  - ")}`);
  }

  // The approver roles have to exist, or every instance stalls on step 2 with no
  // possible assignee and the register looks like it is working right up until
  // somebody tries to approve something.
  const wanted = [
    ...new Set(
      DEFINITIONS.flatMap((d) => d.steps.map((s) => s.approverRole).filter(Boolean))
    ),
  ] as string[];
  const present = new Set(
    (await prisma.role.findMany({ where: { code: { in: wanted } } })).map((r) => r.code)
  );
  const absent = wanted.filter((r) => !present.has(r));
  if (absent.length) {
    throw new Error(
      `Approver role(s) missing in this tenant: ${absent.join(", ")}. Every ` +
        `instance would stall with no possible approver.`
    );
  }

  console.log(
    `\n✅  ${created} definition(s) created, ${skipped} left as-is. ` +
      `${defs.length} Phase 2 definitions present and structurally valid.`
  );
  console.log(`    Approver roles verified: ${wanted.sort().join(", ")}`);
}

main()
  .catch((e) => {
    console.error("\n❌  Workflow seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
