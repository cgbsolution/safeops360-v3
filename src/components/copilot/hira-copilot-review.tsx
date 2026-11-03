"use client";

// Copilot review card for a HIRA entry (activity). The review is computed by the
// backend as soon as the page loads (GET /api/copilot/hira-review/{entryId}):
// what is wrong, what to correct in the residual risk, and what to improve.
// "Ask Copilot to fix" opens the chat, which uses the same review and can put
// recommended controls into the editor for the assessor to save.

import { useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, Info, Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot/copilot-provider";
import { cn } from "@/lib/utils";

type Level = "error" | "warning" | "suggestion" | "info";
type Rating = { likelihood: number; severity: number; score: number; level: string; verdict: string };

export type HiraReview = {
  /** The backend tags each review; the calibrated "v2" shape has its own card. */
  version?: "v1";
  /** Per-plant calibration flag (OFF / SHADOW / ON). */
  mode?: string;
  entryId: string;
  label: string;
  activity: string;
  headline: string;
  counts: Record<Level, number>;
  findings: { code: string; level: Level; area: string; title: string; detail: string; fix: string | null; sheetRow: number | null }[];
  residual: {
    threshold?: string | null;
    initial?: Rating;
    saved?: Rating | null;
    fromControls?: Rating;
    toImprove?: { options?: { addOneEffective: string; wouldGive: Rating; reachesAcceptable: boolean }[] } | null;
  };
  controlIdeas: { hierarchy: string; description: string; hazardLabel: string }[];
  sheet: { form: string; rows: { xl_row: number; hazard: string; SP: number; LH: number; CN: number; SV: number; DE: number; GT: number; acceptable: string | null; concerns: string[] }[]; strategyRows: number[] } | null;
  note: string;
};

const LEVEL_STYLE: Record<Level, { icon: typeof AlertCircle; cls: string; label: string }> = {
  error: { icon: AlertCircle, cls: "text-red-700 bg-red-50 border-red-200", label: "Correct" },
  warning: { icon: AlertTriangle, cls: "text-amber-800 bg-amber-50 border-amber-200", label: "Check" },
  suggestion: { icon: Lightbulb, cls: "text-sky-800 bg-sky-50 border-sky-200", label: "Improve" },
  info: { icon: Info, cls: "text-slate-700 bg-slate-50 border-slate-200", label: "Note" }
};

const VERDICT: Record<string, { text: string; cls: string }> = {
  ACCEPTABLE: { text: "Acceptable", cls: "text-emerald-700" },
  TOLERABLE_NEEDS_ALARP: { text: "Tolerable – show ALARP", cls: "text-amber-700" },
  NOT_ACCEPTABLE: { text: "Not acceptable", cls: "text-red-700" }
};

function RatingCell({ title, r }: { title: string; r?: Rating | null }) {
  if (!r) return (
    <div className="rounded border border-dashed border-slate-300 p-2 text-xs text-slate-500">
      <div className="font-medium text-slate-600">{title}</div>Not set
    </div>
  );
  const v = VERDICT[r.verdict] ?? { text: r.verdict, cls: "text-slate-700" };
  return (
    <div className="rounded border border-slate-200 p-2 text-xs">
      <div className="font-medium text-slate-600">{title}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">
        L{r.likelihood} × S{r.severity} = {r.level} ({r.score})
      </div>
      <div className={cn("mt-0.5", v.cls)}>{v.text}</div>
    </div>
  );
}

export function HiraCopilotReview({ review }: { review: HiraReview | null }) {
  const copilot = useCopilot();
  const [showMinor, setShowMinor] = useState(false);
  const [open, setOpen] = useState(true);
  if (!review) return null;

  const major = review.findings.filter((f) => f.level === "error" || f.level === "warning");
  const minor = review.findings.filter((f) => f.level === "suggestion" || f.level === "info");
  const shown = showMinor ? [...major, ...minor] : major;
  const best = review.residual.toImprove?.options?.find((o) => o.reachesAcceptable) ?? review.residual.toImprove?.options?.[0];
  const canAsk = copilot.available && !copilot.unavailableReason;

  return (
    <Card className="mb-4 border-primary-200">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left">
            <Sparkles size={16} className="text-primary-600" />
            <CardTitle className="text-base">Copilot review · {review.label}</CardTitle>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                review.counts.error ? "bg-red-100 text-red-800" : review.counts.warning ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              )}
            >
              {review.headline}
            </span>
            <ChevronDown size={16} className={cn("text-slate-500 transition-transform", open ? "rotate-180" : "")} />
          </button>
          {canAsk && (
            <Button
              variant="bare"
              type="button"
              disabled={copilot.sending}
              onClick={() => {
                copilot.setOpen(true);
                void copilot.send(
                  `Review ${review.label} "${review.activity}": tell me what is wrong, what to correct in the residual risk, and recommend improvements.`
                );
              }}
              className="inline-flex items-center gap-1 rounded border border-primary-200 px-2.5 py-1 text-xs text-primary-700 hover:bg-primary-50"
            >
              <Sparkles size={12} /> Ask Copilot to fix
            </Button>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          {/* Residual risk: saved vs what the controls justify */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Residual risk</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <RatingCell title="Initial (as rated)" r={review.residual.initial} />
              <RatingCell title="Residual saved" r={review.residual.saved} />
              <RatingCell title="What the listed controls justify" r={review.residual.fromControls} />
            </div>
            {best && review.residual.saved && review.residual.saved.verdict !== "ACCEPTABLE" && (
              <p className="mt-1.5 text-xs text-slate-700">
                To improve: add a verified <strong>{best.addOneEffective.toLowerCase()}</strong> control →{" "}
                L{best.wouldGive.likelihood} × S{best.wouldGive.severity} = {best.wouldGive.level} (
                {VERDICT[best.wouldGive.verdict]?.text ?? best.wouldGive.verdict}).
              </p>
            )}
          </div>

          {/* Findings */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              What to correct{review.sheet ? ` (source: ${review.sheet.form})` : ""}
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing to correct.</p>
            ) : (
              <ul className="space-y-1.5">
                {shown.map((f, i) => {
                  const s = LEVEL_STYLE[f.level];
                  const Icon = s.icon;
                  return (
                    <li key={`${f.code}-${i}`} className={cn("rounded border px-3 py-2 text-sm", s.cls)}>
                      <div className="flex items-start gap-2">
                        <Icon size={14} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">
                            {s.label}: {f.title}
                            <span className="ml-1 text-xs font-normal opacity-75">
                              · {f.area}
                              {f.sheetRow ? ` · sheet row ${f.sheetRow}` : ""}
                            </span>
                          </div>
                          <div className="text-xs opacity-90">{f.detail}</div>
                          {f.fix && <div className="mt-0.5 text-xs font-medium">→ {f.fix}</div>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {minor.length > 0 && (
              <button type="button" onClick={() => setShowMinor((v) => !v)} className="mt-1.5 text-xs text-primary-700 hover:underline">
                {showMinor ? "Hide" : "Show"} {minor.length} improvement note{minor.length === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {/* Control ideas */}
          {review.controlIdeas.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recommended improvements (good practice, top of the hierarchy first)
              </div>
              <ul className="space-y-1 text-sm text-slate-800">
                {review.controlIdeas.slice(0, 4).map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {c.hierarchy}
                    </span>
                    <span>
                      {c.description} <span className="text-xs text-slate-500">({c.hazardLabel})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source sheet rows */}
          {review.sheet && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">Source sheet rating ({review.sheet.rows.length} row{review.sheet.rows.length === 1 ? "" : "s"})</summary>
              <div className="mt-1 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pr-3">Row</th><th className="pr-3">Hazard</th><th className="pr-2">SP</th><th className="pr-2">LH</th>
                      <th className="pr-2">CN</th><th className="pr-2">SV</th><th className="pr-2">DE</th><th className="pr-2">GT</th>
                      <th className="pr-3">Concerns</th><th>Acceptable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.sheet.rows.map((r) => (
                      <tr key={r.xl_row}>
                        <td className="pr-3">{r.xl_row}</td><td className="pr-3">{r.hazard}</td><td className="pr-2">{r.SP}</td>
                        <td className="pr-2">{r.LH}</td><td className="pr-2">{r.CN}</td><td className="pr-2">{r.SV}</td>
                        <td className="pr-2">{r.DE}</td><td className="pr-2">{r.GT}</td>
                        <td className="pr-3">{r.concerns.join(", ") || "—"}</td><td>{r.acceptable ?? "blank"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {review.sheet.strategyRows.length > 0 && (
                  <div className="mt-1">QSD/25/F strategy rows: {review.sheet.strategyRows.join(", ")}</div>
                )}
              </div>
            </details>
          )}
          <p className="text-[11px] text-slate-500">{review.note}</p>
        </CardContent>
      )}
    </Card>
  );
}
