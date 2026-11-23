// DDL applier for QR-code fire equipment inspections (JSL Hisar: "QR code-based
// inspections: digital inspection mechanism for fire extinguishers, hydrant
// points, detection system, etc.").
//
//   FireChecklistTemplate  versioned checklist per equipment type (items JSONB)
//   FireInspection         one completed inspection of one asset
//   FireInspectionItem     per-item answers (PASS / FAIL / NA, remarks, photo path)
//   FireEquipmentEvent     asset status log (out of service, defective, returned…)
//
// Four NEW tables plus seed rows for the twelve default checklists. No ALTERs on
// existing tables. Additive and idempotent: CREATE … IF NOT EXISTS, and the seed
// is INSERT … ON CONFLICT DO NOTHING, so an admin's edited checklist (a newer
// version) is never overwritten by a re-run.
//
// ORDER: run this BEFORE deploying the backend that carries the new
// app/models/fire_safety.py classes. /api/fire/dashboard and the IMS/MIS
// dashboard (app/services/ims.py counts FireInspection) query these tables, so
// without them those two screens return 500.
// Requires apply-firesafety-ddl.ts to have run first (FireEquipment is referenced).
// Then run prisma/apply-fire-inspection-permissions.ts (FIRE.READ / INSPECT / MANAGE).
//
//   npx tsx prisma/apply-fire-inspection-ddl.ts     (or: npm run db:apply-fire-inspection)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "FireChecklistTemplate" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
    "equipmentType" TEXT NOT NULL, "name" TEXT NOT NULL, "standardRef" TEXT, "description" TEXT,
    "frequencyDays" INTEGER, "items" JSONB NOT NULL DEFAULT '[]'::jsonb, "isActive" BOOLEAN NOT NULL DEFAULT true,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedBy" TEXT,
    CONSTRAINT "FireChecklistTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FireChecklistTemplate_version_chk" CHECK ("version" >= 1),
    CONSTRAINT "FireChecklistTemplate_freq_chk" CHECK ("frequencyDays" IS NULL OR "frequencyDays" BETWEEN 1 AND 730),
    CONSTRAINT "FireChecklistTemplate_items_chk" CHECK (jsonb_typeof("items") = 'array'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_FireChecklistTemplate_code_version" ON "FireChecklistTemplate" ("code","version")`,
  // One current checklist per equipment type. The API retires version n before
  // inserting n+1, inside one transaction.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_FireChecklistTemplate_active_type" ON "FireChecklistTemplate" ("equipmentType") WHERE "isActive" AND NOT "isDeleted"`,
  `CREATE INDEX IF NOT EXISTS "ix_FireChecklistTemplate_type_active" ON "FireChecklistTemplate" ("equipmentType","isActive")`,
  `CREATE INDEX IF NOT EXISTS "ix_FireChecklistTemplate_isDeleted" ON "FireChecklistTemplate" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "FireInspection" (
    "id" TEXT NOT NULL, "inspectionNo" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL REFERENCES "FireEquipment"("id"), "equipmentCode" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL, "location" TEXT, "plantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL REFERENCES "FireChecklistTemplate"("id"), "templateCode" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL, "inspectorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3) NOT NULL, "result" TEXT NOT NULL,
    "passCount" INTEGER NOT NULL DEFAULT 0, "failCount" INTEGER NOT NULL DEFAULT 0, "naCount" INTEGER NOT NULL DEFAULT 0,
    "criticalFailCount" INTEGER NOT NULL DEFAULT 0, "remarks" TEXT,
    "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, "gpsAccuracyM" DOUBLE PRECISION,
    "scanned" BOOLEAN NOT NULL DEFAULT false, "equipmentStatusBefore" TEXT, "equipmentStatusAfter" TEXT,
    "nextDueDate" TIMESTAMP(3), "capaId" TEXT, "capaNumber" TEXT, "followUpNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FireInspection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FireInspection_result_chk" CHECK ("result" IN ('PASS','FAIL')),
    CONSTRAINT "FireInspection_counts_chk" CHECK ("passCount" >= 0 AND "failCount" >= 0 AND "naCount" >= 0
      AND "criticalFailCount" >= 0 AND "criticalFailCount" <= "failCount"),
    CONSTRAINT "FireInspection_gps_chk" CHECK (("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
      AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FireInspection_inspectionNo_key" ON "FireInspection" ("inspectionNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_FireInspection_equipment_completed" ON "FireInspection" ("equipmentId","completedAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_FireInspection_plant_completed" ON "FireInspection" ("plantId","completedAt")`,

  `CREATE TABLE IF NOT EXISTS "FireInspectionItem" (
    "id" TEXT NOT NULL, "inspectionId" TEXT NOT NULL REFERENCES "FireInspection"("id"),
    "sortOrder" INTEGER NOT NULL, "itemKey" TEXT NOT NULL, "itemText" TEXT NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false, "response" TEXT NOT NULL, "remarks" TEXT, "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FireInspectionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FireInspectionItem_response_chk" CHECK ("response" IN ('PASS','FAIL','NA')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_FireInspectionItem_inspection_key" ON "FireInspectionItem" ("inspectionId","itemKey")`,
  `CREATE INDEX IF NOT EXISTS "ix_FireInspectionItem_inspection" ON "FireInspectionItem" ("inspectionId")`,

  `CREATE TABLE IF NOT EXISTS "FireEquipmentEvent" (
    "id" TEXT NOT NULL, "equipmentId" TEXT NOT NULL REFERENCES "FireEquipment"("id"), "plantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT, "note" TEXT, "inspectionId" TEXT, "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FireEquipmentEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FireEquipmentEvent_type_chk" CHECK ("eventType" IN
      ('CREATED','UPDATED','OUT_OF_SERVICE','MARKED_DEFECTIVE','RETURNED_TO_SERVICE','DEFECT_CLEARED')))`,
  `CREATE INDEX IF NOT EXISTS "ix_FireEquipmentEvent_equipment" ON "FireEquipmentEvent" ("equipmentId","createdAt")`,
];

// ── default checklists (version 1) ───────────────────────────────────────────
// critical: true → a FAIL marks the asset DEFECTIVE and raises a CAPA.
type Item = { key: string; text: string; critical: boolean; guidance?: string };
type Tpl = { code: string; equipmentType: string; name: string; standardRef: string; frequencyDays: number; description: string; items: Item[] };

const c = (key: string, text: string, guidance?: string): Item => ({ key, text, critical: true, ...(guidance ? { guidance } : {}) });
const n = (key: string, text: string, guidance?: string): Item => ({ key, text, critical: false, ...(guidance ? { guidance } : {}) });

const TEMPLATES: Tpl[] = [
  {
    code: "FIRE_EXTINGUISHER", equipmentType: "FIRE_EXTINGUISHER", name: "Fire extinguisher monthly check",
    standardRef: "IS 2190:2010", frequencyDays: 30,
    description: "Monthly visual inspection of portable fire extinguishers (water, foam, DCP/ABC, CO2, clean agent).",
    items: [
      c("accessible", "Extinguisher in its designated place, accessible and unobstructed"),
      n("mounting", "Mounted on its bracket or stand at the correct height"),
      n("signage", "Location signage and operating instructions visible and legible"),
      c("pin_seal", "Safety pin in place and tamper seal intact"),
      c("pressure_gauge", "Pressure gauge needle in the green (operable) zone", "CO2 and cartridge types have no gauge: mark NA and check the weight item."),
      c("physical_damage", "No physical damage, dents, corrosion or leakage on the cylinder"),
      c("hose_nozzle", "Discharge hose / horn and nozzle intact, not cracked or blocked", "Mark NA for small units with no hose."),
      c("weight_charge", "Weight / charge within limits", "CO2 and cartridge types: weigh; a loss of more than 10% of charge needs a refill."),
      c("refill_date", "Refill / recharge date valid as per the service tag"),
      c("hydro_test", "Hydraulic pressure test date valid as per the service tag"),
      n("service_tag", "Maintenance tag attached and up to date"),
    ],
  },
  {
    code: "HYDRANT", equipmentType: "HYDRANT", name: "Hydrant point & hose box check",
    standardRef: "IS 13039:2014", frequencyDays: 30,
    description: "Monthly check of external / internal hydrant landing valves and their hose boxes.",
    items: [
      c("accessible", "Hydrant and hose box accessible, not obstructed or used for storage"),
      c("valve_operable", "Landing / hydrant valve opens and closes freely"),
      c("no_leak", "No leakage from the valve, gland or flanges"),
      c("water_pressure", "Water available at adequate pressure on test opening", "Read the nearest header pressure gauge if a test opening is not allowed."),
      c("hose_present", "Hose length(s) present in the hose box, dry and undamaged"),
      c("branch_pipe", "Branch pipe and nozzle present"),
      c("coupling", "Instantaneous couplings and washers in good condition"),
      n("cabinet", "Hose box intact; door opens; glass / key in place"),
      n("cap_chain", "Valve blank cap and chain in place"),
      n("signage", "Hydrant number and signage visible; painted fire red"),
    ],
  },
  {
    code: "HOSE_REEL", equipmentType: "HOSE_REEL", name: "First-aid hose reel check",
    standardRef: "IS 884", frequencyDays: 30,
    description: "Monthly check of first-aid hose reels.",
    items: [
      c("accessible", "Hose reel accessible and unobstructed"),
      c("isolation_valve", "Isolation valve open (or sealed open) and operates freely"),
      c("no_leak", "No leakage at the valve, swivel or hose connections"),
      c("hose_condition", "Hose free from cracks and kinks, and fully wound on the drum"),
      c("nozzle", "Nozzle present and its shut-off works"),
      n("drum_rotation", "Drum rotates and swings out freely"),
      n("signage", "Signage visible"),
    ],
  },
  {
    code: "SMOKE_DETECTOR", equipmentType: "SMOKE_DETECTOR", name: "Smoke detector check",
    standardRef: "IS 2189:2008", frequencyDays: 90,
    description: "Quarterly check of point smoke detectors (optical / ionisation / multi-sensor).",
    items: [
      c("head_present", "Detector head present, clean, not painted or covered"),
      c("indicator", "Indicator LED healthy (no fault indication)"),
      c("functional_test", "Smoke tester raises an alarm at the panel for the correct zone"),
      n("clearance", "No obstruction within 0.5 m of the detector"),
      n("dust_cover", "Dust cover removed after any construction / painting work"),
      n("base_wiring", "Base firmly fixed; no loose wiring"),
    ],
  },
  {
    code: "HEAT_DETECTOR", equipmentType: "HEAT_DETECTOR", name: "Heat detector check",
    standardRef: "IS 2189:2008", frequencyDays: 90,
    description: "Quarterly check of fixed-temperature and rate-of-rise heat detectors.",
    items: [
      c("head_present", "Detector head present, clean, not painted or covered"),
      c("indicator", "Indicator LED healthy (no fault indication)"),
      c("functional_test", "Heat tester raises an alarm at the panel for the correct zone"),
      n("clearance", "No obstruction around the detector"),
      n("base_wiring", "Base firmly fixed; no loose wiring"),
    ],
  },
  {
    code: "MANUAL_CALL_POINT", equipmentType: "MANUAL_CALL_POINT", name: "Manual call point check",
    standardRef: "IS 2189:2008", frequencyDays: 90,
    description: "Quarterly check of break-glass / resettable manual call points.",
    items: [
      c("accessible", "Call point accessible and unobstructed"),
      c("element_intact", "Frangible glass / resettable element intact"),
      c("functional_test", "Test key raises an alarm at the panel and the point resets"),
      n("signage", "Signage visible"),
      n("damage", "No physical damage to the housing"),
    ],
  },
  {
    code: "FIRE_ALARM_PANEL", equipmentType: "FIRE_ALARM_PANEL", name: "Fire alarm panel check",
    standardRef: "IS 2189:2008", frequencyDays: 30,
    description: "Monthly check of the fire alarm control panel and its power supplies.",
    items: [
      c("mains_power", "Mains power ON with normal indication"),
      c("battery", "Standby battery healthy (no battery or charger fault)"),
      c("no_faults", "No fault, disablement or isolation indications (or each one logged with a reason)"),
      c("sounder_test", "Sounders / hooters operate on test"),
      n("lamp_test", "Lamp / display test passes"),
      n("zone_chart", "Zone chart displayed and current"),
      n("event_log", "Event log reviewed and the log book up to date"),
    ],
  },
  {
    code: "SPRINKLER", equipmentType: "SPRINKLER", name: "Sprinkler installation check",
    standardRef: "IS 15105:2002", frequencyDays: 90,
    description: "Quarterly check of a sprinkler installation valve set and its heads.",
    items: [
      c("control_valve", "Main installation control valve open and locked / strapped"),
      c("pressure_gauges", "Pressure gauges above and below the alarm valve within normal range"),
      c("alarm_test", "Water motor gong / flow switch alarm operates on the test drain"),
      c("heads_condition", "Sprinkler heads free from paint, damage, corrosion and loading"),
      c("clearance", "At least 500 mm clear below the sprinkler deflectors"),
      n("spares", "Spare heads and spanner available in the cabinet"),
      n("no_leak", "No leaks on visible pipework"),
    ],
  },
  {
    code: "FIRE_PUMP", equipmentType: "FIRE_PUMP", name: "Fire pump house weekly check",
    standardRef: "IS 12469 / NBC 2016 Part 4", frequencyDays: 7,
    description: "Weekly check and run test of the fire pump set (main electric, diesel and jockey).",
    items: [
      c("auto_mode", "Pump controllers in AUTO mode"),
      c("jockey", "Jockey pump maintains header pressure"),
      c("main_start", "Main pump starts automatically on pressure drop (run test)"),
      c("diesel_start", "Diesel pump starts; fuel tank at least three-quarters full; batteries charged", "Mark NA with a reason if the station has no diesel pump."),
      c("run_pressure", "Delivery pressure during the run within the rated range"),
      c("valves_open", "Suction and delivery valves fully open"),
      n("noise_vibration", "No abnormal noise, vibration or gland leakage"),
      n("housekeeping", "Pump house clean and the run log updated"),
    ],
  },
  {
    code: "FIRE_DOOR", equipmentType: "FIRE_DOOR", name: "Fire door check",
    standardRef: "IS 3614 / NBC 2016 Part 4", frequencyDays: 30,
    description: "Monthly check of fire-check doors on escape routes and compartment walls.",
    items: [
      c("self_closing", "Door self-closes fully and latches from any open position"),
      c("not_wedged", "Not wedged, propped open or obstructed"),
      c("seals", "Intumescent / smoke seals intact"),
      c("escape_hardware", "Panic bar / escape hardware operates freely"),
      n("leaf_frame", "Leaf, frame, vision panel and hinges undamaged"),
      n("signage", "'Fire door, keep shut' signage in place"),
    ],
  },
  {
    code: "EMERGENCY_LIGHT", equipmentType: "EMERGENCY_LIGHT", name: "Emergency light check",
    standardRef: "NBC 2016 Part 4 / IS/IEC 60598-2-22", frequencyDays: 30,
    description: "Monthly function test of emergency and exit lighting.",
    items: [
      c("charging", "Charging indicator ON"),
      c("function_test", "Lamp lights on simulated mains failure"),
      c("exit_sign", "Exit sign legible and lit (combined units)", "Mark NA with a reason for non-exit luminaires."),
      n("duration", "Annual full-duration test recorded within the last 12 months"),
      n("lens", "Lens / diffuser clean and undamaged"),
    ],
  },
  {
    code: "GAS_SUPPRESSION", equipmentType: "GAS_SUPPRESSION", name: "Gas suppression system check",
    standardRef: "NFPA 2001 / OEM manual", frequencyDays: 90,
    description: "Quarterly check of clean-agent / CO2 total flooding systems (control rooms, panel rooms).",
    items: [
      c("cylinder_pressure", "Agent cylinder pressure within the gauge green zone"),
      c("actuator", "Actuator connected and system in AUTO (any manual isolation logged)"),
      c("panel_healthy", "Release control panel healthy, no faults"),
      c("manual_release", "Manual release and abort stations accessible and unobstructed"),
      c("room_integrity", "Room openings and cable penetrations sealed; doors close"),
      n("nozzles", "Discharge nozzles unobstructed"),
      n("signage", "Warning signage at every entry"),
    ],
  },
];

async function main() {
  console.log("Applying fire inspection DDL…\n");
  const fe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'FireEquipment'`
  );
  if (Number(fe[0].n) === 0) {
    throw new Error("FireEquipment table is missing: run prisma/apply-firesafety-ddl.ts first.");
  }
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  console.log("\nSeeding default checklists (version 1, skipped where present)…");
  for (const t of TEMPLATES) {
    const inserted = await prisma.$executeRawUnsafe(
      `INSERT INTO "FireChecklistTemplate"
         ("id","code","version","equipmentType","name","standardRef","description","frequencyDays","items","isActive","createdBy","updatedBy")
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true,'SYSTEM','SYSTEM')
       ON CONFLICT DO NOTHING`,
      `fct_${t.code.toLowerCase()}_v1`, t.code, t.equipmentType, t.name, t.standardRef, t.description,
      t.frequencyDays, JSON.stringify(t.items),
    );
    const crit = t.items.filter((i) => i.critical).length;
    console.log(`  ${inserted ? "✓ added  " : "· present"} ${t.code} (${t.items.length} items, ${crit} critical)`);
  }

  // Verify rather than trust: IF NOT EXISTS / ON CONFLICT report success either way.
  console.log("\nVerifying…");
  for (const t of ["FireChecklistTemplate", "FireInspection", "FireInspectionItem", "FireEquipmentEvent"]) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${t}"`);
    console.log(`  ${t}: ${r[0].c} rows`);
  }
  const active = await prisma.$queryRawUnsafe<{ equipmentType: string; version: number; name: string }[]>(
    `SELECT "equipmentType", "version", "name" FROM "FireChecklistTemplate" WHERE "isActive" AND NOT "isDeleted" ORDER BY 1`
  );
  console.log(`  current checklists: ${active.map((a) => `${a.equipmentType} v${a.version}`).join(", ")}`);
  const missing = TEMPLATES.map((t) => t.equipmentType).filter((t) => !active.some((a) => a.equipmentType === t));
  if (missing.length) console.warn(`  ⚠ no current checklist for: ${missing.join(", ")}`);

  // A failed critical item raises a CAPA with source INSPECTION_FINDING. Without
  // it the inspection still saves, but no CAPA is created.
  const src = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "CapaSourceType" WHERE "code" = 'INSPECTION_FINDING'`
  ).catch(() => [{ n: BigInt(0) }]);
  if (Number(src[0].n) === 0) {
    console.warn("  ⚠ CapaSourceType INSPECTION_FINDING not seeded: critical failures will not raise CAPAs (run seed-capa-masters.ts).");
  }
  console.log("\n✅  Fire inspection tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
