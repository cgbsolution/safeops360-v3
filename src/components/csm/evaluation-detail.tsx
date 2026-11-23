"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { csmFetch, fmtDate, label, type CsmMeta, type Evaluation } from "@/lib/csm/api";
import { ErrorBox, KeyVal, LinkButton, Panel, Pill, ScoreText } from "./shared";

const SCORE_TEXT: Record<string, string> = { "1": "1 · Poor", "2": "2 · Below expectation", "3": "3 · Meets", "4": "4 · Good", "5": "5 · Excellent" };

export function EvaluationDetailView({ id, meta }: { id: string; meta: CsmMeta | null }) {
  const { toast } = useToast();
  const [e, setE] = useState<Evaluation | null>(null);
  const [manual, setManual] = useState<Record<string, { score: number | null; comment: string | null }>>({});
  const [remarks, setRemarks] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (r: Evaluation) => {
    setE(r);
    setManual(r.manual ?? {});
    setRemarks(r.evaluatorRemarks ?? "");
    setDirty(false);
  };

  const load = useCallback(async () => {
    try {
      apply(await csmFetch<Evaluation>(`/api/csm/evaluations/${id}`));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Could not load the evaluation");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function call(path: string, method: "POST" | "PUT", json: unknown, ok: string) {
    setBusy(true);
    setError(null);
    try {
      apply(await csmFetch<Evaluation>(`/api/csm/evaluations/${id}/${path}`, { method, json }));
      toast({ variant: "success", title: ok });
      return true;
    } catch (err: any) {
      setError(err?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!e) return <ErrorBox error={error} />;
  const draft = e.status === "DRAFT";
  const criteria = meta?.manualCriteria ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{e.evaluationNo}</h2>
              <Pill value={e.status} />
              <Pill value={e.ratingBand} />
            </div>
            <div className="mt-1 text-sm text-slate-600">
              <LinkButton href={`/csm/contractors/${e.contractorCompanyId}`}>{e.contractorName ?? "Contractor"}</LinkButton>
              {" · "}{e.plantName ?? ""} · {label(e.evaluationType)} · {fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}
              {e.workOrderNo && <> · <LinkButton href={`/csm/work-orders/${e.workOrderId}`}>{e.workOrderNo}</LinkButton></>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="text-[11px] uppercase text-slate-500">KPIs (60)</div><div className="text-xl"><ScoreText value={e.autoScore} /></div></div>
            <div><div className="text-[11px] uppercase text-slate-500">Manual (40)</div><div className="text-xl"><ScoreText value={e.manualScore} /></div></div>
            <div><div className="text-[11px] uppercase text-slate-500">Final</div><div className="text-xl"><ScoreText value={e.finalScore} /></div></div>
          </div>
        </div>
        {e.fatalityCapApplied && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
            <AlertTriangle size={14} /> A fatality in the period caps the rating at Unacceptable, whatever the other scores.
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {draft && (
            <>
              <Button size="sm" disabled={busy || !dirty} onClick={() => call("manual", "PUT", { manual, evaluatorRemarks: remarks }, "Saved")}>Save</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => call("refresh", "POST", null, "KPIs refreshed")}><RefreshCw size={13} /> Refresh KPIs</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                if (dirty && !(await call("manual", "PUT", { manual, evaluatorRemarks: remarks }, "Saved"))) return;
                if (await confirmDialog({ title: "Submit for sign-off?", description: "KPIs are frozen at submission. Another person signs off." }))
                  await call("submit", "POST", null, "Submitted for sign-off");
              }}>Submit for sign-off</Button>
            </>
          )}
          {e.status === "SUBMITTED" && (
            <>
              <Button size="sm" disabled={busy} onClick={async () => {
                const notes = await promptDialog({ title: "Sign off this evaluation", placeholder: "Notes (optional)", confirmLabel: "Sign off" });
                if (notes !== null) await call("sign-off", "POST", { notes: notes || null }, "Evaluation signed off");
              }}>Sign off</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                const reason = await promptDialog({ title: "Return to the evaluator", placeholder: "Reason" });
                if (reason && reason.trim().length >= 3) await call("return", "POST", { reason }, "Returned to draft");
              }}>Return</Button>
            </>
          )}
        </div>
        <div className="mt-3"><ErrorBox error={error} /></div>
      </div>

      <Panel title="KPIs filled from plant records">
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader><TableRow><TableHead>KPI</TableHead><TableHead className="text-right">Weight</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Score</TableHead></TableRow></TableHeader>
            <TableBody>
              {e.kpis.map((k) => (
                <TableRow key={k.code}>
                  <TableCell>{k.label}{k.code === "TBT_PARTICIPATION" && <div className="text-[11px] text-slate-500">target {k.target} (working days, Mon-Sat)</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.weight}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.value}</TableCell>
                  <TableCell className="text-right">{k.score === null ? <span className="text-xs text-slate-400">not measured</span> : <ScoreText value={k.score} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Counts are for this contractor at this plant in the period. Each event deducts from 100 (LTI 60, other incident 20, near miss 10, unsafe observation 5, show cause 25, permit suspension 25); a fatality scores 0.
        </p>
      </Panel>

      <Panel title="Evaluator's assessment">
        <div className="space-y-3">
          {criteria.map((c) => (
            <div key={c.code} className="grid items-start gap-2 md:grid-cols-[1fr_200px_1fr]">
              <div className="text-sm text-slate-800">{c.label}<div className="text-[11px] text-slate-500">weight {c.weight}</div></div>
              <Select value={manual[c.code]?.score ? String(manual[c.code]?.score) : ""} disabled={!draft} className="h-9 w-full"
                      onValueChange={(v) => { setManual({ ...manual, [c.code]: { score: v ? Number(v) : null, comment: manual[c.code]?.comment ?? null } }); setDirty(true); }}>
                <SelectItem value="" disabled>Score…</SelectItem>
                {["1", "2", "3", "4", "5"].map((v) => <SelectItem key={v} value={v}>{SCORE_TEXT[v]}</SelectItem>)}
              </Select>
              <Input className="h-9" disabled={!draft} placeholder="Comment" value={manual[c.code]?.comment ?? ""}
                     onChange={(ev) => { setManual({ ...manual, [c.code]: { score: manual[c.code]?.score ?? null, comment: ev.target.value } }); setDirty(true); }} />
            </div>
          ))}
          <div>
            <div className="mb-1 text-xs font-medium text-slate-700">Remarks</div>
            <Textarea rows={3} disabled={!draft} value={remarks} onChange={(ev) => { setRemarks(ev.target.value); setDirty(true); }} />
          </div>
        </div>
      </Panel>

      <Panel title="Sign-off">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KeyVal k="Evaluator" v={e.evaluatorName} />
          <KeyVal k="Submitted" v={fmtDate(e.submittedAt, true)} />
          <KeyVal k="Signed off by" v={e.signedOffByName} />
          <KeyVal k="Signed off" v={fmtDate(e.signedOffAt, true)} />
        </div>
        {e.signOffNotes && <p className="mt-2 text-sm text-slate-700">{e.signOffNotes}</p>}
      </Panel>
    </div>
  );
}
