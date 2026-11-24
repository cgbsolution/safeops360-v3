"use client";

// Copilot-style reading for Snap & Report: the same sections the SafeOps Copilot
// gives a photo (what it shows, likely classification with similar cases,
// severity with reasons, fatal-potential check, corrective actions highest in the
// hierarchy first, responsible function and closure target, what we still need
// from the reporter), plus a prompt box to change the draft in plain words.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, CornerDownRight, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { humanize, SNAP_NOTE_PROMPTS, SNAP_REFINE_PROMPTS, type RefineTurn, type SnapAnalysis } from "@/lib/observation-reporting/api";

const LEVEL_LABEL: Record<string, string> = {
  ELIMINATION: "Eliminate",
  SUBSTITUTION: "Substitute",
  ENGINEERING: "Engineering",
  ADMINISTRATIVE: "Procedure",
  PPE: "PPE",
};

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cn("space-y-1", tone === "warn" && "rounded-xl border border-rose-200 bg-rose-50 p-3")}>
      <div className={cn("text-[13px] font-bold", tone === "warn" ? "text-rose-800" : "text-[#0B1F4D]")}>{title}</div>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

/** Chips that append a phrase to a text box. */
export function PromptChips({ prompts, onPick, disabled }: { prompts: string[]; onPick: (p: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {prompts.map((p) => (
        <Button
          key={p}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-7 rounded-full px-2.5 text-[11px] font-medium"
          onClick={() => onPick(p)}
        >
          {p}
        </Button>
      ))}
    </div>
  );
}

/** Optional context typed before the photo is taken. */
export function SnapNoteBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2 rounded-2xl border border-[#D9E1EF] bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Sparkles className="h-4 w-4 text-[#C9A961]" /> Tell Copilot about it (optional)
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="e.g. CRD AP2 bay, grinding next to the HV panel, contractor crew"
        aria-label="Note for the photo reading"
      />
      <PromptChips prompts={SNAP_NOTE_PROMPTS} onPick={(p) => onChange(value.trim() ? `${value.trim()}; ${p}` : p)} />
    </div>
  );
}

export function SnapAnalysisCard({
  analysis,
  onUseAction,
  onAsk,
  busy,
}: {
  analysis: SnapAnalysis;
  onUseAction: (action: string) => void;
  /** Puts text into the prompt box (questions / fatal check answers). */
  onAsk: (text: string, send?: boolean) => void;
  busy: boolean;
}) {
  const c = analysis.classification;
  const sev = analysis.severity;
  const fp = analysis.fatalPotential;
  return (
    <div className="space-y-4 rounded-2xl border border-[#C9A961]/60 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-[#0B1F4D]">
        <Sparkles className="h-4 w-4 text-[#C9A961]" /> Copilot reading
      </div>

      <Section title="What the photo shows">{analysis.photoFindings}</Section>

      <Section title="Likely classification">
        <span className="font-medium">{humanize(c.observationType)}</span>
        {c.categoryLabel && (
          <>
            {" · "}
            {c.categoryLabel}
            {c.subCategoryLabel ? ` › ${c.subCategoryLabel}` : ""}
          </>
        )}
        {!c.categoryLabel && c.category && <> · {humanize(c.category)}</>}
        {c.why && <div className="mt-0.5 text-[12px] text-slate-500">{c.why}</div>}
      </Section>

      <Section title={`Severity: ${humanize(sev.final)}`}>
        {sev.reasons.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5">
            {sev.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        ) : (
          <span>From the photo it looks {humanize(sev.photo).toLowerCase()}.</span>
        )}
      </Section>

      {analysis.consequence && <Section title="What could happen">{analysis.consequence}</Section>}

      {fp.level === "YES" && (
        <Section title="Fatal potential" tone="warn">
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            A fatality is a credible outcome from what is visible. Rated Critical: stop the work and close it today.
          </span>
        </Section>
      )}
      {fp.level !== "YES" && fp.question && (
        <Section title="Fatal potential check" tone="warn">
          <p>{fp.question}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={busy}
              onClick={() => onAsk(`Fatal potential check: "${fp.question}" Answer: yes. Re-rate the severity.`, true)}>
              Yes, it could
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={() => onAsk(`Fatal potential check: "${fp.question}" Answer: no, it could not.`, true)}>
              No
            </Button>
          </div>
        </Section>
      )}

      {analysis.correctiveActions.length > 0 && (
        <Section title="Suggested corrective actions">
          <ol className="list-decimal space-y-1.5 pl-5">
            {analysis.correctiveActions.map((a, i) => (
              <li key={i}>
                <span>{a.action}</span>{" "}
                <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                  {LEVEL_LABEL[a.controlLevel] ?? a.controlLevel}
                </span>
                {a.source === "REFERENCE" && (
                  <span className="ml-1 text-[11px] text-slate-500">from a similar case{a.ref ? ` (${a.ref})` : ""}</span>
                )}
                <Button type="button" variant="link" className="ml-1 h-auto p-0 text-[11px]" onClick={() => onUseAction(a.action)}>
                  Use as immediate action
                </Button>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(analysis.responsibleFunction || analysis.closureTarget) && (
        <div className="text-sm text-slate-700">
          {analysis.responsibleFunction && (
            <>
              <span className="font-bold text-[#0B1F4D]">Responsible function:</span> {analysis.responsibleFunction}.{" "}
            </>
          )}
          <span className="font-bold text-[#0B1F4D]">Closure target:</span> {analysis.closureTarget}
          {analysis.closureTargetDays === 0 ? "." : ` for ${humanize(sev.final)}.`}
        </div>
      )}

      {analysis.questions.length > 0 && (
        <Section title="I need from you">
          <ul className="space-y-1">
            {analysis.questions.map((q, i) => (
              <li key={i}>
                <Button
                  type="button"
                  variant="bare"
                  disabled={busy}
                  onClick={() => onAsk(`${q} `)}
                  className="flex w-full items-start gap-1.5 rounded-lg px-1 py-0.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9A961]" />
                  <span>{q}</span>
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-slate-500">Tap a question, add your answer below and send.</div>
        </Section>
      )}
    </div>
  );
}

export function SnapRefineBox({
  value,
  onChange,
  onSend,
  busy,
  error,
  history,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
  error: string | null;
  history: RefineTurn[];
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (focusTick) ref.current?.focus();
  }, [focusTick]);
  const canSend = value.trim().length >= 2 && !busy;
  return (
    <div className="space-y-3 rounded-2xl border border-[#D9E1EF] bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Wand2 className="h-4 w-4 text-[#C9A961]" /> Change it with a prompt
      </div>
      {history.length > 0 && (
        <div className="space-y-2">
          {history.map((t, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 text-sm",
                t.role === "user" ? "ml-8 bg-[#0B1F4D] text-white" : "mr-8 border border-[#C9A961]/50 bg-[#C9A961]/10 text-[#0B1F4D]"
              )}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 500))}
          rows={2}
          disabled={busy}
          placeholder='e.g. "The cable insulation is damaged", "this is at CRD AP2", "make it High"'
          aria-label="Change the observation with a prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend(value.trim());
            }
          }}
        />
        <Button type="button" size="icon" disabled={!canSend} onClick={() => onSend(value.trim())} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
      <PromptChips
        prompts={SNAP_REFINE_PROMPTS}
        disabled={busy}
        onPick={(p) => {
          onChange(p);
          setFocusTick((n) => n + 1);
        }}
      />
      {busy && <div className="text-xs text-slate-500">Updating the observation from your instruction…</div>}
      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>}
    </div>
  );
}
