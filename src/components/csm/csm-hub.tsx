"use client";

// CSM hub: the prequalification pipeline by stage, qualification and work-order
// KPIs, what is expiring, and the approvals waiting on someone.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { csmFetch, fmtDate, label, qs, type ExpiringData, type Hub, type PlantOption, type Sanction } from "@/lib/csm/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, LinkButton, Panel, Pill, PlantSelect, plantParam, Tile } from "./shared";
import { SanctionTable } from "./sanctions";

const STAGES = [
  { key: "DRAFT", text: "Being filled", hint: "Contractor link issued or HSE entering" },
  { key: "SUBMITTED", text: "Submitted", hint: "Waiting for HSE to pick up" },
  { key: "HSE_REVIEW", text: "HSE review", hint: "Scoring and overrides" },
  { key: "APPROVAL", text: "Plant head approval", hint: "Recommendation made" },
  { key: "QUALIFIED", text: "Qualified", hint: "" },
  { key: "CONDITIONAL", text: "Conditional", hint: "" },
  { key: "REJECTED", text: "Rejected", hint: "" },
];

export function CsmHubView({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [hub, setHub] = useState<Hub | null>(null);
  const [exp, setExp] = useState<ExpiringData | null>(null);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = qs({ plantId: plantParam(plant) });
      const [h, e, s] = await Promise.all([
        csmFetch<Hub>(`/api/csm/dashboard${p}`),
        csmFetch<ExpiringData>(`/api/csm/expiring${p}`),
        csmFetch<{ items: Sanction[] }>(`/api/csm/sanctions${qs({ plantId: plantParam(plant), status: "PENDING_APPROVAL" })}`),
      ]);
      setHub(h); setExp(e); setSanctions(s.items); setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the CSM hub");
    } finally {
      setLoading(false);
    }
  }, [plant]);

  useEffect(() => { load(); }, [load]);

  const h = hub;
  const maxStage = Math.max(1, ...STAGES.map((s) => h?.pipeline[s.key] ?? 0));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={cn(loading && "animate-spin")} /> Refresh
        </Button>
        <div className="ml-auto flex gap-2">
          <LinkButton href="/csm/contractors?register=1" variant="default">Register contractor</LinkButton>
          <LinkButton href="/csm/work-orders?new=1" variant="outline">Raise work order</LinkButton>
        </div>
      </div>
      <ErrorBox error={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile title="Qualified" value={h?.qualification.qualified ?? "—"} tone="good" href="/csm/contractors?qualification=QUALIFIED" />
        <Tile title="Conditional" value={h?.qualification.conditional ?? "—"} tone={h?.qualification.conditional ? "warn" : undefined} href="/csm/contractors?qualification=CONDITIONAL" />
        <Tile title="Qualification expired" value={h?.qualification.expired ?? "—"} tone={h?.qualification.expired ? "bad" : undefined} href="/csm/contractors?qualification=EXPIRED" />
        <Tile title="Suspended / blacklisted" value={h ? `${h.qualification.suspended} / ${h.qualification.blacklisted}` : "—"} tone={h && h.qualification.blacklisted ? "bad" : undefined} />
        <Tile title="Active work orders" value={h?.workOrders.ACTIVE ?? "—"} sub={h ? `${h.workOrders.SUSPENDED ?? 0} suspended` : undefined} href="/csm/work-orders?status=LIVE" />
        <Tile title="Workers cleared on site" value={h?.workOrders.workersOnSite ?? "—"} />
        <Tile title="Awaiting HSE review" value={h?.approvals.reviews ?? "—"} tone={h?.approvals.reviews ? "warn" : undefined} href="/csm/prequalifications?status=OPEN" />
        <Tile title="Awaiting approval" value={h?.approvals.prequalifications ?? "—"} tone={h?.approvals.prequalifications ? "warn" : undefined} href="/csm/prequalifications?status=APPROVAL" />
        <Tile title="Sanctions to approve" value={h?.approvals.sanctions ?? "—"} tone={h?.approvals.sanctions ? "warn" : undefined} />
        <Tile title="Evaluations (90 days)" value={h?.evaluations.last90Days ?? "—"} sub={h ? `${h.evaluations.awaitingSignOff} awaiting sign-off` : undefined} href="/csm/evaluations" />
        <Tile title="Average evaluation" value={h?.evaluations.averageScore ?? "—"} sub="signed off, last 90 days" />
        <Tile title="Documents expiring" value={h ? `${h.expiring.docsExpired} / ${h.expiring.docsDue}` : "—"} sub="expired / within 30 days" tone={h?.expiring.docsExpired ? "bad" : h?.expiring.docsDue ? "warn" : undefined} />
      </div>

      <Panel title="Prequalification pipeline">
        <div className="grid gap-2">
          {STAGES.map((s) => {
            const v = h?.pipeline[s.key] ?? 0;
            return (
              <div key={s.key} className="grid grid-cols-[180px_1fr_48px] items-center gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.text}</div>
                  {s.hint && <div className="text-[11px] text-slate-500">{s.hint}</div>}
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", s.key === "REJECTED" ? "bg-rose-400" : ["QUALIFIED", "CONDITIONAL"].includes(s.key) ? "bg-emerald-500" : "bg-primary-600")}
                       style={{ width: `${(100 * v) / maxStage}%` }} />
                </div>
                <LinkButton href={`/csm/prequalifications?status=${s.key}`}>{v}</LinkButton>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Prequalification expiring (30 days)">
          <Table className="text-sm">
            <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Valid until</TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(exp?.prequalifications ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <LinkButton href={`/csm/contractors/${p.contractorCompanyId}`}>{p.contractorName ?? p.applicationNo}</LinkButton>
                    <div className="text-[11px] text-slate-500">{p.applicationNo} · {p.plantName ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(p.validUntil)}</TableCell>
                  <TableCell><Pill value={p.state} /></TableCell>
                  <TableCell className="text-right text-xs">
                    {p.renewalInProgress ? <span className="text-slate-500">Renewal in progress</span>
                      : <LinkButton href={`/csm/contractors/${p.contractorCompanyId}?renew=1`} variant="outline">Start renewal</LinkButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {exp && exp.prequalifications.length === 0 && <EmptyRow text="Nothing expiring in the next 30 days." />}
        </Panel>
        <Panel title="Documents expiring (30 days)">
          <Table className="text-sm">
            <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Document</TableHead><TableHead>Valid until</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
            <TableBody>
              {(exp?.documents ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell><LinkButton href={`/csm/contractors/${d.contractorCompanyId}`}>{d.contractorName ?? "Contractor"}</LinkButton></TableCell>
                  <TableCell className="text-xs">{label(d.docType)}<div className="text-[11px] text-slate-500">{d.title || d.fileName}</div></TableCell>
                  <TableCell className="text-xs">{fmtDate(d.expiresOn)}</TableCell>
                  <TableCell><Pill value={d.state} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {exp && exp.documents.length === 0 && <EmptyRow text="No documents expiring in the next 30 days." />}
        </Panel>
      </div>

      <Panel title="Sanctions awaiting approval">
        <SanctionTable rows={sanctions} onChanged={load} showContractor />
      </Panel>
    </div>
  );
}
