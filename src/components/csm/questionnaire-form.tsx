"use client";

// The prequalification questionnaire, rendered from a template snapshot.
// Pure UI (no session, no fetch) so the same component serves HSE's internal
// entry/review screen and the contractor's tokenised external form.

import { CheckCircle2, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDate, label, type Answer, type CsmDocument, type Question, type Section } from "@/lib/csm/api";

export function QuestionnaireForm({
  sections, answers, onChange, readOnly, documents = [], onUpload, renderExtra, highlight = [],
}: {
  sections: Section[];
  answers: Record<string, Answer>;
  onChange?: (code: string, a: Answer) => void;
  readOnly?: boolean;
  documents?: CsmDocument[];
  onUpload?: (q: Question) => void;
  /** Review-time controls (score, override) shown under each question. */
  renderExtra?: (q: Question) => React.ReactNode;
  /** Question codes to flag (e.g. unanswered). */
  highlight?: string[];
}) {
  return (
    <div className="space-y-4">
      {sections.map((s, si) => (
        <section key={s.code} className="rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              {si + 1}. {s.title}
            </h3>
          </header>
          <div className="divide-y divide-slate-100">
            {s.questions.map((q, qi) => (
              <QuestionRow
                key={q.code}
                n={`${si + 1}.${qi + 1}`}
                q={q}
                a={answers[q.code]}
                onChange={onChange}
                readOnly={readOnly}
                docs={documents.filter((d) => d.docType === q.docType && d.status === "ACTIVE")}
                onUpload={onUpload}
                extra={renderExtra?.(q)}
                flagged={highlight.includes(q.code)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function QuestionRow({
  n, q, a, onChange, readOnly, docs, onUpload, extra, flagged,
}: {
  n: string; q: Question; a?: Answer; onChange?: (code: string, a: Answer) => void; readOnly?: boolean;
  docs: CsmDocument[]; onUpload?: (q: Question) => void; extra?: React.ReactNode; flagged: boolean;
}) {
  const value = a?.value ?? null;
  const set = (v: Answer["value"]) => onChange?.(q.code, { value: v, comment: a?.comment ?? null });
  const required = q.answerType !== "DOCUMENT_REQUIRED" && (q.required ?? (q.weight ?? 1) > 0);
  return (
    <div className={cn("px-4 py-3", flagged && "bg-amber-50/60")}>
      <div className="flex gap-2">
        <span className="w-8 shrink-0 text-xs font-semibold text-slate-400">{n}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm leading-snug text-slate-800">
            {q.text}
            {required && <span className="ml-0.5 text-rose-600">*</span>}
          </p>
          {q.help && <p className="text-[11px] text-slate-500">{q.help}</p>}

          {q.answerType === "YES_NO" && (
            <div className="flex gap-2">
              {["YES", "NO"].map((v) => (
                <Button key={v} type="button" size="sm" disabled={readOnly} variant={value === v ? "default" : "outline"} onClick={() => set(v)} className="min-w-16">
                  {v === "YES" ? "Yes" : "No"}
                </Button>
              ))}
            </div>
          )}

          {q.answerType === "SCALE_1_5" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <Button key={v} type="button" size="sm" disabled={readOnly} variant={Number(value) === v ? "default" : "outline"} onClick={() => set(v)} className="w-10">
                  {v}
                </Button>
              ))}
              <span className="ml-1 text-[11px] text-slate-500">1 = poor, 5 = excellent</span>
            </div>
          )}

          {q.answerType === "NUMBER" && (
            <Input
              type="number" min={0} step="any" className="h-9 w-44" disabled={readOnly}
              value={value === null || value === undefined ? "" : String(value)}
              onChange={(e) => set(e.target.value === "" ? null : e.target.value)}
            />
          )}

          {q.answerType === "TEXT" && (
            <Textarea rows={2} disabled={readOnly} value={value === null ? "" : String(value)} onChange={(e) => set(e.target.value)} />
          )}

          {q.answerType === "DOCUMENT_REQUIRED" && (
            <div className="space-y-1.5">
              {docs.length === 0 ? (
                <p className="text-xs text-rose-700">No {label(q.docType).toLowerCase()} document on file.</p>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                    {d.state === "EXPIRED" ? <FileText size={13} className="text-rose-600" /> : <CheckCircle2 size={13} className="text-emerald-600" />}
                    <span className="font-medium">{d.title || d.fileName}</span>
                    {d.documentNo && <span className="text-slate-500">No. {d.documentNo}</span>}
                    <span className={cn("text-slate-500", d.state === "EXPIRED" && "font-semibold text-rose-700", d.state === "DUE" && "font-semibold text-amber-700")}>
                      {d.expiresOn ? `valid until ${fmtDate(d.expiresOn)}` : "no expiry"}
                    </span>
                  </div>
                ))
              )}
              {!readOnly && onUpload && (
                <Button type="button" size="sm" variant="outline" onClick={() => onUpload(q)}>
                  <Upload size={13} /> Upload {label(q.docType).toLowerCase()}
                </Button>
              )}
            </div>
          )}

          {q.answerType !== "DOCUMENT_REQUIRED" && q.answerType !== "TEXT" && (readOnly ? (
            a?.comment ? <p className="text-xs text-slate-500">Comment: {a.comment}</p> : null
          ) : (
            <Input
              className="h-8 text-xs" placeholder="Comment or reference (optional)" value={a?.comment ?? ""}
              onChange={(e) => onChange?.(q.code, { value, comment: e.target.value })}
            />
          ))}
          {extra}
        </div>
      </div>
    </div>
  );
}
