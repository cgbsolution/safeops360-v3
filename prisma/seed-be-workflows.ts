// Workflow definitions for the three Business Excellence registers.
//
// Idempotent and NON-DESTRUCTIVE, unlike app/seed/seed_workflows.py, which
// deletes and recreates every step and is explicitly unsafe on a database with
// in-flight work. This script creates a definition only if one does not already
// exist for the module, and leaves any existing one — including hand-edits made
// through /configuration/workflows — completely alone.
//   npx tsx prisma/seed-be-workflows.ts   (or: npm run seed:be-workflows)
//
// WHY THREE DEFINITIONS, NOT ONE
// The Form Engine's docstring notes that several forms can share one workflow,
// and imagined the BE registers doing exactly that. They do not, because the
// three approvals are genuinely different acts: screening an idea decides what
// to fund, approving a lesson asserts content is correct, and approving a device
// accepts an engineering control. Sharing one definition would mean editing the
// Kaizen chain silently re-routed OPL approvals — the same footgun the workflow
// definition endpoint warns about.
//
// The engine picks a definition by (module, recordType), preferring a
// recordType match and falling back to the recordType-null default. BE_KAIZEN
// therefore gets TWO: a FAST_TRACK one-step chain for the Suggestion Scheme
// lane, and the default screening chain for everything else.

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
    module: "BE_KAIZEN",
    recordType: null,
    name: "Kaizen — screening and approval",
    description:
      "Standard lane. The idea is screened by the area's supervision, then approved for funding by plant leadership.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Submit",
        approverField: "ORIGINATOR",
        notes: "The person who raised the improvement idea.",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Screening",
        approverRole: "SUPERVISOR",
        // Three working days. An idea that sits longer than a week stops being
        // an idea — the whole point of a suggestion scheme is a visible, fast
        // answer, even when the answer is no.
        slaHours: 72,
        notes:
          "Is the problem real, is the countermeasure sound, and is the effort proportionate? Park it or reject it with a reason rather than leaving it open.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Approval",
        approverRole: "PLANT_HEAD",
        slaHours: 120,
        notes:
          "Approve the investment and name an implementation owner, or decline with a reason the submitter will see.",
      },
    ],
  },
  {
    module: "BE_KAIZEN",
    recordType: "FAST_TRACK",
    name: "Kaizen — Suggestion Scheme fast lane",
    description:
      "A small idea a supervisor can accept without convening the screening committee. One step by design.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Submit",
        approverField: "ORIGINATOR",
      },
      {
        sequence: 2,
        stepType: "CLOSURE",
        name: "Supervisor decision",
        approverRole: "SUPERVISOR",
        // 24h. The fast lane's entire value is that the answer arrives while
        // the person who suggested it still remembers suggesting it.
        slaHours: 24,
        notes:
          "Accept and implement, or decline with a reason. If the idea turns out to need funding, move it to the standard lane instead of approving it here.",
      },
    ],
  },
  {
    module: "BE_OPL",
    recordType: null,
    name: "One Point Lesson — technical review and approval",
    description:
      "A lesson is checked for technical accuracy, then approved. Approval is what allows it to be published, and publishing puts an acknowledgement obligation on other people.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Author",
        approverField: "ORIGINATOR",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Technical review",
        approverRole: "DEPARTMENT_HEAD",
        slaHours: 72,
        notes:
          "Is the content correct, and is it genuinely one point? A lesson that teaches five things teaches none of them.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Approval",
        approverRole: "PLANT_HSE_HEAD",
        slaHours: 72,
        notes:
          "Approving does not publish. Publishing is a separate, deliberate act on the lesson itself, because it assigns reading obligations to named people.",
      },
    ],
  },
  {
    module: "BE_POKA_YOKE",
    recordType: null,
    name: "Poka Yoke — engineering approval",
    description:
      "A proposed mistake-proofing device is reviewed by maintenance and accepted by plant leadership before it is installed on the line.",
    steps: [
      {
        sequence: 1,
        stepType: "MAKER",
        name: "Propose",
        approverField: "ORIGINATOR",
      },
      {
        sequence: 2,
        stepType: "CHECKER",
        name: "Engineering review",
        approverRole: "MAINTENANCE_HEAD",
        slaHours: 96,
        notes:
          "Does the device actually prevent the defect mode named, or only detect it afterwards? Confirm the classification before it is accepted — the register's value depends on that distinction being honest.",
      },
      {
        sequence: 3,
        stepType: "CLOSURE",
        name: "Acceptance",
        approverRole: "PLANT_HEAD",
        slaHours: 120,
        notes:
          "Accepting commits the plant to verifying this device on its stated cadence. Confirm the frequency is one the line can actually sustain.",
      },
    ],
  },
];

async function main() {
  console.log("Seeding Business Excellence workflow definitions…\n");
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
  // BE submit endpoints catch and downgrade to a warning so the register still
  // works. Verify here so a broken definition is found at seed time rather than
  // as a silently workflow-less record six weeks later.
  const defs = await prisma.workflowDefinition.findMany({
    where: { module: { in: ["BE_KAIZEN", "BE_OPL", "BE_POKA_YOKE"] } },
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
    if (!sorted.some((s) => s.stepType === "CLOSURE")) {
      broken.push(`${def.module}: no CLOSURE step — the record could never finish`);
    }
  }
  if (broken.length) {
    throw new Error(`Unusable workflow definition(s):\n  - ${broken.join("\n  - ")}`);
  }

  console.log(
    `\n✅  ${created} definition(s) created, ${skipped} left as-is. ` +
      `${defs.length} BE definitions present and structurally valid.`
  );
}

main()
  .catch((e) => {
    console.error("\n❌  Workflow seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
