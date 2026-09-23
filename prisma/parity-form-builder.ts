// Part B §4 — Builder ⇄ hand-authored config parity proof.
//
// Replays the exact authoring gestures the Form Designer performs (drop a field
// from the palette, edit its settings, build a visibility rule) using the SAME
// pure functions the UI calls, then asserts the schema produced is deep-equal to
// the hand-authored fixture in prisma/fixtures/parity-energy-form.json.
//
// This is the concrete form of §0's rule. "The Builder is a UI over the config
// model" is otherwise an aspiration; here it is an assertion that fails loudly
// the moment the Designer starts emitting a shape a human would not write —
// a redundant condition wrapper, a stray default, an option list in a different
// order. Behaviourally-identical-but-differently-shaped config is exactly the
// drift that makes "authored in the Builder" and "authored by hand" two systems
// instead of one.
//
// Runs offline against pure modules — no database, no server, no browser:
//   npm run test:form-parity
//
// It deliberately does NOT go through the HTTP endpoints. Those are the same
// endpoints for both paths, so a round-trip through them would prove nothing;
// the risk being tested lives entirely in the client-side schema construction.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";

import type { FormField, FormSchema } from "../src/components/forms/types";
import { insertAt, makeField, setAt, type Path } from "../src/components/forms/builder/schema-ops";
import { fromEditable, type Clause } from "../src/components/forms/builder/condition-ops";

// ── the hand-authored side ──────────────────────────────────────────────────
const fixturePath = join(__dirname, "fixtures", "parity-energy-form.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  schemaJson: FormSchema;
};
const handAuthored = fixture.schemaJson;

// ── the Builder side ────────────────────────────────────────────────────────
//
// Each block below is one thing an author does on the canvas. `drop` is the
// palette drag; `configure` is the inspector panel writing a property back.

let schema: FormSchema = [];

function drop(type: string, at: Path): Path {
  schema = insertAt(schema, at, makeField(type, schema));
  return at;
}

function configure(path: Path, patch: Partial<FormField>) {
  const current = schema;
  const existing = pathGet(current, path);
  if (!existing) throw new Error(`No field at ${path.join(".")}`);
  schema = setAt(current, path, { ...existing, ...patch });
}

function pathGet(s: FormSchema, path: Path): FormField | undefined {
  let list: FormField[] | undefined = s;
  let node: FormField | undefined;
  for (const i of path) {
    if (!list) return undefined;
    node = list[i];
    list = node?.type === "section" ? (node.fields ?? []) : undefined;
  }
  return node;
}

// 1. Reporting period — a required text field.
drop("text", [0]);
configure([0], { key: "reporting_period", label: "Reporting period", required: true });

// 2. Energy sources — a repeatable table with a dropdown and a measurement.
drop("table", [1]);
configure([1], {
  key: "sources",
  label: "Energy sources",
  columns: [
    {
      key: "source_type",
      type: "select",
      label: "Source",
      required: true,
      options: [
        { value: "GRID", label: "Grid electricity" },
        { value: "DIESEL", label: "Diesel" },
        { value: "SOLAR", label: "Solar" }
      ]
    },
    { key: "quantity_gj", type: "decimal", label: "Quantity", required: true, unit: "GJ" }
  ]
});

// 3. Production output — the intensity denominator.
drop("decimal", [2]);
configure([2], { key: "production_output", label: "Production output", required: true });

// 4. Renewable toggle.
drop("boolean", [3]);
configure([3], { key: "has_renewable", label: "Any renewable source this period?" });

// 5. Certificate number — revealed only when the toggle is Yes. Built through
//    the rule builder's own normalisation, so a redundant group wrapper here
//    would fail the comparison.
drop("text", [4]);
configure([4], {
  key: "renewable_certificate_no",
  label: "Renewable certificate no.",
  required: true,
  visible_if: fromEditable("AND", [
    { field: "has_renewable", operator: "=", value: true } as Clause
  ])
});

// 6 & 7. Two calculated fields, the second reading the first.
drop("calculated", [5]);
configure([5], {
  key: "total_energy_gj",
  label: "Total energy (GJ)",
  formula: "SUM(sources.quantity_gj)"
});

drop("calculated", [6]);
configure([6], {
  key: "energy_intensity",
  label: "Energy intensity",
  formula: "ROUND(total_energy_gj / production_output, 3)"
});

// ── compare ─────────────────────────────────────────────────────────────────
//
// Normalising drops keys whose value is `undefined` before comparing. That is
// not a loophole: `JSON.stringify` omits them too, so an undefined-valued key
// is absent from the bytes that reach `FormDefinition.schemaJson`. Comparing
// the post-serialisation shape is comparing what is actually stored.
function normalise<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function diff(a: unknown, b: unknown, path = ""): string[] {
  const out: string[] = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path || "root"}: length ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      out.push(...diff((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k));
    }
    return out;
  }
  if (a !== b) out.push(`${path || "root"}: ${inspect(a)} (builder) vs ${inspect(b)} (hand-authored)`);
  return out;
}

const builderOutput = normalise(schema);
const expected = normalise(handAuthored);
const differences = diff(builderOutput, expected);

if (differences.length > 0) {
  console.error("❌  Builder output does NOT match the hand-authored config.\n");
  for (const d of differences) console.error(`    ${d}`);
  console.error(
    "\n    The Builder must produce the same configuration a human would write." +
      "\n    Fix the Designer (or the fixture, if the hand-authored shape was wrong) — " +
      "\n    do NOT relax this comparison."
  );
  process.exit(1);
}

// A second, cheaper property worth pinning: field ORDER is the canvas order.
// A Builder that reordered on save would still deep-equal a fixture written in
// its own order, so assert the order independently against the sequence the
// gestures above created.
const order = builderOutput.map((f) => f.key);
const expectedOrder = [
  "reporting_period",
  "sources",
  "production_output",
  "has_renewable",
  "renewable_certificate_no",
  "total_energy_gj",
  "energy_intensity"
];
if (order.join(",") !== expectedOrder.join(",")) {
  console.error(`❌  Field order drifted: ${order.join(", ")}`);
  process.exit(1);
}

console.log("✅  Form Designer parity: Builder-authored schema is byte-identical to hand-authored config.");
console.log(`    ${builderOutput.length} fields compared, including a table, a conditional and 2 calculations.`);
console.log(`    Fixture: prisma/fixtures/parity-energy-form.json`);
console.log("    The same fixture is asserted against the engine's publish gate by");
console.log("    tests/test_form_engine.py — so this schema is proven both authored-identically");
console.log("    and executable.");
