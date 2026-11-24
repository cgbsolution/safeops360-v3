// Unit tests for the control-center formatters. Node's built-in runner via tsx:
//   npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  briefParts,
  complianceBand,
  defaultZone,
  filterQuery,
  fmtAgo,
  fmtDelta,
  fmtDuration,
  fmtPct,
  pctInWindow,
  typeInfo,
  restoreLine,
  sortExceptions,
} from "./ops";

test("zero-baseline delta renders an em dash, never −100%", () => {
  assert.equal(fmtDelta(null), "—");
  assert.equal(fmtDelta(undefined), "—");
  assert.equal(fmtDelta(3), "+3");
  assert.equal(fmtDelta(-4), "−4");
  assert.equal(fmtDelta(0), "±0");
});

test("durations", () => {
  assert.equal(fmtDuration(45), "45 m");
  assert.equal(fmtDuration(125), "2h 05m");
  assert.equal(fmtDuration(120), "2h");
  assert.equal(fmtDuration(60 * 50), "2d 2h");
  assert.equal(fmtDuration(null), "");
});

test("relative time", () => {
  const now = new Date("2026-11-23T16:14:00Z");
  assert.equal(fmtAgo(new Date("2026-11-23T16:13:48Z"), now), "12s ago");
  assert.equal(fmtAgo("2026-11-23T16:04:00Z", now), "10 min ago");
});

test("compliance bands and n/a", () => {
  assert.equal(complianceBand(95), "ok");
  assert.equal(complianceBand(80), "warn");
  assert.equal(complianceBand(60), "crit");
  assert.equal(complianceBand(null), "na");
  assert.equal(fmtPct(null), "n/a");
  assert.equal(fmtPct(88.6), "89%");
});

test("restore line", () => {
  assert.equal(restoreLine({ status: "on_track", minutesToRestore: 200 }), "On track");
  assert.equal(restoreLine({ status: "due_soon", minutesToRestore: 35 }), "Due in 35 m");
  assert.equal(restoreLine({ status: "overdue", minutesToRestore: -50 }), "Overdue 50 m");
});

test("brief risk highlighting", () => {
  assert.deepEqual(briefParts("12 active. [[SIMOPS at dock]]. Bottleneck."), [
    { text: "12 active. ", risk: false },
    { text: "SIMOPS at dock", risk: true },
    { text: ". Bottleneck.", risk: false },
  ]);
  assert.deepEqual(briefParts("plain"), [{ text: "plain", risk: false }]);
});

test("exceptions sort critical → low, then by age", () => {
  const out = sortExceptions([
    { id: "a", severity: "low" as const, since: "2026-11-23T10:00:00Z" },
    { id: "b", severity: "critical" as const, since: "2026-11-23T12:00:00Z" },
    { id: "c", severity: "critical" as const, since: "2026-11-23T09:00:00Z" },
    { id: "d", severity: "high" as const, since: null },
  ]);
  assert.deepEqual(out.map((x) => x.id), ["c", "b", "d", "a"]);
});

test("default zone prefers the first impaired zone", () => {
  assert.equal(defaultZone([{ id: "a", impairmentCodes: [] }, { id: "b", impairmentCodes: ["SZ-03"] }]), "b");
  assert.equal(defaultZone([{ id: "a", impairmentCodes: [] }]), "a");
  assert.equal(defaultZone([]), null);
});

test("window position and filter query", () => {
  assert.equal(pctInWindow("2026-11-23T12:00:00Z", "2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z"), 50);
  assert.equal(pctInWindow("2026-11-25T00:00:00Z", "2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z"), 100);
  assert.equal(filterQuery({ plant: "p1", range: "today" }), "?plant=p1");
  assert.equal(filterQuery({ plant: "p1", area: "z", shift: "B", range: "shift" }), "?plant=p1&area=z&shift=B&range=shift");
});

test("typeInfo never throws on a missing or unknown type (crashed the timeline legend)", () => {
  assert.equal(typeInfo(undefined).color, "#94A3B8");
  assert.equal(typeInfo(null).label, "other");
  assert.equal(typeInfo("NEW_TYPE").label, "new type");
  assert.equal(typeInfo("HOT_WORK").glyph, "H");
});
