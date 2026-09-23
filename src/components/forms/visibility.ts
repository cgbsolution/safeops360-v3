// Client-side mirror of the server's `visible_if` evaluation.
//
// ⚠ THE SERVER IS THE AUTHORITY. app/services/form_engine/validation.py
// re-evaluates every condition on write and refuses to store a hidden field or
// require one. This copy exists ONLY so the form can hide and show fields as
// the user types without a round trip. If the two ever disagree the server
// wins, and the disagreement is a bug in this file — the mirror is what has to
// change, never the server.
//
// The operator set and the blank rule are kept deliberately identical to
// `_rule_holds` / `_condition_holds` so they cannot drift silently:
//   - "blank" means null, undefined, "" or []
//   - a comparison against a non-numeric value is false, never an error
//   - an empty rule list means visible

import type { Condition, FormField, FormSchema } from "./types";

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function ruleHolds(rule: Extract<Condition, { field: string }>, values: Record<string, unknown>): boolean {
  const actual = values[rule.field];
  const expected = rule.value;

  switch (rule.operator) {
    case "empty":
      return isBlank(actual);
    case "not_empty":
      return !isBlank(actual);
    case "=":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "in":
    case "not_in": {
      const items = Array.isArray(expected)
        ? expected
        : String(expected ?? "")
            .split(",")
            .map((s) => s.trim());
      const hit = items.includes(actual as never);
      return rule.operator === "in" ? hit : !hit;
    }
    default: {
      const a = Number(actual);
      const e = Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(e)) return false;
      if (rule.operator === ">") return a > e;
      if (rule.operator === "<") return a < e;
      if (rule.operator === ">=") return a >= e;
      if (rule.operator === "<=") return a <= e;
      return false;
    }
  }
}

export function conditionHolds(cond: Condition | undefined, values: Record<string, unknown>): boolean {
  if (!cond) return true;
  if ("rules" in cond) {
    const results = (cond.rules ?? []).map((r) => conditionHolds(r, values));
    if (results.length === 0) return true;
    return cond.combinator === "OR" ? results.some(Boolean) : results.every(Boolean);
  }
  return ruleHolds(cond, values);
}

/**
 * Keys of every currently-visible field.
 *
 * A field inside a hidden section is itself hidden — otherwise hiding a section
 * would leave its children required, which is never what the author meant.
 * Same rule as the server's visible_fields().
 */
export function visibleFieldKeys(
  schema: FormSchema | null | undefined,
  values: Record<string, unknown>
): Set<string> {
  const visible = new Set<string>();
  const walk = (items: FormField[] | undefined, parentShown: boolean) => {
    for (const f of items ?? []) {
      if (!f?.key) continue;
      const shown = parentShown && conditionHolds(f.visible_if, values);
      if (shown) visible.add(f.key);
      if (f.type === "section") walk(f.fields, shown);
    }
  };
  walk(schema ?? [], true);
  return visible;
}

/**
 * Seed values for a NEW record from each field's configured `default`.
 *
 * Defaults are applied here, in the UI layer, and deliberately not by the
 * server. A default is a pre-filled input — an affordance for the person typing
 * — not a rule about what gets stored: whatever the user leaves in the box is
 * what the client sends, so the server has nothing left to inject. Applying
 * them server-side as well would mean a field the user deliberately CLEARED
 * came back populated on save, which is the opposite of what a default means.
 *
 * Call once when opening a blank form; never on an existing record, or a
 * cleared field would be re-filled on every render.
 */
export function initialValues(schema: FormSchema | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (items?: FormField[]) => {
    for (const f of items ?? []) {
      if (f.type === "section") {
        walk(f.fields);
        continue;
      }
      // A calculated field's value comes from the server; a default on one
      // would be overwritten on first save and is not offered in the Builder.
      if (f.type === "calculated") continue;
      if (f.default !== undefined && f.default !== null) out[f.key] = f.default;
    }
  };
  walk(schema ?? []);
  return out;
}

/** Required visible fields that are still blank. Mirrors the server's
 *  required_but_missing() so the submit button's enabled state matches what
 *  submitting would actually do. */
export function missingRequired(
  schema: FormSchema | null | undefined,
  values: Record<string, unknown>
): string[] {
  const shown = visibleFieldKeys(schema, values);
  const out: string[] = [];
  const walk = (items?: FormField[]) => {
    for (const f of items ?? []) {
      if (f.type === "section") {
        walk(f.fields);
        continue;
      }
      if (f.type === "calculated") continue;
      if (f.required && shown.has(f.key) && isBlank(values[f.key])) out.push(f.key);
    }
  };
  walk(schema ?? []);
  return out;
}
