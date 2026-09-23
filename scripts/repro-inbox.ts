// Reproduces exactly the queries src/app/(dashboard)/inbox/page.tsx runs,
// against whatever DATABASE_URL is configured, and reports which one throws.
// Read-only.
//
//   npx tsx scripts/repro-inbox.ts [userEmail]

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// tsx does not load .env the way `next` does, and this project has no dotenv
// dependency — parse the root .env by hand so the script talks to the same
// database the app does.
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const prisma = new PrismaClient();
const PARTY_INCLUDE = { plant: { select: { name: true } } } as const;
const NEWEST_TASK_FIRST = [{ assignedAt: "desc" }, { id: "desc" }] as any;

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const t0 = Date.now();
    const r = await fn();
    const n = Array.isArray(r) ? `${r.length} rows` : JSON.stringify(r)?.slice(0, 60);
    console.log(`  OK       ${label}  (${Date.now() - t0}ms)  ${n}`);
    return r;
  } catch (e: any) {
    console.log(`  THROWS   ${label}`);
    console.log(`           ${String(e?.message ?? e).split("\n").slice(0, 6).join("\n           ")}`);
    return null;
  }
}

async function main() {
  const email = process.argv[2] ?? "admin@safeops360.in";
  const user = await prisma.user.findFirst({ where: { email }, select: { id: true, email: true } });
  if (!user) throw new Error(`no user ${email}`);
  console.log(`Reproducing inbox queries as ${user.email}\n`);

  await step("workflowTask.groupBy(taskType)", () =>
    prisma.workflowTask.groupBy({
      by: ["taskType"],
      where: { assignedToId: user.id, status: { in: ["PENDING", "OVERDUE", "ESCALATED"] } },
      _count: { _all: true },
    }),
  );

  await step("workflowInstance.count(initiatedBy)", () =>
    prisma.workflowInstance.count({ where: { initiatedById: user.id } }),
  );

  await step("workflowTask.count(overdue)", () =>
    prisma.workflowTask.count({
      where: { assignedToId: user.id, status: { in: ["OVERDUE", "ESCALATED"] } },
    }),
  );

  // unreadInboxCounts() — the readAt-based unread rollup.
  await step("unreadInboxCounts (readAt groupBy)", async () => {
    const { unreadInboxCounts } = await import("../src/lib/workflow/read-state");
    return unreadInboxCounts(user.id);
  });

  for (const taskType of ["APPROVAL", "EXECUTION", "VERIFICATION"]) {
    await step(`workflowTask.findMany(${taskType}) + PARTY_INCLUDE`, () =>
      prisma.workflowTask.findMany({
        where: {
          assignedToId: user.id,
          taskType,
          status: { in: ["PENDING", "OVERDUE", "ESCALATED"] },
        },
        include: { instance: { include: { initiatedBy: { include: PARTY_INCLUDE } } } },
        orderBy: NEWEST_TASK_FIRST,
      }),
    );
  }

  await step("workflowInstance.findMany(submitted)", () =>
    prisma.workflowInstance.findMany({
      where: { initiatedById: user.id },
      orderBy: { initiatedAt: "desc" },
      take: 50,
    }),
  );

  // The three SLA sweeps the page fires before rendering.
  await step("WorkflowEngine.sweepOverdue", async () => {
    const { WorkflowEngine } = await import("../src/lib/workflow/engine");
    return WorkflowEngine.sweepOverdue();
  });
  await step("WorkflowEngine.sweepExpiredPermits", async () => {
    const { WorkflowEngine } = await import("../src/lib/workflow/engine");
    return WorkflowEngine.sweepExpiredPermits();
  });
  await step("WorkflowEngine.sweepInspectionStatus", async () => {
    const { WorkflowEngine } = await import("../src/lib/workflow/engine");
    return WorkflowEngine.sweepInspectionStatus();
  });
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
