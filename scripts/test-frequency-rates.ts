// ────────────────────────────────────────────────────────────────────────
// Frequency rates — regression suite.
//
//   npm run test:frequency-rates
//
// Part 1 is pure and always runs. Its golden vectors are byte-for-byte the ones
// asserted by the backend's tests/test_frequency_rates.py: the platform has one
// definition of LTIFR expressed in two languages, and this is what keeps them
// from drifting. Change one, change both, or this fails.
//
// Part 2 needs DATABASE_URL and runs the real KpiEngine against it, read-only. It
// pins the two defects that were live on production on 2026-08-19:
//
//   * Manhours Performance rendered `LTIFR 0.00 · World Class` for Meridian North
//     Works while its own Heinrich pyramid counted 3 LTIs. Two DRAFT
//     ManhoursSubmission rows with 0 hours — the only two rows in that table —
//     shadowed 1.76M hours of real monthly returns, and because the plant filter
//     only applies when a plantId is set they zeroed the estate-wide denominator
//     too.
//   * A plant with genuinely no manhours (the Meridian Apparel sites) has to
//     render an explicit unavailable state, matching what the EHS Scorecard says
//     about the same period — never a number.
//
// The suite exits non-zero on any failure, so it is CI-shaped.
// ────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import {
  BASE_OSHA,
  BASE_PER_MILLION,
  FATALITY_DAYS_CHARGED,
  NO_INJURIES,
  RATE_BASES,
  dartRate,
  fsi,
  ifr,
  ltifr,
  pct,
  rate,
  severityRate,
  sumCounts,
  trifr,
  trir,
  type InjuryCounts
} from "../src/lib/manhours/frequency-rates";
import { KpiEngine, type KpiPeriod } from "../src/lib/manhours/kpi-engine";
import { KPI_REGISTRY } from "../src/lib/manhours/kpi-registry";

let failures = 0;
let checks = 0;

function ok(cond: boolean, what: string, detail = "") {
  checks++;
  if (cond) {
    console.log(`  PASS  ${what}`);
  } else {
    failures++;
    console.log(`  FAIL  ${what}${detail ? "  — " + detail : ""}`);
  }
}

function eq(actual: unknown, expected: unknown, what: string) {
  ok(actual === expected, what, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function close(actual: number | null, expected: number, what: string, tol = 5e-4) {
  ok(
    actual != null && Math.abs(actual - expected) < tol,
    what,
    `got ${JSON.stringify(actual)}, expected ~${expected}`
  );
}

const counts = (p: Partial<InjuryCounts>): InjuryCounts => ({ ...NO_INJURIES, ...p });

// Production ground truth, rolling 12 months to 2026-09-01.
const NW_LTI_12M = 3;
const NW_HOURS_12M = 1_763_320;

// ── Part 1: the shared definition ──────────────────────────────────────────

function part1() {
  console.log("\n── Rule 1: a missing denominator is null, never 0 ──");
  for (const hours of [0, null] as (number | null)[]) {
    const c = counts({ lti: 3, mtc: 2, rwc: 1, firstAid: 4, lostDays: 16 });
    eq(ltifr(c, hours), null, `ltifr with ${hours} hours is null`);
    eq(trifr(c, hours), null, `trifr with ${hours} hours is null`);
    eq(trir(c, hours), null, `trir with ${hours} hours is null`);
    eq(ifr(c, hours), null, `ifr with ${hours} hours is null`);
    eq(dartRate(c, hours), null, `dartRate with ${hours} hours is null`);
    eq(severityRate(c, hours), null, `severityRate with ${hours} hours is null`);
    eq(rate(3, hours, BASE_PER_MILLION), null, `rate() with ${hours} hours is null`);
  }
  eq(ltifr(counts({ lti: 5, fatalities: 1 }), null), null, "injuries with no exposure are not 0.00");
  eq(ltifr(counts({ lti: 0 }), 193_640), 0, "a genuine zero-injury month is still 0.00");
  eq(ltifr(counts({ lti: 1 }), -100), null, "negative exposure is treated as missing");
  eq(pct(0, 0), null, "0 of 0 is not 0%");
  eq(pct(7, 10), 70, "7 of 10 is 70%");
  eq(pct(0, 10), 0, "0 of 10 really is 0%");

  console.log("\n── Rule 2: the base belongs to the rate ──");
  eq(BASE_PER_MILLION, 1_000_000, "IS 3786 base is 1,000,000");
  eq(BASE_OSHA, 200_000, "OSHA base is 200,000");
  for (const k of ["ltifr", "trifr", "ifr", "severityRate"] as const) {
    eq(RATE_BASES[k], 1_000_000, `${k} is per million hours`);
  }
  for (const k of ["trir", "dartRate"] as const) {
    eq(RATE_BASES[k], 200_000, `${k} is per 200,000 hours`);
  }
  const c4 = counts({ lti: 4 });
  eq(ltifr(c4, 1_000_000), 4, "LTIFR 4 LTIs per 1M hours = 4.00");
  eq(trir(c4, 1_000_000), 0.8, "TRIR same count on the OSHA base = 0.80");
  close(ltifr(c4, 1_000_000), (trir(c4, 1_000_000) as number) * 5, "LTIFR:TRIR is exactly 5:1 for one count");
  // The five-fold understatement scorecard/payload.py used to publish.
  close(rate(1, 200_200, BASE_OSHA), 0.999, "the old 200k-base LTIFR reproduced the stored column");
  close(ltifr(counts({ lti: 1 }), 200_200), 4.995, "the correct per-million LTIFR is 5x that");

  console.log("\n── Rule 3: never average rates ──");
  const months: [number, number][] = [[1, 40_000], [0, 200_000], [0, 200_000]];
  const combined = ltifr(
    sumCounts(months.map(([lti]) => counts({ lti }))),
    months.reduce((s, [, h]) => s + h, 0)
  );
  const averaged =
    months.map(([lti, h]) => ltifr(counts({ lti }), h) as number).reduce((a, b) => a + b, 0) / 3;
  close(combined, 2.2727, "summed numerators over summed exposure = 2.27");
  close(averaged, 8.3333, "averaging the three monthly rates gives 8.33 instead");
  ok(combined !== averaged, "the two are not the same number, which is the point");

  console.log("\n── Numerators ──");
  eq(ltifr(counts({ lti: 2, fatalities: 1 }), 1_000_000), 3, "a fatality is a lost-time injury");
  eq(trifr(counts({ lti: 1, mtc: 1, rwc: 1 }), 1_000_000), 3, "recordable excludes first aid");
  eq(ifr(counts({ lti: 1, mtc: 1, rwc: 1, firstAid: 5 }), 1_000_000), 8, "IFR includes first aid");
  eq(dartRate(counts({ lti: 1, rwc: 1, fatalities: 1, mtc: 9 }), 200_000), 3, "DART excludes MTC");
  eq(FATALITY_DAYS_CHARGED, 6_000, "IS 3786 charges 6,000 days per fatality");
  eq(severityRate(counts({ fatalities: 1 }), 1_000_000), 6000, "one fatality = 6,000 severity");
  eq(severityRate(counts({ lostDays: 16 }), 1_000_000), 16, "16 days lost per million hours = 16");

  console.log("\n── Derived index ──");
  eq(fsi(null, 12), null, "FSI propagates a missing LTIFR");
  eq(fsi(1.7, null), null, "FSI propagates a missing severity rate");
  close(fsi(2, 500), Math.sqrt(1), "FSI matches the IS 3786 formula");

  console.log("\n── The reported defect ──");
  close(
    ltifr(counts({ lti: NW_LTI_12M }), NW_HOURS_12M),
    1.7013,
    "NW rolling-12 LTIFR is 1.70, not 0.00"
  );
  const nw = ltifr(counts({ lti: NW_LTI_12M }), NW_HOURS_12M) as number;
  const b = KPI_REGISTRY.LTIFR.benchmarks!;
  ok(nw > b.worldClass, "1.70 no longer bands as WORLD_CLASS", `worldClass floor is ${b.worldClass}`);
  ok(nw <= b.excellent, "and lands in EXCELLENT on the real numbers");

  console.log("\n── The invariant ──");
  for (const hours of [0, null, 1, 1_000, NW_HOURS_12M, 30_215_000] as (number | null)[]) {
    for (const [name, fn] of [
      ["ltifr", ltifr],
      ["trifr", trifr],
      ["trir", trir]
    ] as const) {
      const out = fn(counts({ lti: 3 }), hours);
      ok(
        out === null || out > 0,
        `${name} with 3 LTIs and ${hours} hours is null or positive, never 0`,
        `got ${JSON.stringify(out)}`
      );
    }
  }

  console.log("\n── Band ladder agrees with the threshold names ──");
  // Inspection Compliance: 98 / 95 / 85 / 70, higher is better. 70.0% must band
  // POOR, because `average` (85) is the floor of AVERAGE. The gauge in
  // kpi-gauge.tsx now derives its arcs from these same three boundaries.
  const ic = KPI_REGISTRY.INSPECTION_COMPLIANCE.benchmarks!;
  eq(ic.average, 85, "INSPECTION_COMPLIANCE average floor is 85");
  ok(70 < ic.average, "70.0% is below the AVERAGE floor, so POOR is correct by design");
  ok(ic.poor < ic.average, "and `poor` sits below it as the score-interpolation floor");
}

// ── Part 2: the real engine against the real database ──────────────────────

async function part2(prisma: PrismaClient) {
  const period: KpiPeriod = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    isRolling12: true
  };
  const engine = new KpiEngine(prisma);
  const RATE_CODES = ["LTIFR", "TRIFR", "TRIR", "IFR", "DART_RATE", "SEVERITY_RATE"] as const;

  console.log("\n── A plant WITH submitted manhours renders a real rate ──");
  const nw = await prisma.plant.findFirst({ where: { code: "NW" }, select: { id: true } });
  if (!nw) {
    console.log("  SKIP  no plant with code NW in this database");
  } else {
    const r = await engine.computeKpi("LTIFR", { plantId: nw.id }, period);
    ok(r.value !== 0, "NW LTIFR is not the old false 0.00", `got ${r.value}`);
    ok(r.value != null, "NW LTIFR is computable — it has 1.76M hours of returns", r.unavailableReason ?? "");
    ok(r.band !== "WORLD_CLASS", "NW LTIFR no longer wears a WORLD_CLASS badge", `band ${r.band}`);
    ok(r.denominator > 0, "the denominator is the real exposure", `${r.denominator} hours`);
    ok(
      r.audit.manhoursReturnIds.length > 0,
      "and it came from the canonical Manhours returns",
      `${r.audit.manhoursReturnIds.length} return(s)`
    );
    // The DRAFT submissions that used to shadow it must not appear.
    const draftIds = (
      await prisma.manhoursSubmission.findMany({
        where: { plantId: nw.id, status: { not: "LOCKED" } },
        select: { id: true }
      })
    ).map((x) => x.id);
    ok(
      draftIds.every((id) => !r.audit.manhoursSubmissionIds.includes(id)),
      "no DRAFT submission contributed to the denominator",
      `${draftIds.length} draft(s) on this plant`
    );
  }

  console.log("\n── Estate-wide is not zeroed by one plant's draft rows ──");
  const estate = await engine.computeKpi("LTIFR", {}, period);
  ok(estate.value !== 0, "company-wide LTIFR is not the old false 0.00", `got ${estate.value}`);
  ok(estate.value != null, "company-wide LTIFR is computable", estate.unavailableReason ?? "");

  console.log("\n── A plant with NO manhours renders unavailable, never a number ──");
  const plants = await prisma.plant.findMany({ select: { id: true, code: true } });
  let checkedUnmeasured = 0;
  for (const p of plants) {
    const returns = await prisma.manhours.count({ where: { plantId: p.id } });
    const locked = await prisma.manhoursSubmission.count({
      where: { plantId: p.id, status: "LOCKED" }
    });
    if (returns > 0 || locked > 0) continue;
    checkedUnmeasured++;
    for (const code of RATE_CODES) {
      const r = await engine.computeKpi(code, { plantId: p.id }, period);
      ok(r.value === null, `${p.code} ${code} is unavailable, not a number`, `got ${r.value}`);
      ok(r.band === null, `${p.code} ${code} carries no performance band`, `got ${r.band}`);
      ok(
        (r.unavailableReason ?? "").length > 0,
        `${p.code} ${code} says why it cannot be computed`
      );
      ok(
        !/^[\d.]+$/.test(r.formattedValue),
        `${p.code} ${code} does not render a numeric string`,
        r.formattedValue
      );
    }
    if (checkedUnmeasured >= 2) break; // two is enough to prove the rule
  }
  if (checkedUnmeasured === 0) {
    console.log("  SKIP  every plant in this database has manhours — nothing to check");
  }

  console.log("\n── FSI does not launder a missing input into a zero ──");
  if (checkedUnmeasured > 0) {
    const bare = plants.find(async (p) => (await prisma.manhours.count({ where: { plantId: p.id } })) === 0);
    if (bare) {
      const f = await engine.computeKpi("FSI", { plantId: bare.id }, period);
      ok(f.value === null || f.value > 0, "FSI is null or positive, never a false 0", `got ${f.value}`);
    }
  }
}

async function main() {
  console.log("Frequency rates — regression suite");
  part1();

  if (!process.env.DATABASE_URL) {
    console.log("\n(DATABASE_URL not set — skipping the live-engine checks)");
  } else {
    const prisma = new PrismaClient();
    try {
      await part2(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
