// LOTO demo seed — procedure library + lockout records, wired to real PTW permits.
//
//   npx tsx prisma/seed-loto.ts          (or: npm run db:seed-loto)
//
// Everything is built from REAL reference data read out of the target DB —
// actual Plant, Area, Equipment, User and Permit rows. Nothing is invented, so
// every screen resolves names rather than rendering a raw cuid.
//
// IDEMPOTENT AND NARROWLY SCOPED. It owns exactly the rows it creates, keyed by
// `LOTO-EQ-` procedure codes and `LOTO-EX-` execution numbers, and on re-run it
// removes only those before rebuilding. It never touches a row it did not
// create. The one thing it writes outside its own tables is
// `Permit.lotoExecutionId` on the permits it links — and it clears those first,
// so a re-run cannot leave a permit pointing at a deleted execution.
//
// What the seed deliberately covers, so the module can be exercised end to end:
//   • multi-item bodies (2-4 energy sources, 3-6 ordered isolation points,
//     hardware, 3-5 ordered verification steps) — not placeholder singletons
//   • version history with real supersession (v1 → v2 → v3, old rows retained)
//   • a procedure whose live version is AHEAD of its published one, so the QR
//     "field sees an older approved version" path is visible
//   • an OVERDUE review with a pending LotoReviewLog, so the register's overdue
//     banner/filter/row-highlight actually light up
//   • a group lockout stopped mid-confirmation (2 of 3 locks on) — the single
//     most important screen state, and the one a count-only UI would hide
//   • executions in every status, including an aborted one with a reason
//   • closed lockouts linked to real closed ELECTRICAL_LOTO permits

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const PLANT_CODE = "NW";
const YEAR = 2026;

// ─── helpers ────────────────────────────────────────────────────────────────

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const daysAhead = (n: number) => new Date(Date.now() + n * 864e5);

/** Mirror of `body_snapshot()` in app/services/loto.py. The execution reads this
 *  frozen copy, never the live procedure, so the shape must match exactly or the
 *  execution console renders nothing. */
function bodySnapshot(proc: any, es: any[], ip: any[], hw: any[], vs: any[]) {
  return {
    header: {
      procedureCode: proc.procedureCode,
      title: proc.title,
      description: proc.description,
      equipmentId: proc.equipmentId,
      equipmentName: proc.equipmentName,
      equipmentTag: proc.equipmentTag,
      siteId: proc.siteId,
      siteName: proc.siteName,
      area: proc.area,
      version: proc.version,
    },
    energySources: es
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((e) => ({
        id: e.id, sequence: e.sequence, energyType: e.energyType,
        magnitude: e.magnitude, locationDescription: e.locationDescription,
      })),
    isolationPoints: ip
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((p) => ({
        id: p.id, sequence: p.sequence, energySourceId: p.energySourceId,
        location: p.location, isolationMethod: p.isolationMethod,
        lockType: p.lockType, verificationMethod: p.verificationMethod, notes: p.notes,
      })),
    hardware: hw.map((h) => ({
      id: h.id, itemType: h.itemType, description: h.description,
      quantityRequired: h.quantityRequired,
    })),
    verificationSteps: vs
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        id: s.id, sequence: s.sequence, stepText: s.stepText,
        requiresPhoto: s.requiresPhoto, requiresSignoff: s.requiresSignoff,
      })),
  } as Prisma.InputJsonValue;
}

/** URL-safe, unguessable — same shape as secrets.token_urlsafe(24) server-side. */
function qrToken(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  for (let i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// ─── the procedure library ──────────────────────────────────────────────────
// Bodies written against the actual equipment on this site (a garment plant:
// boiler house, compressor house, cooling tower, MCC, crane, DG set, dosing).

type Body = {
  code: string;
  equipmentKey: string;      // Equipment.code to resolve
  title: string;
  description: string;
  area: string;
  status: "active" | "draft" | "under_review" | "retired";
  liveVersion: number;       // LotoProcedure.version
  publishedVersion: number | null; // which version the field sees (null = never published)
  reviewMonths: number;
  reviewDueInDays: number | null;  // negative = overdue
  energy: { type: string; magnitude: string; where: string }[];
  points: { location: string; method: string; lock: string; verify: string; sourceIdx: number }[];
  hardware: { item: string; desc: string; qty: number }[];
  steps: { text: string; photo: boolean; signoff: boolean }[];
};

const LIBRARY: Body[] = [
  {
    code: "LOTO-EQ-0001",
    equipmentKey: "EQ-NW-DEMO-04",
    title: "Process Boiler BLR-01 — full isolation for internal inspection",
    description:
      "Covers full de-energisation of the 15 bar process boiler for internal inspection, tube cleaning or burner work. Steam header must be isolated at BOTH the main stop and the bypass — the bypass has been found passing.",
    area: "Boiler House",
    status: "active",
    liveVersion: 2,
    publishedVersion: 2,
    reviewMonths: 12,
    reviewDueInDays: 244,
    energy: [
      { type: "thermal", magnitude: "15 bar saturated steam, ~200 °C", where: "Boiler shell and steam header" },
      { type: "electrical", magnitude: "415 V AC 3-ph, 63 A", where: "MCC-BLR feeder 04" },
      { type: "chemical", magnitude: "Dosing line — oxygen scavenger", where: "Chemical dosing skid" },
      { type: "gravity", magnitude: "Residual condensate, approx 400 L", where: "Bottom drum" },
    ],
    points: [
      { location: "MCC-BLR Panel, Feeder 04 — main breaker", method: "breaker", lock: "Red padlock + hasp", verify: "Try-start from local panel; confirm no burner ignition and control panel dead", sourceIdx: 1 },
      { location: "Steam header main stop valve SV-101", method: "valve", lock: "Chain + valve lockout", verify: "Confirm downstream gauge falls to 0 bar and holds for 60 s", sourceIdx: 0 },
      { location: "Steam header BYPASS valve SV-101B", method: "valve", lock: "Chain + valve lockout", verify: "Crack the drain and confirm no steam passing — the bypass has previously been found passing", sourceIdx: 0 },
      { location: "Chemical dosing line isolation valve DS-04", method: "valve", lock: "Valve lockout", verify: "Confirm dosing pump stopped and line depressurised", sourceIdx: 2 },
      { location: "Bottom blowdown drain BD-01", method: "valve", lock: "Open and lock in OPEN position", verify: "Drain runs clear then stops — drum empty", sourceIdx: 3 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 5 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 5 },
      { item: "hasp", desc: "6-hole scissor hasp", qty: 2 },
      { item: "chain", desc: "1.5 m valve chain", qty: 2 },
      { item: "lockbox", desc: "Group lock box — key retention", qty: 1 },
    ],
    steps: [
      { text: "Confirm boiler has been off-line and cooling for a minimum of 12 hours before any isolation begins.", photo: false, signoff: true },
      { text: "Attempt start from the local panel. Confirm no burner ignition, no fan rotation, control panel dead.", photo: false, signoff: true },
      { text: "Confirm steam header pressure gauge reads 0 bar and holds for 60 seconds.", photo: true, signoff: true },
      { text: "Crack the bypass drain. Confirm NO steam passing past SV-101B.", photo: true, signoff: true },
      { text: "Confirm bottom drum is fully drained and the blowdown valve is locked OPEN.", photo: true, signoff: true },
      { text: "Confirm shell temperature below 40 °C by contact thermometer before entry.", photo: false, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0002",
    equipmentKey: "EQ-NW-DEMO-05",
    title: "Compressed Air Receiver AR-101 — isolation and depressurisation",
    description:
      "Isolation of the 10 bar air receiver for relief-valve testing, internal inspection or drain repair. Stored pneumatic energy is the principal hazard — the receiver holds pressure long after the compressor stops.",
    area: "Compressor House",
    status: "active",
    liveVersion: 1,
    publishedVersion: 1,
    reviewMonths: 12,
    // OVERDUE — drives the register's overdue banner, filter and row highlight.
    reviewDueInDays: -37,
    energy: [
      { type: "pneumatic", magnitude: "10 bar compressed air, 2000 L receiver", where: "Receiver shell AR-101" },
      { type: "electrical", magnitude: "415 V AC 3-ph — compressor motor", where: "Compressor House MCC, feeder 02" },
    ],
    points: [
      { location: "Compressor MCC feeder 02 — isolator", method: "breaker", lock: "Red padlock + hasp", verify: "Try-start at local stop/start; confirm motor does not run", sourceIdx: 1 },
      { location: "Receiver inlet valve AR-101-IN", method: "valve", lock: "Valve lockout + chain", verify: "Confirm valve fully closed and locked", sourceIdx: 0 },
      { location: "Receiver outlet / ring main valve AR-101-OUT", method: "valve", lock: "Valve lockout + chain", verify: "Confirm ring main cannot back-feed the receiver", sourceIdx: 0 },
      { location: "Manual vent valve AR-101-V", method: "valve", lock: "Open and lock in OPEN position", verify: "Vent audible then silent; receiver gauge reads 0 bar and holds 60 s", sourceIdx: 0 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 4 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 4 },
      { item: "hasp", desc: "6-hole scissor hasp", qty: 1 },
      { item: "chain", desc: "1 m valve chain", qty: 2 },
    ],
    steps: [
      { text: "Attempt start at the compressor local stop/start. Confirm the motor does not run.", photo: false, signoff: true },
      { text: "Open the manual vent and confirm the receiver gauge falls to 0 bar and HOLDS for 60 seconds.", photo: true, signoff: true },
      { text: "Confirm the vent valve is locked in the OPEN position and remains open for the duration of the work.", photo: true, signoff: true },
      { text: "Confirm the ring main isolation cannot back-feed — check the downstream gauge.", photo: false, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0003",
    equipmentKey: "EQ-NW-DEMO-08",
    title: "Cooling Tower CT-01 — fan and circulation isolation",
    description:
      "Isolation for fan gearbox maintenance, fill replacement or basin cleaning. The fan windmills freely in a through-draught and must be physically restrained, not merely de-energised.",
    area: "Process Area A — Primary Production",
    status: "active",
    liveVersion: 1,
    publishedVersion: 1,
    reviewMonths: 12,
    reviewDueInDays: 21,
    energy: [
      { type: "electrical", magnitude: "415 V AC 3-ph — fan motor 11 kW", where: "CT MCC feeder 01" },
      { type: "mechanical", magnitude: "Free-windmilling fan, 2.4 m blade", where: "Fan deck" },
      { type: "gravity", magnitude: "Basin water, approx 6 000 L", where: "Tower basin" },
    ],
    points: [
      { location: "CT MCC feeder 01 — fan motor isolator", method: "breaker", lock: "Red padlock + hasp", verify: "Try-start from local panel; confirm no rotation", sourceIdx: 0 },
      { location: "Fan shaft — mechanical restraint", method: "blocking", lock: "Locking pin + chain", verify: "Attempt to rotate the fan by hand; confirm it is held", sourceIdx: 1 },
      { location: "Circulation pump isolator CP-01", method: "breaker", lock: "Red padlock", verify: "Confirm no flow to the distribution deck", sourceIdx: 0 },
      { location: "Basin drain valve BD-CT", method: "valve", lock: "Open and lock OPEN", verify: "Basin drained to below the working level", sourceIdx: 2 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 4 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 4 },
      { item: "chain", desc: "Fan restraint chain", qty: 1 },
    ],
    steps: [
      { text: "Try-start the fan from the local panel. Confirm no rotation.", photo: false, signoff: true },
      { text: "Fit the fan locking pin and chain. Attempt to rotate the fan by hand and confirm it is held.", photo: true, signoff: true },
      { text: "Confirm circulation pump is isolated and there is no flow onto the distribution deck.", photo: false, signoff: true },
      { text: "Confirm the basin is drained below working level before entry.", photo: true, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0004",
    equipmentKey: "EQ-NW-DEMO-10",
    title: "MCC Panel Block A — electrical isolation for panel work",
    description:
      "Isolation of the Block A motor control centre for busbar work, breaker replacement or thermographic follow-up. Capacitor banks retain a lethal charge after the incomer is opened.",
    area: "Process Area A — Primary Production",
    status: "active",
    liveVersion: 3,
    publishedVersion: 3,
    reviewMonths: 12,
    reviewDueInDays: 96,
    energy: [
      { type: "electrical", magnitude: "415 V AC 3-ph, 400 A incomer", where: "MCC Block A incomer" },
      { type: "electrical", magnitude: "Capacitor bank — stored charge", where: "PF correction section" },
      { type: "electrical", magnitude: "110 V AC control supply (separate feed)", where: "Control transformer" },
    ],
    points: [
      { location: "MCC Block A main incomer breaker", method: "breaker", lock: "Red padlock + multi-hasp", verify: "Voltage test all three phases + neutral, prove dead with a proving unit", sourceIdx: 0 },
      { location: "Upstream substation feeder — Block A", method: "disconnect", lock: "Red padlock", verify: "Confirm the feeder is racked out and tagged at the substation", sourceIdx: 0 },
      { location: "Control supply MCB — 110 V", method: "breaker", lock: "MCB lockout clip", verify: "Confirm control circuits dead — separate feed, commonly missed", sourceIdx: 2 },
      { location: "PF capacitor bank — discharge", method: "blocking", lock: "Earth stick applied and left in place", verify: "Wait 5 minutes, then apply the earth stick and confirm zero volts", sourceIdx: 1 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 4 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 4 },
      { item: "hasp", desc: "6-hole scissor hasp", qty: 2 },
      { item: "lockbox", desc: "Group lock box", qty: 1 },
    ],
    steps: [
      { text: "Confirm the main incomer is open and locked.", photo: true, signoff: true },
      { text: "Prove the voltage tester on a known live source, test all three phases and neutral, then re-prove the tester.", photo: false, signoff: true },
      { text: "Wait a minimum of 5 minutes for capacitor discharge, then apply the earth stick and confirm zero volts.", photo: true, signoff: true },
      { text: "Confirm the 110 V control supply is separately isolated and dead.", photo: false, signoff: true },
      { text: "Leave the earth stick applied for the duration of the work.", photo: true, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0005",
    equipmentKey: "EQ-NW-DEMO-02",
    title: "Overhead Crane 5T Bay A — isolation for maintenance access",
    description:
      "Isolation for hoist brake, festoon or long-travel maintenance. Any suspended load must be landed before isolation — a load left on the hook is stored gravitational energy the brake alone is not a control for.",
    area: "Process Area A — Primary Production",
    status: "under_review",
    // Live body is v2, but the FIELD still sees v1 — a material edit is awaiting
    // re-approval. This is the state that proves the QR never serves an
    // unapproved isolation sequence.
    liveVersion: 2,
    publishedVersion: 1,
    reviewMonths: 12,
    reviewDueInDays: 150,
    energy: [
      { type: "electrical", magnitude: "415 V AC 3-ph — crane supply via DSL", where: "Bay A downshop conductors" },
      { type: "gravity", magnitude: "Suspended load, up to 5 000 kg", where: "Hook block" },
      { type: "mechanical", magnitude: "Long-travel momentum", where: "End carriages" },
    ],
    points: [
      { location: "Crane DSL isolator — Bay A wall box", method: "disconnect", lock: "Red padlock + hasp", verify: "Attempt all crane motions from the pendant; confirm none respond", sourceIdx: 0 },
      { location: "Hook block — land the load", method: "blocking", lock: "N/A — physical verification", verify: "Confirm the hook is empty and the load is landed and stable on the floor", sourceIdx: 1 },
      { location: "Long-travel rail stops — Bay A", method: "chain", lock: "Rail clamp + chain", verify: "Confirm the crane cannot travel from the maintenance position", sourceIdx: 2 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 3 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 3 },
      { item: "chain", desc: "Rail clamp chain", qty: 2 },
    ],
    steps: [
      { text: "Confirm the hook is empty and any load is landed and stable on the floor.", photo: true, signoff: true },
      { text: "Open the DSL isolator and lock it.", photo: true, signoff: true },
      { text: "Attempt every crane motion from the pendant — hoist, cross-travel, long-travel. Confirm none respond.", photo: false, signoff: true },
      { text: "Fit the rail clamps and confirm the crane cannot travel from the maintenance position.", photo: true, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0006",
    equipmentKey: "EQ-NW-DEMO-06",
    title: "DG Set 500 kVA — isolation for service",
    description:
      "DRAFT — being authored. Isolation of the emergency generator for oil change, filter service or alternator work. The auto-start signal must be defeated, or the set will crank while it is being worked on.",
    area: "Process Area A — Primary Production",
    status: "draft",
    liveVersion: 1,
    publishedVersion: null,   // never published → no QR token
    reviewMonths: 12,
    reviewDueInDays: null,
    energy: [
      { type: "electrical", magnitude: "415 V AC alternator output", where: "DG output breaker" },
      { type: "electrical", magnitude: "24 V DC starting battery", where: "Battery bank" },
      { type: "chemical", magnitude: "Diesel fuel — day tank 990 L", where: "Fuel day tank" },
      { type: "thermal", magnitude: "Exhaust and coolant, up to 90 °C", where: "Manifold / radiator" },
    ],
    points: [
      { location: "DG output breaker", method: "breaker", lock: "Red padlock + hasp", verify: "Confirm the breaker is open and locked", sourceIdx: 0 },
      { location: "Auto-start selector — set to OFF/MANUAL LOCKOUT", method: "blocking", lock: "Selector lockout cover", verify: "Simulate a mains-fail signal and confirm the set does NOT crank", sourceIdx: 0 },
      { location: "Starting battery — negative terminal", method: "disconnect", lock: "Terminal cover + lock", verify: "Confirm the starter cannot engage", sourceIdx: 1 },
      { location: "Fuel day tank isolation valve", method: "valve", lock: "Valve lockout", verify: "Confirm no fuel feed to the injection pump", sourceIdx: 2 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock, 38 mm shackle", qty: 4 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 4 },
    ],
    steps: [
      { text: "Set the auto-start selector to OFF and fit the lockout cover.", photo: true, signoff: true },
      { text: "Simulate a mains-fail signal and confirm the set does NOT crank.", photo: false, signoff: true },
      { text: "Disconnect and cover the battery negative terminal.", photo: true, signoff: true },
      { text: "Confirm engine coolant and exhaust temperatures are below 40 °C before work begins.", photo: false, signoff: true },
    ],
  },
  {
    code: "LOTO-EQ-0007",
    equipmentKey: "EQ-NW-DEMO-01",
    title: "Chlorine Dosing System — isolation (SUPERSEDED)",
    description:
      "RETIRED — the chlorine dosing skid was replaced by the hypochlorite system in 2026. Superseded by the new dosing procedure. Retained for audit history; do not use in the field.",
    area: "Process Area A — Primary Production",
    status: "retired",
    liveVersion: 1,
    publishedVersion: 1,
    reviewMonths: 12,
    reviewDueInDays: -400,     // long lapsed, but retired → must NOT flag overdue
    energy: [
      { type: "chemical", magnitude: "Chlorine gas, 68 kg cylinder", where: "Cylinder store" },
      { type: "electrical", magnitude: "240 V AC dosing pump", where: "Dosing skid panel" },
    ],
    points: [
      { location: "Chlorine cylinder valve", method: "valve", lock: "Cylinder valve cap + lock", verify: "Confirm the cylinder valve is closed and capped", sourceIdx: 0 },
      { location: "Dosing pump supply — 240 V", method: "breaker", lock: "MCB lockout clip", verify: "Try-start the dosing pump; confirm it does not run", sourceIdx: 1 },
      { location: "Injection line isolation valve", method: "valve", lock: "Valve lockout", verify: "Confirm the injection line is isolated and vented to scrubber", sourceIdx: 0 },
    ],
    hardware: [
      { item: "lock", desc: "Red padlock", qty: 3 },
      { item: "tag", desc: "DANGER — DO NOT OPERATE", qty: 3 },
    ],
    steps: [
      { text: "Confirm the cylinder valve is closed and the protective cap is fitted.", photo: true, signoff: true },
      { text: "Try-start the dosing pump. Confirm it does not run.", photo: false, signoff: true },
      { text: "Confirm the injection line is isolated and vented to the scrubber.", photo: true, signoff: true },
    ],
  },
];

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding LOTO — procedure library + lockout records\n");

  // ── resolve real reference data ──
  const plant = await prisma.plant.findFirst({ where: { code: PLANT_CODE } });
  if (!plant) throw new Error(`Plant ${PLANT_CODE} not found`);

  const equipment = await prisma.equipment.findMany({
    where: { plantId: plant.id },
    select: { id: true, code: true, name: true },
  });
  const eqByCode = new Map(equipment.map((e) => [e.code, e]));

  const users = await prisma.user.findMany({
    where: { plantId: plant.id },
    select: { id: true, name: true, role: true },
  });
  const byName = (n: string) => users.find((u) => u.name === n);
  const byRole = (r: string) => users.find((u) => u.role === r);

  // Named people so the roster reads like a real crew, with role fallbacks so
  // the seed still works on a tenant whose demo users differ.
  const maint    = byName("Tushar Mishra")   ?? byRole("MAINTENANCE_HEAD")!;
  const maint2   = byName("Sumit Iyer")      ?? byRole("MAINTENANCE_HEAD")!;
  const fitter   = byName("Rajesh Sharma")   ?? byRole("WORKER")!;
  const fitter2  = byName("Manoj Verma")     ?? byRole("WORKER")!;
  const contract = byName("Naveen Rao")      ?? byRole("CONTRACTOR_WORKMAN")!;
  const supervis = byName("Mohan Lal")       ?? byRole("SUPERVISOR")!;
  const safety   = byName("Deepak Tomar")    ?? byRole("SAFETY_OFFICER")!;
  const hse      = byName("Lalit Nair")      ?? byRole("HSE_MANAGER")!;   // the signed-in user
  const areas = await prisma.area.findMany({ where: { plantId: plant.id }, select: { id: true, name: true } });
  const areaId = (n: string) => areas.find((a) => a.name === n)?.id ?? null;

  console.log(`  site      : ${plant.name}`);
  console.log(`  equipment : ${equipment.length} rows available`);
  console.log(`  crew      : ${[maint, fitter, contract, supervis, safety, hse].map((u) => u?.name).join(", ")}\n`);

  // ── idempotency: remove ONLY rows this seed owns ──
  const mine = await prisma.lotoProcedure.findMany({
    where: { procedureCode: { startsWith: "LOTO-EQ-" }, siteId: plant.id },
    select: { id: true },
  });
  if (mine.length) {
    const ids = mine.map((m) => m.id);
    const execs = await prisma.lotoExecution.findMany({
      where: { procedureId: { in: ids } }, select: { id: true },
    });
    // Clear permit back-references FIRST so no permit is left pointing at a
    // row we are about to delete.
    if (execs.length) {
      const cleared = await prisma.permit.updateMany({
        where: { lotoExecutionId: { in: execs.map((e) => e.id) } },
        data: { lotoExecutionId: null },
      });
      console.log(`  re-run: unlinked ${cleared.count} permit(s)`);
    }
    await prisma.lotoProcedure.deleteMany({ where: { id: { in: ids } } }); // cascades children
    console.log(`  re-run: removed ${mine.length} previously-seeded procedure(s)\n`);
  }

  // ── build the library ──
  const created: Record<string, { proc: any; snapshot: any; versionId: string; steps: any[]; points: any[] }> = {};

  for (const b of LIBRARY) {
    const eq = eqByCode.get(b.equipmentKey);
    const proc = await prisma.lotoProcedure.create({
      data: {
        procedureCode: b.code,
        siteId: plant.id,
        siteName: plant.name,
        area: b.area,
        areaId: areaId(b.area),
        equipmentId: eq?.id ?? null,
        equipmentName: eq?.name ?? b.equipmentKey,
        equipmentTag: b.equipmentKey,
        title: b.title,
        description: b.description,
        status: b.status,
        version: b.liveVersion,
        reviewFrequencyMonths: b.reviewMonths,
        nextReviewDueAt: b.reviewDueInDays === null ? null : daysAhead(b.reviewDueInDays),
        lastReviewedAt: b.reviewDueInDays === null ? null : daysAgo(365 - Math.max(b.reviewDueInDays, -365)),
        lastReviewedById: b.reviewDueInDays === null ? null : safety?.id ?? null,
        qrCodeToken: b.publishedVersion === null ? null : qrToken(),
        createdById: maint?.id ?? null,
        updatedById: maint?.id ?? null,
        createdAt: daysAgo(300),
      },
    });

    const sources = [];
    for (let i = 0; i < b.energy.length; i++) {
      sources.push(await prisma.lotoEnergySource.create({
        data: {
          procedureId: proc.id, sequence: i + 1, energyType: b.energy[i].type,
          magnitude: b.energy[i].magnitude, locationDescription: b.energy[i].where,
        },
      }));
    }
    const points = [];
    for (let i = 0; i < b.points.length; i++) {
      const p = b.points[i];
      points.push(await prisma.lotoIsolationPoint.create({
        data: {
          procedureId: proc.id, sequence: i + 1,
          energySourceId: sources[p.sourceIdx]?.id ?? null,
          location: p.location, isolationMethod: p.method,
          lockType: p.lock, verificationMethod: p.verify,
        },
      }));
    }
    const hardware = [];
    for (const h of b.hardware) {
      hardware.push(await prisma.lotoHardwareRequirement.create({
        data: { procedureId: proc.id, itemType: h.item, description: h.desc, quantityRequired: h.qty },
      }));
    }
    const steps = [];
    for (let i = 0; i < b.steps.length; i++) {
      steps.push(await prisma.lotoVerificationStep.create({
        data: {
          procedureId: proc.id, sequence: i + 1, stepText: b.steps[i].text,
          requiresPhoto: b.steps[i].photo, requiresSignoff: b.steps[i].signoff,
        },
      }));
    }

    // Version history: one immutable row per version up to liveVersion. Only
    // `publishedVersion` is marked published; earlier ones are superseded but
    // RETAINED, which is the audit property the module exists to provide.
    const snapshot = bodySnapshot(proc, sources, points, hardware, steps);
    let publishedVersionId: string | null = null;
    for (let v = 1; v <= b.liveVersion; v++) {
      const isPub = v === b.publishedVersion;
      const row = await prisma.lotoProcedureVersion.create({
        data: {
          procedureId: proc.id,
          version: v,
          snapshotJson: snapshot,
          isPublished: isPub,
          publishedAt: isPub ? daysAgo(300 - v * 40) : null,
          publishedById: isPub ? (safety?.id ?? null) : null,
          supersededAt: b.publishedVersion !== null && v < b.publishedVersion ? daysAgo(300 - (v + 1) * 40) : null,
          changeType: v === 1 ? "MATERIAL" : "MATERIAL",
          changeSummary:
            v === 1 ? "Initial publication."
            : v === 2 ? "Added the bypass-valve isolation point after it was found passing during the annual walk-down."
            : "Added capacitor-bank discharge step and the separate 110 V control-supply isolation.",
          createdById: maint?.id ?? null,
          createdAt: daysAgo(300 - v * 40),
        },
      });
      if (isPub) publishedVersionId = row.id;
    }
    if (publishedVersionId) {
      await prisma.lotoProcedure.update({
        where: { id: proc.id }, data: { publishedVersionId },
      });
    }

    // An overdue active procedure gets the pending review row the daily scan
    // would have opened — so the register's overdue state is real, not implied.
    if (b.reviewDueInDays !== null && b.reviewDueInDays < 0 && b.status === "active") {
      await prisma.lotoReviewLog.create({
        data: {
          procedureId: proc.id, status: "pending",
          dueAt: daysAhead(b.reviewDueInDays), notifiedAt: daysAhead(b.reviewDueInDays + 1),
        },
      });
    }
    // A completed historical review on the well-maintained ones.
    if (b.status === "active" && (b.reviewDueInDays ?? 0) > 0) {
      await prisma.lotoReviewLog.create({
        data: {
          procedureId: proc.id, status: "completed",
          dueAt: daysAgo(365 - (b.reviewDueInDays ?? 0)),
          reviewedById: safety?.id ?? null, reviewedByName: safety?.name ?? null,
          reviewedAt: daysAgo(360 - (b.reviewDueInDays ?? 0)),
          outcome: "pass",
          notes: "Walked down against the plant. Isolation points and sequence confirmed accurate. No change required.",
        },
      });
    }

    created[b.code] = { proc, snapshot, versionId: publishedVersionId ?? "", steps, points };
    const flag = b.reviewDueInDays !== null && b.reviewDueInDays < 0 && b.status === "active" ? "  ⚠ REVIEW OVERDUE" : "";
    console.log(`  ✓ ${b.code}  ${b.status.padEnd(12)} v${b.liveVersion}${b.publishedVersion && b.publishedVersion !== b.liveVersion ? ` (field sees v${b.publishedVersion})` : ""}  ${b.energy.length} sources / ${b.points.length} points / ${b.steps.length} steps${flag}`);
  }

  console.log("");
  await seedExecutions(plant, created, { maint, maint2, fitter, fitter2, contract, supervis, safety, hse });
}

// ─── lockout records ────────────────────────────────────────────────────────

async function seedExecutions(plant: any, created: any, crew: any) {
  const { maint, maint2, fitter, fitter2, contract, supervis, safety, hse } = crew;

  // Real closed ELECTRICAL_LOTO permits to hang the historical lockouts off.
  const permits = await prisma.permit.findMany({
    where: { plantId: plant.id, isDeleted: false, type: "ELECTRICAL_LOTO", lotoExecutionId: null },
    select: { id: true, number: true }, take: 3, orderBy: { createdAt: "desc" },
  });

  let seq = 0;
  const nextNumber = () => `LOTO-EX-${YEAR}-${String(++seq).padStart(4, "0")}`;

  type P = { user: any; role: string; applied: boolean; removed: boolean; tag?: string };
  async function mk(
    codeKey: string, status: string, group: boolean, parts: P[],
    opts: { verifyAll?: boolean; startedDaysAgo: number; permitIdx?: number; closedBy?: any;
            abortReason?: string; closureNotes?: string } = { startedDaysAgo: 1 }
  ) {
    const c = created[codeKey];
    if (!c?.versionId) return null;
    const permit = opts.permitIdx !== undefined ? permits[opts.permitIdx] : undefined;

    const ex = await prisma.lotoExecution.create({
      data: {
        number: nextNumber(),
        procedureId: c.proc.id,
        procedureVersionId: c.versionId,
        procedureVersionSnapshot: c.snapshot,
        snapshotVersion: c.proc.version,
        ptwId: permit?.id ?? null,
        ptwNumber: permit?.number ?? null,
        siteId: plant.id,
        siteName: plant.name,
        initiatedById: parts[0].user.id,
        initiatedByName: parts[0].user.name,
        initiatedAt: daysAgo(opts.startedDaysAgo),
        isGroupLockout: group,
        status,
        workStartedAt: ["work_in_progress", "locks_removed", "closed"].includes(status) ? daysAgo(opts.startedDaysAgo) : null,
        locksRemovedAt: ["locks_removed", "closed"].includes(status) ? daysAgo(opts.startedDaysAgo - 0.2) : null,
        closedById: status === "closed" ? (opts.closedBy?.id ?? safety?.id) : null,
        closedAt: status === "closed" ? daysAgo(opts.startedDaysAgo - 0.3) : null,
        closureNotes: status === "closed" ? opts.closureNotes ?? "All locks accounted for. Equipment returned to service and handed back to operations." : null,
        abortedById: status === "aborted" ? (safety?.id ?? null) : null,
        abortedAt: status === "aborted" ? daysAgo(opts.startedDaysAgo - 0.4) : null,
        abortReason: status === "aborted" ? opts.abortReason ?? null : null,
        createdAt: daysAgo(opts.startedDaysAgo),
      },
    });

    for (const p of parts) {
      await prisma.lotoExecutionParticipant.create({
        data: {
          executionId: ex.id, userId: p.user.id, userName: p.user.name, userRole: p.user.role,
          participantRole: p.role,
          assignedIsolationPointIds: p.role === "affected_employee" ? [] : c.points.map((x: any) => x.id),
          lockTagNumber: p.tag ?? null,
          lockAppliedConfirmed: p.applied,
          lockAppliedAt: p.applied ? daysAgo(opts.startedDaysAgo) : null,
          lockRemovedConfirmed: p.removed,
          lockRemovedAt: p.removed ? daysAgo(opts.startedDaysAgo - 0.2) : null,
        },
      });
    }

    if (opts.verifyAll) {
      for (const s of c.steps) {
        await prisma.lotoVerificationRecord.create({
          data: {
            executionId: ex.id, stepId: s.id, sequence: s.sequence, stepText: s.stepText,
            completedById: parts[0].user.id, completedByName: parts[0].user.name,
            completedAt: daysAgo(opts.startedDaysAgo),
            signoff: true,
            photoUrl: s.requiresPhoto ? `loto/${ex.id}/step-${s.sequence}.jpg` : null,
            notes: null,
          },
        });
      }
    }

    if (permit) {
      await prisma.permit.update({ where: { id: permit.id }, data: { lotoExecutionId: ex.id } });
    }
    console.log(`  ✓ ${ex.number}  ${status.padEnd(17)} ${group ? "group" : "solo "}  ${parts.length} participant(s)${permit ? `  ↔ ${permit.number}` : ""}`);
    return ex;
  }

  console.log("Lockout records:");

  // 1. Closed group lockout on the boiler, linked to a real permit.
  await mk("LOTO-EQ-0001", "closed", true, [
    { user: maint,    role: "primary_authorized", applied: true, removed: true, tag: "LK-1042" },
    { user: fitter,   role: "secondary",          applied: true, removed: true, tag: "LK-1043" },
    { user: contract, role: "secondary",          applied: true, removed: true, tag: "LK-1044" },
    { user: supervis, role: "affected_employee",  applied: false, removed: false },
  ], { verifyAll: true, startedDaysAgo: 26, permitIdx: 0,
       closedBy: safety,
       closureNotes: "Internal inspection completed. Bypass valve SV-101B re-seated and proven tight. All four locks removed and accounted for; boiler returned to service." });

  // 2. Closed solo lockout on the MCC, linked to a real permit.
  await mk("LOTO-EQ-0004", "closed", false, [
    { user: maint2, role: "primary_authorized", applied: true, removed: true, tag: "LK-2011" },
  ], { verifyAll: true, startedDaysAgo: 12, permitIdx: 1,
       closureNotes: "Thermographic follow-up complete; loose termination on feeder 07 re-torqued. Earth stick removed, panel restored." });

  // 3. Work in progress — group, all locked, all verified.
  await mk("LOTO-EQ-0002", "work_in_progress", true, [
    { user: maint,  role: "primary_authorized", applied: true, removed: false, tag: "LK-3001" },
    { user: fitter, role: "secondary",          applied: true, removed: false, tag: "LK-3002" },
    { user: hse,    role: "secondary",          applied: true, removed: false, tag: "LK-3003" },
  ], { verifyAll: true, startedDaysAgo: 1 });

  // 4. THE KEY STATE — group lockout part-way through applying locks.
  //    2 of 3 confirmed; the third has not. An aggregate-count UI would hide
  //    exactly this, which is why the roster renders per person.
  await mk("LOTO-EQ-0003", "locks_applied", true, [
    { user: maint2,   role: "primary_authorized", applied: true,  removed: false, tag: "LK-4001" },
    { user: fitter2,  role: "secondary",          applied: true,  removed: false, tag: "LK-4002" },
    { user: contract, role: "secondary",          applied: false, removed: false },
    { user: supervis, role: "affected_employee",  applied: false, removed: false },
  ], { startedDaysAgo: 0.3 });

  // 5. Verified, work not yet started — signed-in user is on this one.
  await mk("LOTO-EQ-0004", "verified", true, [
    { user: hse,    role: "primary_authorized", applied: true, removed: false, tag: "LK-5001" },
    { user: fitter, role: "secondary",          applied: true, removed: false, tag: "LK-5002" },
  ], { verifyAll: true, startedDaysAgo: 0.5 });

  // 6. Aborted, with the reason on the record — the visible exception path.
  await mk("LOTO-EQ-0001", "aborted", true, [
    { user: maint,  role: "primary_authorized", applied: true, removed: true,  tag: "LK-6001" },
    { user: fitter, role: "secondary",          applied: true, removed: false, tag: "LK-6002" },
  ], { startedDaysAgo: 40,
       abortReason: "Lock LK-6002 cut off under HSE Manager authorisation — holder left site at end of shift without removing it and could not be contacted. Equipment re-inspected and proven safe before restoration. Raised as a behavioural observation against the holder." });

  // ── summary ──
  const [pc, ec, partc, vrc, rlc, linked] = await Promise.all([
    prisma.lotoProcedure.count(), prisma.lotoExecution.count(),
    prisma.lotoExecutionParticipant.count(), prisma.lotoVerificationRecord.count(),
    prisma.lotoReviewLog.count(),
    prisma.permit.count({ where: { lotoExecutionId: { not: null } } }),
  ]);
  console.log(`\n✅  Seeded: ${pc} procedures · ${ec} lockouts · ${partc} participants · ${vrc} verification records · ${rlc} review logs`);
  console.log(`    PTW: ${linked} permit(s) now show a linked lockout on their detail page.`);

  const tokens = await prisma.lotoProcedure.findMany({
    where: { qrCodeToken: { not: null }, status: "active" },
    select: { procedureCode: true, qrCodeToken: true }, take: 2,
  });
  if (tokens.length) {
    console.log(`\n    Public QR field view (no login required):`);
    tokens.forEach((t) => console.log(`      /lockout/${t.qrCodeToken}   → ${t.procedureCode}`));
  }
}

main()
  .catch((e) => { console.error("❌  Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
