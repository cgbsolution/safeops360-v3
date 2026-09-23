// §5 migration report — READ ONLY. Writes nothing, changes nothing.
//
// The fast-track BADGE is now derived from the record's own investment and
// implementation-time figures rather than from the `lane` column a submitter
// picked at raise time. `lane` itself is untouched: it routes the approval
// workflow (BE_KAIZEN "screening and approval" vs "Suggestion Scheme fast lane",
// both live) and reclassifying it would silently re-route records mid-flight.
//
// So nothing is reclassified by this change. What DOES happen is that records
// which carried the badge on no evidence stop displaying it. This report names
// them so an admin can enter the missing investment figure and get the badge
// back, rather than discovering the change by noticing a badge is gone.
//
//   npx tsx prisma/report-kaizen-fast-track.ts
//   npx tsx prisma/report-kaizen-fast-track.ts --csv > fast-track-review.csv

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors FAST_TRACK_MAX_INVESTMENT / FAST_TRACK_MAX_IMPLEMENTATION_DAYS in
// app/models/business_excellence.py. Duplicated deliberately: this script must
// be runnable without the Python environment, and the two thresholds are the
// kind of number an admin changes once a year, not per deploy. If you change
// one, change both — the model is the source of truth.
const MAX_INVESTMENT = 5000;
const MAX_IMPLEMENTATION_DAYS = 1;

type Row = {
  id: string;
  kaizenNo: string | null;
  plantId: string;
  siteName: string | null;
  title: string;
  status: string;
  lane: string;
  investmentCost: number | null;
  currency: string;
  targetDate: Date | null;
  createdAt: Date;
  createdById: string;
  creatorName: string | null;
};

function implementationDays(r: Row): number | null {
  if (!r.targetDate) return null;
  const ms = new Date(r.targetDate).getTime() - new Date(r.createdAt).getTime();
  return Math.round(ms / 86_400_000);
}

// The reasons a badge is NOT earned. Empty list == earned. Kept as a list rather
// than a boolean so the report tells an admin what to fix, not just that
// something is wrong.
function blockers(r: Row): string[] {
  const out: string[] = [];
  if (r.investmentCost === null || r.investmentCost === undefined) {
    out.push("no investment figure recorded");
  } else if (r.investmentCost > MAX_INVESTMENT) {
    out.push(`investment ${r.investmentCost} exceeds ${MAX_INVESTMENT}`);
  }
  const days = implementationDays(r);
  if (days === null) {
    out.push("no target date, so implementation time is unknown");
  } else if (days > MAX_IMPLEMENTATION_DAYS) {
    out.push(`implementation window ${days}d exceeds ${MAX_IMPLEMENTATION_DAYS}d`);
  }
  return out;
}

async function main() {
  const csv = process.argv.includes("--csv");

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT k."id", k."kaizenNo", k."plantId", k."siteName", k."title", k."status",
            k."lane", k."investmentCost", k."currency", k."targetDate", k."createdAt",
            k."createdById", u."name" AS "creatorName"
       FROM "BeKaizen" k
       LEFT JOIN "User" u ON u."id" = k."createdById"
      WHERE k."lane" = 'FAST_TRACK' AND k."isDeleted" = false
      ORDER BY k."plantId", k."createdAt" DESC`
  );

  if (csv) {
    console.log(
      "kaizenNo,plant,title,status,investment,currency,implementationDays,badgeEarned,blockers"
    );
    for (const r of rows) {
      const b = blockers(r);
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      console.log(
        [
          cell(r.kaizenNo),
          cell(r.siteName),
          cell(r.title),
          cell(r.status),
          cell(r.investmentCost),
          cell(r.currency),
          cell(implementationDays(r)),
          cell(b.length === 0),
          cell(b.join("; ")),
        ].join(",")
      );
    }
    return;
  }

  console.log("Fast-track badge review — records on the FAST_TRACK lane\n");
  console.log(
    `Thresholds: investment <= ${MAX_INVESTMENT}, implementation <= ` +
      `${MAX_IMPLEMENTATION_DAYS} day(s). Both figures must be PRESENT — a missing\n` +
      `investment is not a zero investment.\n`
  );

  if (rows.length === 0) {
    console.log("  No live records on the FAST_TRACK lane. Nothing to review.");
    return;
  }

  const earned: Row[] = [];
  const unearned: Row[] = [];
  for (const r of rows) (blockers(r).length === 0 ? earned : unearned).push(r);

  console.log(`  ${rows.length} record(s) on the fast lane.`);
  console.log(`  ${earned.length} keep the badge, ${unearned.length} lose it.\n`);

  if (unearned.length) {
    console.log("── Badge no longer displayed — needs an admin to supply the data ──\n");
    for (const r of unearned) {
      console.log(`  ${r.kaizenNo ?? "(unnumbered)"}  ${r.title}`);
      console.log(`     plant     ${r.siteName ?? r.plantId}`);
      console.log(`     status    ${r.status}`);
      console.log(`     raised by ${r.creatorName ?? r.createdById}`);
      for (const b of blockers(r)) console.log(`     ✗ ${b}`);
      console.log(
        `     → still routed through the fast-lane workflow; only the badge changed.`
      );
      console.log("");
    }
  }

  if (earned.length) {
    console.log("── Badge retained (data supports it) ──\n");
    for (const r of earned) {
      console.log(
        `  ${r.kaizenNo ?? "(unnumbered)"}  ${r.title}  ` +
          `— ${r.currency} ${r.investmentCost}, ${implementationDays(r)}d`
      );
    }
    console.log("");
  }

  console.log(
    "No rows were modified by this script. To restore a badge, record the " +
      "investment\nand target date on the record itself."
  );
}

main()
  .catch((e) => {
    console.error("Report failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
