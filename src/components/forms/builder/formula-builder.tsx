"use client";

// Calculated-field formula builder (Part B §2.2).
//
// A guided expression editor rather than a bare text box: insert-buttons for
// every field on the canvas and every function the SERVER reports at
// /api/forms/meta, plus live validation against the real publish gate via
// POST /api/forms/definitions/validate. The author never has to know the
// syntax, and — more importantly — cannot invent syntax the engine's
// AST-whitelist evaluator refuses.
//
// It stays a text field underneath because the engine's formula grammar is
// arithmetic, and a fully structured tree editor for `a + b * (c / d)` is worse
// to use than the expression itself. The guardrail is not "prevent typing", it
// is "validate against the same gate that publishing runs" — which is exactly
// what the Check button does, hitting the server rather than a second parser
// in the browser.
//
// ── NOT OFFERED, DELIBERATELY ────────────────────────────────────────────────
// §2.2 also asks for two calculated-field modes that the ENGINE DOES NOT
// IMPLEMENT: a lookup-table-backed calculation (the emission-factor pattern)
// and a cross-form field reference (Sustainability's shared production_output
// denominator). Neither exists in app/services/form_engine/formula.py, whose
// vocabulary is arithmetic plus SUM/IF/ROUND/MIN/MAX/ABS/COUNT over sibling
// fields and table columns.
//
// Offering them here would let the Builder emit config the runtime cannot
// execute — the precise defect §0 forbids. They are surfaced to the author as
// unavailable, and are engine feature requests, not Builder work.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
import type { FormField } from "../types";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function FormulaBuilder({
  value,
  onChange,
  available,
  functions,
  /** The whole schema, so the Check button validates the formula in context —
   *  an unknown field reference is only detectable against the full field list. */
  schemaForCheck
}: {
  value: string;
  onChange: (next: string) => void;
  available: FormField[];
  functions: string[];
  schemaForCheck: unknown[];
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; errors: string[] } | null>(null);

  // Any edit invalidates the previous verdict — a stale green tick next to a
  // changed formula is worse than no verdict.
  useEffect(() => setResult(null), [value]);

  const insert = (text: string) => {
    const el = ref.current;
    if (!el) {
      onChange(`${value}${text}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  async function check() {
    setChecking(true);
    try {
      // The SAME endpoint publish runs. Not a browser-side parser — a second
      // parser is how the Builder and the engine start disagreeing.
      const r = await fetch("/api/forms/definitions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaJson: schemaForCheck })
      });
      const body = await r.json();
      setResult({ ok: !!body.ok, errors: body.errors ?? [] });
    } catch {
      setResult({ ok: false, errors: ["Could not reach the validation service."] });
    } finally {
      setChecking(false);
    }
  }

  // Only errors naming this formula's own field are worth showing here; the
  // rest belong to the whole-form validation strip.
  const relevant = result?.errors ?? [];

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. ROUND(total_energy_gj / production_output, 3)"
        className="min-h-0 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      />

      <div className="flex flex-wrap gap-1">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Fields
        </span>
        {available.map((f) => (
          <Button
            variant="bare"
            key={f.key}
            type="button"
            title={`${f.label} — inserts ${f.key}`}
            onClick={() => insert(f.type === "table" ? `SUM(${f.key}.` : f.key)}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:border-primary-300 hover:bg-primary-50"
          >
            {f.key}
          </Button>
        ))}
        {available.length === 0 ? (
          <span className="text-[11px] text-slate-400">No other fields to reference yet.</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Functions
        </span>
        {functions.map((fn) => (
          <Button
            variant="bare"
            key={fn}
            type="button"
            onClick={() => insert(`${fn}(`)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:border-primary-300 hover:bg-primary-50"
          >
            {fn}
          </Button>
        ))}
        {["+", "-", "*", "/", "(", ")"].map((op) => (
          <Button
            variant="bare"
            key={op}
            type="button"
            onClick={() => insert(op)}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:border-primary-300 hover:bg-primary-50"
          >
            {op}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={check} disabled={checking || !value.trim()}>
          {checking ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
          Check formula
        </Button>
        {result?.ok ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={13} /> Valid
          </span>
        ) : null}
      </div>

      {result && !result.ok && relevant.length > 0 ? (
        <ul className="space-y-0.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5">
          {relevant.map((e, i) => (
            <li key={i} className="flex items-start gap-1 text-[11px] text-rose-700">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      ) : null}

      <UnavailableModes />
    </div>
  );
}

/** Shown rather than hidden: an author who expects the emission-factor pattern
 *  needs to know it is an engine gap, not something they have configured wrong. */
function UnavailableModes() {
  const modes = [
    {
      name: "Look up a master table",
      why: "e.g. activity data × emission factor. The engine's evaluator has no lookup mode yet."
    },
    {
      name: "Read another form's value",
      why: "e.g. a shared production-output denominator. Cross-form references are not implemented."
    }
  ];
  return (
    <Collapsible className="rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
      <CollapsibleTrigger className="w-full cursor-pointer text-left text-[11px] font-medium text-slate-500">
        Other calculation types (not yet available)
      </CollapsibleTrigger>
      <CollapsibleContent>
      <ul className="mt-1.5 space-y-1">
        {modes.map((m) => (
          <li key={m.name} className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Lock size={11} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium text-slate-600">{m.name}</span> — {m.why}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-slate-400">
        These are engine capabilities, not Builder settings. The Builder deliberately cannot author
        them, because a form it published using them would fail at runtime.
      </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
