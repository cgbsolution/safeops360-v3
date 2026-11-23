"use client";

// Nodes and the HAZOP worksheet.
//
// The worksheet is a spreadsheet-like grid: every cell edits in place and saves
// on blur (PATCH /api/pha/deviations/{id}); severity / likelihood are dropdowns on
// the study's matrix scale and the risk cell is coloured from the matrix cell the
// server returns. Rows come from the guideword library ("generate"), by hand, or
// from AI suggestions the team accepts one by one (nothing is saved unreviewed).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Library, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  label, phaFetch, textOn, type AiSuggestion, type Deviation, type OperatingParameter, type PhaMeta, type PhaNode,
  type RiskMatrix, type StudyDetail, type Worksheet,
} from "@/lib/pha/api";
import { AddRecDialog, RecStatusDialog } from "./recommendations";
import { EmptyRow, ErrorBox, Field, RiskChip, StatusBadge } from "./shared";

const UNRATED = "__unrated__";

// ── matrix legend ────────────────────────────────────────────────────────────
export function MatrixLegend({ matrix }: { matrix: RiskMatrix }) {
  const cell = (l: number, s: number) => matrix.cells.find((c) => c.likelihood === l && c.severity === s);
  const liks = Array.from({ length: matrix.likelihoodLevels }, (_, i) => matrix.likelihoodLevels - i);
  const sevs = Array.from({ length: matrix.severityLevels }, (_, i) => i + 1);
  const sevLabel = (s: number) => matrix.severities.find((x) => x.score === s)?.label ?? `S${s}`;
  const likLabel = (l: number) => matrix.likelihoods.find((x) => x.score === l)?.label ?? `L${l}`;
  return (
    <div className="inline-block">
      <div className="mb-1 text-[11px] font-semibold text-slate-600">{matrix.name}</div>
      <div className="grid gap-0.5 text-[10px]" style={{ gridTemplateColumns: `90px repeat(${sevs.length}, minmax(44px, 1fr))` }}>
        {liks.map((l) => (
          <div key={l} className="contents">
            <div className="truncate pr-1 text-right text-slate-500" title={likLabel(l)}>{l} · {likLabel(l)}</div>
            {sevs.map((s) => {
              const c = cell(l, s);
              return (
                <div key={s} className="rounded-sm py-1 text-center font-semibold" style={{ backgroundColor: c?.color ?? "#e2e8f0", color: textOn(c?.color) }} title={c ? `${label(c.level)} (${c.score})` : ""}>
                  {c?.score ?? l * s}
                </div>
              );
            })}
          </div>
        ))}
        <div />
        {sevs.map((s) => <div key={s} className="truncate text-center text-slate-500" title={sevLabel(s)}>{s} · {sevLabel(s)}</div>)}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">Rows: likelihood · Columns: severity</div>
    </div>
  );
}

// ── node dialog ──────────────────────────────────────────────────────────────
type NodeForm = { title: string; description: string; designIntent: string; boundaries: string; drawingRef: string; params: OperatingParameter[] };

function NodeDialog({
  open, onOpenChange, node, drawings, onSubmit,
}: { open: boolean; onOpenChange: (v: boolean) => void; node: PhaNode | null; drawings: string[]; onSubmit: (f: NodeForm) => Promise<boolean> }) {
  const [f, setF] = useState<NodeForm>({ title: "", description: "", designIntent: "", boundaries: "", drawingRef: "", params: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF({
        title: node?.title ?? "", description: node?.description ?? "", designIntent: node?.designIntent ?? "",
        boundaries: node?.boundaries ?? "", drawingRef: node?.drawingRef ?? "", params: node?.operatingParameters ?? [],
      });
    }
  }, [open, node]);
  const setParam = (i: number, k: keyof OperatingParameter, v: string) =>
    setF((p) => ({ ...p, params: p.params.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{node ? `Edit node ${node.nodeNo}` : "Add node"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Node title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Fuel gas skid from battery limit to burner header" /></Field>
          <Field label="Design intent" hint="What this section is meant to do, at what conditions. The worksheet deviates from this.">
            <Textarea rows={3} value={f.designIntent} onChange={(e) => setF({ ...f, designIntent: e.target.value })} placeholder="Supply natural gas at 0.3 barg, up to 900 Nm3/h, to 24 burners" />
          </Field>
          <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Boundaries"><Input value={f.boundaries} onChange={(e) => setF({ ...f, boundaries: e.target.value })} placeholder="From SSV-101 to burner isolation valves" /></Field>
            <Field label="Drawing">
              {drawings.length > 0 ? (
                <Select value={f.drawingRef} onValueChange={(v) => setF({ ...f, drawingRef: v })} aria-label="Drawing">
                  <SelectItem value="">None</SelectItem>
                  {drawings.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </Select>
              ) : (
                <Input value={f.drawingRef} onChange={(e) => setF({ ...f, drawingRef: e.target.value })} placeholder="P&ID number" />
              )}
            </Field>
          </div>
          <Field label="Operating parameters" hint="Normal values and limits the team deviates from.">
            <div className="space-y-1.5">
              {f.params.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_90px_auto] gap-1.5">
                  <Input value={p.name} onChange={(e) => setParam(i, "name", e.target.value)} placeholder="Parameter" />
                  <Input value={p.value ?? ""} onChange={(e) => setParam(i, "value", e.target.value)} placeholder="Value / range" />
                  <Input value={p.unit ?? ""} onChange={(e) => setParam(i, "unit", e.target.value)} placeholder="Unit" />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove parameter" onClick={() => setF({ ...f, params: f.params.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, params: [...f.params, { name: "", value: "", unit: "" }] })}><Plus size={14} /> Add parameter</Button>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || f.title.trim().length < 3} onClick={async () => { setBusy(true); try { if (await onSubmit(f)) onOpenChange(false); } finally { setBusy(false); } }}>
            {node ? "Save node" : "Add node"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const nodeBody = (f: NodeForm) => ({
  title: f.title, description: f.description, designIntent: f.designIntent, boundaries: f.boundaries, drawingRef: f.drawingRef,
  operatingParameters: f.params.filter((p) => p.name.trim()).map((p) => ({ name: p.name, value: p.value || null, unit: p.unit || null })),
});

// ── library dialog ───────────────────────────────────────────────────────────
function LibraryDialog({
  open, onOpenChange, meta, existing, onGenerate,
}: { open: boolean; onOpenChange: (v: boolean) => void; meta: PhaMeta | null; existing: Set<string>; onGenerate: (pairs: { guideword: string; parameter: string }[]) => Promise<void> }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPicked(new Set()); }, [open]);
  const lib = meta?.library;
  const combos = useMemo(() => new Map((lib?.combinations ?? []).map((c) => [`${c.guideword}|${c.parameter}`, c.deviation])), [lib]);
  if (!lib) return null;
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pickParam = (param: string) => setPicked((p) => {
    const n = new Set(p);
    lib.guidewords.forEach((g) => { const k = `${g.code}|${param}`; if (combos.has(k) && !existing.has(k)) n.add(k); });
    return n;
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Guideword library</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">Tick the deviations to study for this node. Only meaningful guideword and parameter pairs are offered; pairs already on the worksheet are shown ticked.</p>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Parameter</TableHead>
                {lib.guidewords.map((g) => <TableHead key={g.code} className="text-center" title={g.meaning}>{g.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lib.parameters.map((p) => (
                <TableRow key={p.code}>
                  <TableCell>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => pickParam(p.code)} title="Tick every pair for this parameter">{p.label}</Button>
                  </TableCell>
                  {lib.guidewords.map((g) => {
                    const k = `${g.code}|${p.code}`;
                    const text = combos.get(k);
                    if (!text) return <TableCell key={g.code} className="bg-slate-50" />;
                    const have = existing.has(k);
                    return (
                      <TableCell key={g.code} className="text-center" title={text}>
                        <Checkbox checked={have || picked.has(k)} disabled={have} onCheckedChange={() => toggle(k)} aria-label={text} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-slate-500">{picked.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || picked.size === 0} onClick={async () => {
            setBusy(true);
            try {
              await onGenerate([...picked].map((k) => { const [guideword, parameter] = k.split("|"); return { guideword, parameter }; }));
              onOpenChange(false);
            } finally { setBusy(false); }
          }}>Generate {picked.size || ""} rows</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── add row dialog ───────────────────────────────────────────────────────────
function AddRowDialog({ open, onOpenChange, meta, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; meta: PhaMeta | null; onAdd: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [gw, setGw] = useState("");
  const [param, setParam] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setGw(""); setParam(""); setText(""); } }, [open]);
  const suggested = meta?.library.combinations.find((c) => c.guideword === gw && c.parameter === param)?.deviation;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add worksheet row</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Guideword">
              <Select value={gw} onValueChange={setGw} aria-label="Guideword">
                <SelectItem value="">None (free text)</SelectItem>
                {(meta?.library.guidewords ?? []).map((g) => <SelectItem key={g.code} value={g.code}>{g.label}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Parameter">
              <Select value={param} onValueChange={setParam} aria-label="Parameter">
                <SelectItem value="">None (free text)</SelectItem>
                {(meta?.library.parameters ?? []).map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
              </Select>
            </Field>
          </div>
          <Field label="Deviation" hint={suggested && !text ? `Leave blank to use "${suggested}".` : "For What-If / HAZID, write the question or hazard."}>
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={suggested ?? "What if the fuel gas supply pressure drops below the burner minimum?"} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={busy || (!text.trim() && !suggested)} onClick={async () => {
            setBusy(true);
            try { if (await onAdd({ guideword: gw || null, parameter: param || null, deviation: text.trim() || null })) onOpenChange(false); } finally { setBusy(false); }
          }}>Add row</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AI suggestions ───────────────────────────────────────────────────────────
function AiDialog({ open, onOpenChange, nodeId, onAccept }: { open: boolean; onOpenChange: (v: boolean) => void; nodeId: string; onAccept: (s: AiSuggestion) => Promise<boolean> }) {
  const [items, setItems] = useState<AiSuggestion[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setItems(null);
    setMessage(null);
    try {
      const r = await phaFetch<{ available: boolean; suggestions: AiSuggestion[]; message: string | null }>(`/api/pha/nodes/${nodeId}/ai-suggest`, { method: "POST" });
      setItems(r.suggestions);
      setMessage(r.message);
    } catch (e: any) {
      setItems([]);
      setMessage(e?.message ?? "Suggestions are unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => { if (open) run(); }, [open, run]);

  const drop = (i: number) => setItems((p) => (p ?? []).filter((_, j) => j !== i));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles size={16} /> Suggested deviations</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">Drafted from the node&apos;s design intent and parameters. Review each one: accept adds it as a worksheet row (marked as suggested) for the team to edit; reject discards it. Nothing is saved until you accept.</p>
        {loading && <EmptyRow text="Drafting suggestions…" />}
        {message && !loading && <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{message}</div>}
        <div className="space-y-2">
          {(items ?? []).map((s, i) => (
            <div key={`${s.guideword}-${s.parameter}-${i}`} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-slate-200 bg-slate-100 text-slate-700">{label(s.guideword)} · {label(s.parameter)}</Badge>
                <span className="font-medium text-slate-900">{s.deviation}</span>
                {s.severity && s.likelihood && <span className="text-xs text-slate-500">S{s.severity} · L{s.likelihood}</span>}
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-[110px_1fr]">
                <dt className="text-slate-500">Causes</dt><dd>{s.causes ?? "—"}</dd>
                <dt className="text-slate-500">Consequences</dt><dd>{s.consequences ?? "—"}</dd>
                <dt className="text-slate-500">Safeguards</dt><dd>{s.safeguards ?? "—"}</dd>
                {s.recommendation && <><dt className="text-slate-500">Recommendation</dt><dd>{s.recommendation}</dd></>}
              </dl>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => drop(i)} disabled={busy !== null}>Reject</Button>
                <Button size="sm" disabled={busy !== null} onClick={async () => {
                  setBusy(i);
                  try { if (await onAccept(s)) drop(i); } finally { setBusy(null); }
                }}>Accept</Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={run} disabled={loading}>Suggest again</Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── one worksheet row ────────────────────────────────────────────────────────
type TextKey = "deviation" | "causes" | "consequences" | "safeguards" | "remarks";
type NumKey = "severity" | "likelihood" | "residualSeverity" | "residualLikelihood";

function CellText({ value, editable, onSave, minRows = 3, bold }: { value: string | null; editable: boolean; onSave: (v: string) => void; minRows?: number; bold?: boolean }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  if (!editable) return <div className={cn("whitespace-pre-line text-xs", bold && "font-medium")}>{value || "—"}</div>;
  return (
    <Textarea
      rows={minRows}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? "")) onSave(v); }}
      className={cn("min-h-0 resize-y border-transparent bg-transparent p-1 text-xs shadow-none hover:border-slate-200 focus:border-primary-400 focus:bg-white", bold && "font-medium")}
    />
  );
}

function ScaleSelect({ value, levels, editable, onSave, prefix }: { value: number | null; levels: number; editable: boolean; onSave: (v: number | null) => void; prefix: string }) {
  if (!editable) return <span className="text-xs tabular-nums">{value ?? "—"}</span>;
  return (
    <Select value={value ? String(value) : UNRATED} onValueChange={(v) => onSave(v === UNRATED ? null : Number(v))} className="h-8 w-14 px-2 text-xs" aria-label={prefix}>
      <SelectItem value={UNRATED}>—</SelectItem>
      {Array.from({ length: levels }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
    </Select>
  );
}

function WorksheetRow({
  d, nodeNo, idx, total, editable, meta, matrix, onPatch, onMove, onDelete, onAddRec, onRecClick,
}: {
  d: Deviation; nodeNo: number; idx: number; total: number; editable: boolean; meta: PhaMeta | null; matrix: RiskMatrix;
  onPatch: (id: string, body: Record<string, unknown>) => void; onMove: (idx: number, dir: -1 | 1) => void;
  onDelete: (d: Deviation) => void; onAddRec: (d: Deviation) => void; onRecClick: (r: Deviation["recommendations"][number]) => void;
}) {
  const t = (k: TextKey) => (v: string) => onPatch(d.id, { [k]: v });
  const n = (k: NumKey) => (v: number | null) => onPatch(d.id, { [k]: v });
  return (
    <TableRow className="align-top">
      <TableCell className="whitespace-nowrap text-xs font-semibold tabular-nums">
        {nodeNo}.{idx + 1}
        {d.aiSuggested && <div title="Accepted from an AI suggestion"><Sparkles size={11} className="mt-1 text-violet-500" /></div>}
      </TableCell>
      <TableCell className="min-w-[110px]">
        {editable ? (
          <div className="space-y-1">
            <Select value={d.guideword ?? ""} onValueChange={(v) => onPatch(d.id, { guideword: v || null })} className="h-8 px-2 text-xs" aria-label="Guideword">
              <SelectItem value="">—</SelectItem>
              {(meta?.library.guidewords ?? []).map((g) => <SelectItem key={g.code} value={g.code}>{g.label}</SelectItem>)}
            </Select>
            <Select value={d.parameter ?? ""} onValueChange={(v) => onPatch(d.id, { parameter: v || null })} className="h-8 px-2 text-xs" aria-label="Parameter">
              <SelectItem value="">—</SelectItem>
              {(meta?.library.parameters ?? []).map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
            </Select>
          </div>
        ) : (
          <div className="text-xs">{d.guideword ? d.guidewordLabel : "—"}<div className="text-slate-500">{d.parameter ? d.parameterLabel : ""}</div></div>
        )}
      </TableCell>
      <TableCell className="min-w-[150px]"><CellText value={d.deviation} editable={editable} onSave={t("deviation")} minRows={2} bold /></TableCell>
      <TableCell className="min-w-[190px]"><CellText value={d.causes} editable={editable} onSave={t("causes")} /></TableCell>
      <TableCell className="min-w-[210px]"><CellText value={d.consequences} editable={editable} onSave={t("consequences")} /></TableCell>
      <TableCell className="min-w-[190px]"><CellText value={d.safeguards} editable={editable} onSave={t("safeguards")} /></TableCell>
      <TableCell><ScaleSelect value={d.severity} levels={matrix.severityLevels} editable={editable} onSave={n("severity")} prefix="Severity" /></TableCell>
      <TableCell><ScaleSelect value={d.likelihood} levels={matrix.likelihoodLevels} editable={editable} onSave={n("likelihood")} prefix="Likelihood" /></TableCell>
      <TableCell><RiskChip level={d.riskLevel} score={d.riskScore} color={d.riskColor} /></TableCell>
      <TableCell className="min-w-[170px]">
        <div className="space-y-1">
          {d.recommendations.map((r) => (
            <Button key={r.id} variant="bare" size="bare" onClick={() => onRecClick(r)} className="block w-full rounded border border-slate-200 p-1 text-left text-[11px] hover:bg-slate-50">
              <span className="font-semibold">{r.recLabel}</span> <StatusBadge status={r.status} overdue={r.overdue} />
              <span className="mt-0.5 block whitespace-normal text-slate-600">{r.text}</span>
              {r.capaNumber && <span className="block text-[10px] text-slate-400">{r.capaNumber}</span>}
            </Button>
          ))}
          {editable && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAddRec(d)}><Plus size={12} /> Recommendation</Button>}
        </div>
      </TableCell>
      <TableCell><ScaleSelect value={d.residualSeverity} levels={matrix.severityLevels} editable={editable} onSave={n("residualSeverity")} prefix="Residual severity" /></TableCell>
      <TableCell><ScaleSelect value={d.residualLikelihood} levels={matrix.likelihoodLevels} editable={editable} onSave={n("residualLikelihood")} prefix="Residual likelihood" /></TableCell>
      <TableCell><RiskChip level={d.residualLevel} score={d.residualScore} color={d.residualColor} /></TableCell>
      <TableCell className="min-w-[140px]"><CellText value={d.remarks} editable={editable} onSave={t("remarks")} minRows={2} /></TableCell>
      {editable && (
        <TableCell className="whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => onMove(idx, -1)} aria-label="Move up"><ArrowUp size={13} /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === total - 1} onClick={() => onMove(idx, 1)} aria-label="Move down"><ArrowDown size={13} /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => onDelete(d)} aria-label="Delete row"><Trash2 size={13} /></Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

// ── node worksheet ───────────────────────────────────────────────────────────
function NodeWorksheet({ node, study, meta, canUpdate, onStudyChanged }: { node: PhaNode; study: StudyDetail; meta: PhaMeta | null; canUpdate: boolean; onStudyChanged: () => void }) {
  const { toast } = useToast();
  const [ws, setWs] = useState<Worksheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [recFor, setRecFor] = useState<Deviation | null>(null);
  const [moving, setMoving] = useState<Deviation["recommendations"][number] | null>(null);

  const load = useCallback(async () => {
    try {
      setWs(await phaFetch<Worksheet>(`/api/pha/nodes/${node.id}/worksheet`));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the worksheet");
    }
  }, [node.id]);

  useEffect(() => { load(); }, [load]);

  const editable = Boolean(ws?.editable && canUpdate);
  const existing = useMemo(() => new Set((ws?.deviations ?? []).filter((d) => d.guideword && d.parameter).map((d) => `${d.guideword}|${d.parameter}`)), [ws]);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      const row = await phaFetch<Deviation>(`/api/pha/deviations/${id}`, { method: "PATCH", json: body });
      setWs((p) => (p ? { ...p, deviations: p.deviations.map((d) => (d.id === id ? row : d)) } : p));
      setError(null);
      if ("severity" in body || "likelihood" in body || "consequences" in body) onStudyChanged();
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    }
  }

  async function replace(p: Promise<Worksheet>, msg?: string) {
    try {
      const r = await p;
      setWs(r);
      setError(null);
      if (msg) toast({ title: msg, variant: "success" });
      onStudyChanged();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    if (!ws) return;
    const ids = ws.deviations.map((d) => d.id);
    const j = idx + dir;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await replace(phaFetch<Worksheet>(`/api/pha/nodes/${node.id}/order`, { method: "PUT", json: { ids } }));
  }

  async function remove(d: Deviation) {
    if (!(await confirmDialog({ title: "Delete row?", description: `${d.deviation}`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      setWs(await phaFetch<Worksheet>(`/api/pha/deviations/${d.id}`, { method: "DELETE" }));
      onStudyChanged();
    } catch (e: any) {
      setError(e?.message ?? "Could not delete");
    }
  }

  const matrix = ws?.matrix ?? study.matrix;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div><span className="font-semibold text-slate-600">Design intent:</span> {node.designIntent || "—"}</div>
          {node.boundaries && <div><span className="font-semibold text-slate-600">Boundaries:</span> {node.boundaries}</div>}
          {node.drawingRef && <div><span className="font-semibold text-slate-600">Drawing:</span> {node.drawingRef}</div>}
          {node.operatingParameters.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {node.operatingParameters.map((p, i) => (
                <Badge key={i} className="border border-slate-200 bg-white text-slate-700">{p.name}: {p.value ?? "—"} {p.unit ?? ""}</Badge>
              ))}
            </div>
          )}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setLibOpen(true)}><Library size={14} /> Guideword library</Button>
            <Button size="sm" variant="outline" onClick={() => setAiOpen(true)}><Sparkles size={14} /> Suggest deviations</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add row</Button>
          </div>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Ref</TableHead><TableHead>Guideword / parameter</TableHead><TableHead>Deviation</TableHead>
              <TableHead>Causes</TableHead><TableHead>Consequences</TableHead><TableHead>Existing safeguards</TableHead>
              <TableHead title="Severity">S</TableHead><TableHead title="Likelihood">L</TableHead><TableHead>Risk</TableHead>
              <TableHead>Recommendations</TableHead><TableHead title="Residual severity">Res. S</TableHead>
              <TableHead title="Residual likelihood">Res. L</TableHead><TableHead>Residual risk</TableHead><TableHead>Remarks</TableHead>
              {editable && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ws?.deviations ?? []).map((d, i) => (
              <WorksheetRow key={d.id} d={d} nodeNo={node.nodeNo} idx={i} total={ws?.deviations.length ?? 0} editable={editable}
                meta={meta} matrix={matrix} onPatch={patch} onMove={move} onDelete={remove} onAddRec={setRecFor} onRecClick={setMoving} />
            ))}
          </TableBody>
        </Table>
        {ws && ws.deviations.length === 0 && (
          <EmptyRow text={editable ? "No rows yet. Generate them from the guideword library, ask for suggestions, or add one by hand." : "No worksheet rows."} />
        )}
        {!ws && !error && <EmptyRow text="Loading worksheet…" />}
      </div>
      <Card>
        <CardContent className="p-3"><MatrixLegend matrix={matrix} /></CardContent>
      </Card>

      <LibraryDialog open={libOpen} onOpenChange={setLibOpen} meta={meta} existing={existing} onGenerate={async (pairs) => {
        try {
          const r = await phaFetch<Worksheet>(`/api/pha/nodes/${node.id}/generate`, { method: "POST", json: { combinations: pairs } });
          setWs(r);
          toast({ title: `${r.created ?? 0} rows generated`, description: r.skipped?.length ? `${r.skipped.length} skipped (already on this node)` : undefined, variant: "success" });
          onStudyChanged();
        } catch (e: any) {
          setError(e?.message ?? "Could not generate rows");
        }
      }} />
      <AddRowDialog open={addOpen} onOpenChange={setAddOpen} meta={meta}
        onAdd={(body) => replace(phaFetch<Worksheet>(`/api/pha/nodes/${node.id}/deviations`, { method: "POST", json: body }), "Row added")} />
      <AiDialog open={aiOpen} onOpenChange={setAiOpen} nodeId={node.id} onAccept={(s) => replace(
        phaFetch<Worksheet>(`/api/pha/nodes/${node.id}/deviations`, {
          method: "POST",
          json: {
            guideword: s.guideword, parameter: s.parameter, deviation: s.deviation, causes: s.causes, consequences: s.consequences,
            safeguards: s.safeguards, severity: s.severity, likelihood: s.likelihood, aiSuggested: true, recommendationText: s.recommendation,
          },
        }), "Suggestion added to the worksheet")} />
      <AddRecDialog deviationId={recFor?.id ?? null} deviationText={recFor?.deviation} plantId={study.plantId} open={Boolean(recFor)}
        onOpenChange={(v) => !v && setRecFor(null)} onSaved={() => { load(); onStudyChanged(); }} />
      <RecStatusDialog rec={moving} onClose={() => setMoving(null)} onSaved={() => { load(); onStudyChanged(); }} />
    </div>
  );
}

// ── nodes panel ──────────────────────────────────────────────────────────────
export function NodesPanel({ study, meta, onStudy }: { study: StudyDetail; meta: PhaMeta | null; onStudy: (s: StudyDetail) => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<string | null>(study.nodes[0]?.id ?? null);
  const [dialog, setDialog] = useState<{ open: boolean; node: PhaNode | null }>({ open: false, node: null });
  const [error, setError] = useState<string | null>(null);
  const editable = study.perms.update && (study.status === "DRAFT" || study.status === "IN_PROGRESS");
  const node = study.nodes.find((n) => n.id === current) ?? study.nodes[0] ?? null;

  const refresh = useCallback(async () => {
    try { onStudy(await phaFetch<StudyDetail>(`/api/pha/studies/${study.id}`)); } catch { /* keep current view */ }
  }, [study.id, onStudy]);

  async function saveNode(f: NodeForm): Promise<boolean> {
    try {
      if (dialog.node) {
        await phaFetch(`/api/pha/nodes/${dialog.node.id}`, { method: "PATCH", json: nodeBody(f) });
        await refresh();
        toast({ title: "Node saved", variant: "success" });
      } else {
        const s = await phaFetch<StudyDetail>(`/api/pha/studies/${study.id}/nodes`, { method: "POST", json: nodeBody(f) });
        onStudy(s);
        setCurrent(s.nodes[s.nodes.length - 1]?.id ?? null);
        toast({ title: "Node added", variant: "success" });
      }
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Could not save the node");
      return false;
    }
  }

  async function deleteNode(n: PhaNode) {
    const reason = await promptDialog({ title: `Delete node ${n.nodeNo}?`, description: "Its worksheet rows are deleted with it. Give a reason (at least 10 characters).", placeholder: "Reason", confirmLabel: "Delete", destructive: true });
    if (!reason) return;
    try {
      const s = await phaFetch<StudyDetail>(`/api/pha/nodes/${n.id}`, { method: "DELETE", json: { reason } });
      onStudy(s);
      setCurrent(s.nodes[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Could not delete the node");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Nodes</CardTitle>
          {editable && <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, node: null })}><Plus size={14} /> Node</Button>}
        </CardHeader>
        <CardContent className="space-y-1.5">
          {study.nodes.map((n) => (
            <div key={n.id} className={cn("rounded-lg border p-2", node?.id === n.id ? "border-primary-400 bg-primary-50" : "border-slate-200")}>
              <Button variant="bare" size="bare" className="block w-full text-left" onClick={() => setCurrent(n.id)}>
                <span className="block text-xs font-semibold text-slate-900">Node {n.nodeNo}</span>
                <span className="block whitespace-normal text-xs text-slate-700">{n.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                  {n.rowCount} rows · {n.ratedCount} rated · {n.openRecs} open recs
                  {n.highestRisk && <RiskChip level={n.highestRisk.level} color={n.highestRisk.color} compact />}
                </span>
              </Button>
              {editable && node?.id === n.id && (
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDialog({ open: true, node: n })}><Pencil size={12} /> Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-600" onClick={() => deleteNode(n)}><Trash2 size={12} /> Delete</Button>
                </div>
              )}
            </div>
          ))}
          {study.nodes.length === 0 && <p className="py-4 text-center text-xs text-slate-400">{editable ? "Break the system into nodes (a line, a vessel, a skid) and add the first one." : "No nodes."}</p>}
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-2">
        <ErrorBox error={error} />
        {node ? (
          <>
            <h3 className="text-sm font-semibold text-slate-800">Node {node.nodeNo}: {node.title}</h3>
            <NodeWorksheet key={node.id} node={node} study={study} meta={meta} canUpdate={study.perms.update} onStudyChanged={refresh} />
          </>
        ) : (
          <Card><CardContent className="p-6 text-sm text-slate-500">Add a node to start the worksheet.</CardContent></Card>
        )}
      </div>
      <NodeDialog open={dialog.open} onOpenChange={(v) => setDialog((p) => ({ ...p, open: v }))} node={dialog.node} drawings={study.drawingRefs} onSubmit={saveNode} />
    </div>
  );
}
