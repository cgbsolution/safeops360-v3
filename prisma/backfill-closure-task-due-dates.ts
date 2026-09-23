/**
 * Backfill: stamp `WorkflowTask.dueAt` on OPEN closure tasks from the record's
 * own target closure date.
 *
 * Bug SO-1 — the Closure step rendered "No SLA" beside a Metadata panel that
 * showed the correct due date. Root cause: a closure task's `dueAt` came from
 * the step's `slaHours`, and steps whose deadline is owned by the record-level
 * SLA matrix (`Observation.targetDate`, `NearMiss.targetDate`) carry no
 * `slaHours`, so `dueAt` was left null.
 *
 * `workflow_engine._resolve_due_at` now derives a closure task's deadline from
 * that record-level date, but only for tasks created after the fix. This script
 * repairs the tasks already sitting open.
 *
 * Safe to re-run:
 *   - Only touches tasks that are OPEN (PENDING / OVERDUE / ESCALATED).
 *   - Only touches tasks whose `dueAt` is NULL — never overwrites a deadline
 *     someone is already being measured against.
 *   - Only touches CLOSURE steps, and only where the record has a target date.
 *
 * Reports what it would change with --dry-run:
 *   npx tsx prisma/backfill-closure-task-due-dates.ts --dry-run
 *   npx tsx prisma/backfill-closure-task-due-dates.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

const OPEN_STATUSES = ["PENDING", "OVERDUE", "ESCALATED"];

/** Modules whose closure deadline is owned by a record-level target date. */
const TARGET_DATE_MODULES = {
  OBSERVATION: (ids: string[]) =>
    prisma.observation.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetDate: true },
    }),
  NEAR_MISS: (ids: string[]) =>
    prisma.nearMiss.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetDate: true },
    }),
} as const;

async function main() {
  // The step type lives on WorkflowStep, so resolve the closure step ids first.
  const closureSteps = await prisma.workflowStep.findMany({
    where: { stepType: "CLOSURE" },
    select: { id: true },
  });
  const closureStepIds = closureSteps.map((s) => s.id);
  if (closureStepIds.length === 0) {
    console.log("No CLOSURE steps defined — nothing to do.");
    return;
  }

  let totalFixed = 0;
  let totalSkipped = 0;

  for (const [module, loadRecords] of Object.entries(TARGET_DATE_MODULES)) {
    const tasks = await prisma.workflowTask.findMany({
      where: {
        module,
        stepId: { in: closureStepIds },
        status: { in: OPEN_STATUSES },
        dueAt: null,
      },
      select: { id: true, recordId: true, recordNumber: true },
    });
    if (tasks.length === 0) {
      console.log(`${module}: no open closure tasks missing a due date.`);
      continue;
    }

    const records = await loadRecords(tasks.map((t) => t.recordId));
    const targetById = new Map(records.map((r) => [r.id, r.targetDate]));

    for (const t of tasks) {
      const target = targetById.get(t.recordId);
      if (!target) {
        // No record-level date to inherit — leaving dueAt null is correct here;
        // inventing one would fabricate an SLA nobody agreed to.
        totalSkipped++;
        console.log(`  · ${module} ${t.recordNumber ?? t.recordId} — no target date on the record, left as-is`);
        continue;
      }
      if (!DRY_RUN) {
        await prisma.workflowTask.update({ where: { id: t.id }, data: { dueAt: target } });
      }
      totalFixed++;
      console.log(
        `  ${DRY_RUN ? "would set" : "set"} ${module} ${t.recordNumber ?? t.recordId} → ${target.toISOString()}`
      );
    }
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] " : ""}${totalFixed} closure task(s) stamped, ${totalSkipped} left without a date.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
