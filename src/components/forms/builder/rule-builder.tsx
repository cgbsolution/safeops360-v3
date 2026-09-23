"use client";

// `visible_if` rule builder (Part B §2.2).
//
// Structured dropdowns, never a free-text expression box. Two reasons, and the
// second is the one that matters: an author typing an expression can invent
// syntax the engine's evaluator does not parse, and the Builder would then have
// emitted config the runtime silently ignores — a field that never hides. Every
// value this component can produce is drawn from the field list already on the
// canvas and from the operator set the SERVER reports at /api/forms/meta, so
// the output is parseable by construction.
//
// The shape it emits is exactly what validation.py's `_condition_holds` reads:
//   { field, operator, value }                  a single clause
//   { combinator: "AND"|"OR", rules: [ ... ] }  a group
// Nesting is supported by the engine but not offered here — no register in
// Parts C/D needs it, and §5 says let real requirements drive capability.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import type { Condition, ConditionOperator, FormField } from "../types";
import { OPTION_TYPES } from "../types";
import { Select, SelectItem } from "@/components/ui/select";

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  "=": "is",
  "!=": "is not",
  in: "is one of",
  not_in: "is not one of",
  ">": "is greater than",
  "<": "is less than",
  ">=": "is at least",
  "<=": "is at most",
  empty: "is empty",
  not_empty: "is not empty"
};

/** Operators that take no value — the input is hidden for these. */
const NO_VALUE: ConditionOperator[] = ["empty", "not_empty"];

// Normalisation lives in condition-ops.ts — pure, and asserted directly by the
// parity test that proves Builder output equals hand-authored config.
import { fromEditable, isGroup, toEditable, type Clause } from "./condition-ops";

export function RuleBuilder({
  value,
  onChange,
  available,
  operators
}: {
  value: Condition | undefined;
  onChange: (next: Condition | undefined) => void;
  /** Fields already on the canvas, excluding the one being edited. */
  available: FormField[];
  operators: ConditionOperator[];
}) {
  const { combinator, rules } = toEditable(value);

  const update = (next: Clause[], nextCombinator: "AND" | "OR" = combinator) =>
    onChange(fromEditable(nextCombinator, next));

  const nestedDropped = isGroup(value) && (value.rules ?? []).some(isGroup);

  if (available.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        Add another field first — a visibility rule has to reference one.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {nestedDropped ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          This rule contains a nested group authored outside the Builder. It is shown read-only and
          will be preserved only if you do not edit the rules below.
        </p>
      ) : null}

      {rules.map((rule, i) => {
        const field = available.find((f) => f.key === rule.field);
        const showValue = !NO_VALUE.includes(rule.operator);
        return (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-2">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {i === 0 ? "Show when" : combinator}
              </span>
              {i > 0 ? (
                <div className="flex overflow-hidden rounded border border-slate-200">
                  {(["AND", "OR"] as const).map((c) => (
                    <Button
                      variant="bare"
                      key={c}
                      type="button"
                      onClick={() => update(rules, c)}
                      className={cn(
                        "px-1.5 py-0.5 text-[10px] font-semibold",
                        combinator === c ? "bg-slate-700 text-white" : "bg-white text-slate-500"
                      )}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              ) : null}
              <Button
                variant="bare"
                type="button"
                aria-label="Remove rule"
                onClick={() => update(rules.filter((_, idx) => idx !== i))}
                className="ml-auto rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={13} />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <Select
                value={rule.field}
                onChange={(e) =>
                  update(rules.map((r, idx) => (idx === i ? { ...r, field: e.target.value } : r)))
                }
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                {available.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label || f.key}
                  </SelectItem>
                ))}
              </Select>

              <Select
                value={rule.operator}
                onChange={(e) =>
                  update(
                    rules.map((r, idx) =>
                      idx === i ? { ...r, operator: e.target.value as ConditionOperator } : r
                    )
                  )
                }
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>
                    {OPERATOR_LABELS[op] ?? op}
                  </SelectItem>
                ))}
              </Select>

              {showValue ? (
                <ValueInput
                  field={field}
                  operator={rule.operator}
                  value={rule.value}
                  onChange={(v) => update(rules.map((r, idx) => (idx === i ? { ...r, value: v } : r)))}
                />
              ) : (
                <div className="flex h-8 items-center text-xs text-slate-400">no value needed</div>
              )}
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          update([...rules, { field: available[0].key, operator: "=", value: "" } as Clause])
        }
      >
        <Plus size={13} className="mr-1" />
        {rules.length === 0 ? "Add a visibility rule" : "Add another condition"}
      </Button>

      {rules.length > 0 ? (
        <Button
          variant="bare"
          type="button"
          onClick={() => onChange(undefined)}
          className="block text-[11px] text-slate-500 underline hover:text-slate-700"
        >
          Always show this field
        </Button>
      ) : null}
    </div>
  );
}

/** The value control follows the REFERENCED field's type, so comparing against
 *  a dropdown offers that dropdown's options rather than a free-text box the
 *  author can typo into a rule that never fires. */
function ValueInput({
  field,
  operator,
  value,
  onChange
}: {
  field: FormField | undefined;
  operator: ConditionOperator;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const multi = operator === "in" || operator === "not_in";

  if (field && OPTION_TYPES.includes(field.type) && !multi) {
    return (
      <Select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
      >
        <SelectItem value="">— value —</SelectItem>
        {(field.options ?? []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label ?? o.value}
          </SelectItem>
        ))}
      </Select>
    );
  }

  if (field?.type === "boolean" && !multi) {
    return (
      <Select
        value={value === true ? "true" : value === false ? "false" : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "true")}
        className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
      >
        <SelectItem value="">— value —</SelectItem>
        <SelectItem value="true">Yes</SelectItem>
        <SelectItem value="false">No</SelectItem>
      </Select>
    );
  }

  const numeric =
    field && ["number", "integer", "decimal"].includes(field.type) && !multi;

  return (
    <Input
      className="h-8 text-xs"
      type={numeric ? "number" : "text"}
      placeholder={multi ? "a, b, c" : "value"}
      value={
        multi
          ? Array.isArray(value)
            ? (value as string[]).join(", ")
            : ((value as string) ?? "")
          : ((value as string | number) ?? "")
      }
      onChange={(e) => {
        const raw = e.target.value;
        if (multi) {
          onChange(
            raw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        } else {
          onChange(numeric ? (raw === "" ? "" : Number(raw)) : raw);
        }
      }}
    />
  );
}
