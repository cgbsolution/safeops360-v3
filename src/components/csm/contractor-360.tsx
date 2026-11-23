"use client";

// Contractor 360: execution monitoring for one contractor across the caller's
// plants. Observations, near misses, incidents (via the persons involved),
// permits, show cause notices, toolbox talks, work orders and workers on site,
// the evaluation score trend, prequalification history, documents, workers and
// the sanction history, with the actions that belong here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { csmFetch, dateToIso, fmtDate, label, type Contractor360, type CsmMeta, type PlantOption, type Worker } from "@/lib/csm/api";
import { DocumentUploadDialog } from "./document-upload";
import { InviteLinkBox } from "./invite-link";
import { DocumentTable } from "./prequal-review";
import { RequestSanctionDialog, SanctionTable } from "./sanctions";
import { EmptyRow, ErrorBox, Field, KeyVal, LinkButton, Panel, Pill, PlantSelect, ScoreText, Tile } from "./shared";

export function Contractor360View({ id, plants, meta, openRenew }: { id: string; plants: PlantOption[]; meta: CsmMeta | null; openRenew?: boolean }) {
  const { toast } = useToast();
  const [d, setD] = useState<Contractor360 | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(!!openRenew);
  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, w] = await Promise.all([
        csmFetch<Contractor360>(`/api/csm/contractors/${id}`),
        csmFetch<{ items: Worker[] }>(`/api/csm/contractors/${id}/workers`).catch(() => ({ items: [] as Worker[] })),
      ]);
      setD(r);
      setWorkers(w.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the contractor");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const evidence = useMemo(() => {
    if (!d) return [];
    return [
      ...d.incidents.recent.map((i) => ({ type: "INCIDENT", id: i.id, label: `${i.number} (${label(i.type)})` })),
      ...d.showCause.recent.map((s) => ({ type: "SHOW_CAUSE", id: s.id, label: `${s.noticeNo} (${label(s.violationCategory)})` })),
      ...d.nearMisses.recent.map((n) => ({ type: "NEAR_MISS", id: n.id, label: n.number })),
      ...d.observations.recent.filter((o) => String(o.type).startsWith("UNSAFE")).map((o) => ({ type: "OBSERVATION", id: o.id, label: o.number })),
      ...d.scoreTrend.map((e) => ({ type: "EVALUATION", id: e.evaluationId, label: `${e.evaluationNo} (${e.finalScore})` })),
    ];
  }, [d]);

  if (!d) return <ErrorBox error={error} />;
  const c = d.contractor;
  const status = (c.status || "ACTIVE").toUpperCase();
  const trend = d.scoreTrend.map((t) => ({ period: fmtDate(t.periodEnd), score: t.finalScore, band: t.ratingBand }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{c.name}</h2>
              <span className="text-sm text-slate-500">{c.code}</span>
              <Pill value={status} />
              <Pill value={c.qualification} />
            </div>
            {c.blockReason && <p className="mt-1 text-sm font-medium text-rose-700">{c.blockReason}: no new work, gate passes refused.</p>}
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
              <KeyVal k="Valid until" v={fmtDate(c.prequalificationValidUntil)} />
              <KeyVal k="Prequal score" v={<ScoreText value={c.prequalificationScore} />} />
              <KeyVal k="Safety officer" v={c.safetyOfficerName ? `${c.safetyOfficerName}${c.safetyOfficerPhone ? ` · ${c.safetyOfficerPhone}` : ""}` : null} />
              <KeyVal k="Contact" v={c.contactPerson || c.representativeName ? `${c.contactPerson ?? c.representativeName}${c.contactPhone ? ` · ${c.contactPhone}` : ""}` : null} />
              <KeyVal k="PAN / GST" v={[c.panNumber, c.gstNumber].filter(Boolean).join(" · ") || null} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {status !== "BLACKLISTED" && <Button size="sm" variant="outline" onClick={() => setRenewOpen(true)}><RotateCcw size={13} /> Renew / prequalify</Button>}
            {status === "ACTIVE" && <LinkButton href={`/csm/work-orders?new=1&contractorId=${c.id}`} variant="outline">Raise work order</LinkButton>}
            <LinkButton href={`/csm/evaluations?new=1&contractorId=${c.id}`} variant="outline">New evaluation</LinkButton>
            <Button size="sm" variant={status === "ACTIVE" ? "destructive" : "default"} onClick={() => setSanctionOpen(true)}>
              {status === "ACTIVE" ? <><Ban size={13} /> Suspend / blacklist</> : "Reinstate"}
            </Button>
          </div>
        </div>
        <div className="mt-3"><ErrorBox error={error} /></div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Execution monitoring</TabsTrigger>
          <TabsTrigger value="prequal">Prequalification ({d.prequalifications.length})</TabsTrigger>
          <TabsTrigger value="docs">Documents ({d.documents.filter((x) => x.status === "ACTIVE").length})</TabsTrigger>
          <TabsTrigger value="workers">Workers ({workers.length})</TabsTrigger>
          <TabsTrigger value="wo">Work orders ({d.workOrders.total})</TabsTrigger>
          <TabsTrigger value="sanctions">Sanctions ({d.sanctions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-4">
          <p className="text-xs text-slate-500">Last {d.windowDays} days, at the plants in your scope.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Tile title="Observations" value={d.observations.total} sub={`${(d.observations.byType.UNSAFE_ACT ?? 0) + (d.observations.byType.UNSAFE_CONDITION ?? 0)} unsafe · ${d.observations.open} open`} />
            <Tile title="Near misses" value={d.nearMisses.total} />
            <Tile title="Incidents" value={d.incidents.total} tone={(d.incidents.byType.LTI ?? 0) + (d.incidents.byType.FATALITY ?? 0) ? "bad" : undefined}
                  sub={Object.entries(d.incidents.byType).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || undefined} />
            <Tile title="Permits" value={d.permits.total} sub={`${d.permits.live} live`} />
            <Tile title="Show cause notices" value={d.showCause.total} sub={`${d.showCause.open} open`} tone={d.showCause.open ? "warn" : undefined} />
            <Tile title="Toolbox talks" value={d.toolboxTalks.total} sub={`${d.toolboxTalks.participants} contractor attendances`} />
            <Tile title="Active work orders" value={d.workOrders.active} />
            <Tile title="Workers cleared on site" value={d.workOrders.workersOnSite} />
            <Tile title="Live safety score" value={c.score} sub="reduced by incidents / near misses" tone={c.score < 70 ? "bad" : c.score < 85 ? "warn" : "good"} />
            <Tile title="Last evaluation" value={d.scoreTrend.length ? d.scoreTrend[d.scoreTrend.length - 1].finalScore : "—"}
                  sub={d.scoreTrend.length ? label(d.scoreTrend[d.scoreTrend.length - 1].ratingBand) : "none yet"} />
          </div>

          <Panel title="Evaluation score trend">
            {trend.length === 0 ? <EmptyRow text="No evaluations yet." /> : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                    <Tooltip formatter={(v: number) => [v, "Final score"]} />
                    <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="4 4" />
                    <ReferenceLine y={40} stroke="#e11d48" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="score" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <RecentTable title="Incidents" rows={d.incidents.recent} cols={[["number", "No."], ["date", "Date"], ["type", "Type"], ["status", "Status"]]} href={(r) => `/incidents/${r.id}`} />
            <RecentTable title="Near misses" rows={d.nearMisses.recent} cols={[["number", "No."], ["date", "Date"], ["severity", "Potential"], ["status", "Status"]]} href={(r) => `/near-miss/${r.id}`} />
            <RecentTable title="Observations" rows={d.observations.recent} cols={[["number", "No."], ["date", "Date"], ["type", "Type"], ["severity", "Severity"]]} href={(r) => `/observations/${r.id}`} />
            <RecentTable title="Show cause notices" rows={d.showCause.recent} cols={[["noticeNo", "No."], ["issuedAt", "Issued"], ["violationCategory", "Violation"], ["status", "Status"]]} />
            <RecentTable title="Permits" rows={d.permits.recent} cols={[["number", "No."], ["validFrom", "From"], ["type", "Type"], ["status", "Status"]]} href={(r) => `/ptw/${r.id}`} />
            <RecentTable title="Toolbox talks" rows={d.toolboxTalks.recent} cols={[["talkNo", "No."], ["conductedAt", "Date"], ["topic", "Topic"], ["contractorCount", "Attended"]]} />
          </div>
        </TabsContent>

        <TabsContent value="prequal" className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <Table className="min-w-[800px] text-sm">
              <TableHeader className="bg-slate-50"><TableRow><TableHead>Application</TableHead><TableHead>Plant</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Final score</TableHead><TableHead>Decided</TableHead><TableHead>Valid until</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.prequalifications.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><LinkButton href={`/csm/prequalifications/${p.id}`}>{p.applicationNo}</LinkButton>{p.isRenewal && <span className="ml-1 text-[11px] text-slate-500">renewal</span>}</TableCell>
                    <TableCell className="text-xs">{p.plantName ?? "—"}</TableCell>
                    <TableCell><Pill value={p.status} />{p.isCurrent && <span className="ml-1 text-[11px] text-emerald-700">current</span>}</TableCell>
                    <TableCell className="text-right"><ScoreText value={p.finalScore} /></TableCell>
                    <TableCell className="text-xs">{fmtDate(p.decidedAt)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(p.validUntil)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {d.prequalifications.length === 0 && <EmptyRow text="No prequalification at your plants yet." />}
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-3">
          <DocumentTable docs={d.documents} canUpload onUpload={() => setUploadOpen(true)} onChanged={load} />
        </TabsContent>

        <TabsContent value="workers" className="mt-3">
          <WorkersPanel contractorId={c.id} workers={workers} onChanged={load} />
        </TabsContent>

        <TabsContent value="wo" className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <Table className="min-w-[760px] text-sm">
              <TableHeader className="bg-slate-50"><TableRow><TableHead>Work order</TableHead><TableHead>Plant</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Manpower</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.workOrders.items.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell><LinkButton href={`/csm/work-orders/${w.id}`}>{w.workOrderNo}</LinkButton><div className="line-clamp-1 text-[11px] text-slate-500">{w.title}</div></TableCell>
                    <TableCell className="text-xs">{w.plantName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(w.startDate)} – {fmtDate(w.endDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.estimatedManpower}</TableCell>
                    <TableCell><Pill value={w.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {d.workOrders.items.length === 0 && <EmptyRow text="No work orders yet." />}
          </div>
        </TabsContent>

        <TabsContent value="sanctions" className="mt-3 space-y-4">
          <Panel title="Sanction requests and decisions"><SanctionTable rows={d.sanctions} onChanged={load} /></Panel>
          {c.suspensionHistory.length > 0 && (
            <Panel title="Status history (on the contractor record)">
              <ol className="space-y-1.5 text-sm">
                {c.suspensionHistory.map((h, i) => (
                  <li key={i} className="flex flex-wrap gap-2">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{fmtDate(h.at ?? h.date ?? null)}</span>
                    <span className="font-medium">{label(h.fromStatus ?? null)} → {label(h.toStatus ?? h.status ?? null)}</span>
                    <span className="text-slate-600">{h.reason ?? ""}</span>
                    {h.sanctionNo && <span className="text-xs text-slate-500">{h.sanctionNo}</span>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </TabsContent>
      </Tabs>

      <RenewDialog open={renewOpen} onOpenChange={setRenewOpen} contractorId={c.id} plants={plants} defaultEmail={c.contactEmail ?? c.representativeEmail ?? ""}
                   onDone={load} />
      <RequestSanctionDialog open={sanctionOpen} onOpenChange={setSanctionOpen} contractorId={c.id} contractorName={c.name} currentStatus={status}
                             plants={plants} meta={meta} defaultPlantId={plants[0]?.id ?? null} evidenceOptions={evidence} onSaved={load} />
      <DocumentUploadDialog
        open={uploadOpen} onOpenChange={setUploadOpen} docTypes={meta?.docTypes ?? ["OTHER"]}
        getUploadUrl={(file) => csmFetch("/api/csm/documents/upload-url", { method: "POST", json: { contractorCompanyId: c.id, fileName: file.name, mimeType: file.type, fileSize: file.size } })}
        record={async (m) => { await csmFetch("/api/csm/documents", { method: "POST", json: { ...m, contractorCompanyId: c.id } }); }}
        onDone={() => { toast({ variant: "success", title: "Document uploaded" }); load(); }}
      />
    </div>
  );
}

function RecentTable({ title, rows, cols, href }: { title: string; rows: Record<string, any>[]; cols: [string, string][]; href?: (r: Record<string, any>) => string }) {
  const fmt = (k: string, v: any) => (v === null || v === undefined ? "—" : /At$|date$|^date|validFrom/.test(k) ? fmtDate(v) : typeof v === "string" && /^[A-Z_]+$/.test(v) ? label(v) : String(v));
  return (
    <Panel title={title}>
      {rows.length === 0 ? <p className="text-xs text-slate-400">None in the window.</p> : (
        <Table className="text-xs">
          <TableHeader><TableRow>{cols.map(([, h]) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                {cols.map(([k], i) => (
                  <TableCell key={k}>{i === 0 && href ? <LinkButton href={href(r)}>{fmt(k, r[k])}</LinkButton> : fmt(k, r[k])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function WorkersPanel({ contractorId, workers, onChanged }: { contractorId: string; workers: Worker[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [medFor, setMedFor] = useState<Worker | null>(null);
  const [until, setUntil] = useState("");
  const [doctor, setDoctor] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveMedical() {
    if (!medFor || !until) return;
    setBusy(true);
    try {
      await csmFetch(`/api/csm/contractors/${contractorId}/workers/${medFor.id}/medical`, {
        method: "POST", json: { validUntil: dateToIso(until), doctorName: doctor || null },
      });
      toast({ variant: "success", title: `Medical fitness recorded for ${medFor.fullName}` });
      setMedFor(null);
      onChanged();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not record", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Worker register" action={<span className="text-[11px] text-slate-500">Add workers from a work order&apos;s roster</span>}>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px] text-sm">
          <TableHeader><TableRow><TableHead>Worker</TableHead><TableHead>Trade</TableHead><TableHead>Medical fitness</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {workers.map((w) => (
              <TableRow key={w.id}>
                <TableCell><div className="font-medium">{w.fullName}</div><div className="text-[11px] text-slate-500">{w.workerCode}{w.mobileNumber ? ` · ${w.mobileNumber}` : ""}</div></TableCell>
                <TableCell className="text-xs">{w.primaryTrade ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(w.currentMedicalValidUntil)} {w.medicalState !== "OK" && <Pill value={w.medicalState} />}</TableCell>
                <TableCell className="text-xs">{label(w.overallStatus)}{w.rosterStatus !== "active" && <> · <Pill value="BLOCKED" text={label(w.rosterStatus)} /></>}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => { setMedFor(w); setUntil(""); setDoctor(""); }}>Record medical</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {workers.length === 0 && <EmptyRow text="No workers registered." />}
      </div>
      <Dialog open={!!medFor} onOpenChange={(v) => !v && setMedFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Medical fitness · {medFor?.fullName}</DialogTitle>
            <DialogDescription>Recorded on the worker; the gate check reads it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Fit until" required><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
            <Field label="Examined by"><Input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Doctor / OHC" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMedFor(null)}>Cancel</Button>
            <Button disabled={busy || !until} onClick={saveMedical}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function RenewDialog({ open, onOpenChange, contractorId, plants, defaultEmail, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; contractorId: string; plants: PlantOption[]; defaultEmail: string; onDone: () => void;
}) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [invite, setInvite] = useState(true);
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ prequalificationId: string; applicationNo: string; invite: { portalPath: string; expiresAt: string } | null } | null>(null);

  useEffect(() => { if (open) { setPlantId(plants[0]?.id ?? ""); setInvite(true); setEmail(defaultEmail); setError(null); setDone(null); } }, [open, plants, defaultEmail]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<{ prequalificationId: string; applicationNo: string; invite: { portalPath: string; expiresAt: string } | null }>(
        `/api/csm/contractors/${contractorId}/renew`, { method: "POST", json: { plantId, sendInvite: invite, contactEmail: email || null } });
      setDone(r);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Could not start the renewal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renewal / re-prequalification</DialogTitle>
          <DialogDescription>Opens a fresh application on the active questionnaire. The current qualification stays in force until it expires or the new one is decided.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">{done.applicationNo} is open.</p>
            {done.invite && <InviteLinkBox portalPath={done.invite.portalPath} expiresAt={done.invite.expiresAt} contactEmail={email} />}
            <DialogFooter>
              <LinkButton href={`/csm/prequalifications/${done.prequalificationId}`} variant="outline" size="default">Open application</LinkButton>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
              <div className="flex items-center gap-2">
                <Checkbox id="renew-invite" checked={invite} onCheckedChange={(v) => setInvite(v === true)} />
                <Label htmlFor="renew-invite" className="text-sm font-normal">Send the contractor a link to fill it</Label>
              </div>
              {invite && <Field label="Contact email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
              <ErrorBox error={error} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !plantId}>{busy ? "Opening…" : "Start"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
