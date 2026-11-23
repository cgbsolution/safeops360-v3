"use client";

// Process Safety hub: live KPIs from GET /api/pha/dashboard (no sample data) and
// the entry points to every process safety register. The PSSR, chemicals, PSI
// document and chemical advisor screens are separate modules; this page only
// links to them.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock, ClipboardCheck, FileSearch, FlaskConical, FolderOpen, MessagesSquare, RefreshCw, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtDate, label, phaFetch, qs, type PhaDashboard, type PlantOption } from "@/lib/pha/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, StatusBadge, plantParam } from "./shared";

type Tone = "good" | "warn" | "bad" | undefined;

function Kpi({ title, value, sub, tone, href }: { title: string; value: React.ReactNode; sub?: string; tone?: Tone; href?: string }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  const body = (
    <div className="flex h-full w-full flex-col items-start rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-primary-400 hover:shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
  if (!href) return body;
  return (
    <Button asChild variant="bare" size="bare" className="h-full w-full">
      <Link href={href}>{body}</Link>
    </Button>
  );
}

const MODULES: { href: string; title: string; description: string; icon: LucideIcon }[] = [
  { href: "/process-safety/hazop", title: "PHA / HAZOP Studies", icon: FileSearch,
    description: "HAZOP, What-If and HAZID studies: nodes, guideword worksheet, risk ranking, recommendations and revalidation." },
  { href: "/process-safety/pssr", title: "Pre-Startup Safety Review", icon: ClipboardCheck,
    description: "PSSR checklists before commissioning or restart after a change." },
  { href: "/process-safety/chemicals", title: "Chemical Register", icon: FlaskConical,
    description: "Hazardous chemicals on site, quantities, storage and safety data sheets." },
  { href: "/process-safety/psi-documents", title: "Process Safety Information", icon: FolderOpen,
    description: "P&IDs, PFDs, design basis and other controlled process safety documents." },
  { href: "/process-safety/chem-advisor", title: "Chemical Advisor", icon: MessagesSquare,
    description: "Ask about chemical hazards, compatibility and handling precautions." },
];

export function ProcessSafetyHub({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState<string>(defaultPlantId ?? ALL_PLANTS);
  const [data, setData] = useState<PhaDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await phaFetch<PhaDashboard>(`/api/pha/dashboard${qs({ plantId: plantParam(plant) })}`);
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message ?? "Could not load process safety KPIs");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [plant]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.studiesByStatus ?? {};
  const reg = (status?: string) => `/process-safety/hazop${qs({ status, plantId: plantParam(plant) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
        </Button>
      </div>
      <ErrorBox error={error} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">PHA studies</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Kpi title="Total studies" value={data ? data.studiesTotal : "—"} href={reg()} />
          <Kpi title="Draft" value={data ? s.DRAFT ?? 0 : "—"} href={reg("DRAFT")} />
          <Kpi title="In progress" value={data ? s.IN_PROGRESS ?? 0 : "—"} href={reg("IN_PROGRESS")} />
          <Kpi title="Under review" value={data ? s.UNDER_REVIEW ?? 0 : "—"} tone={(s.UNDER_REVIEW ?? 0) > 0 ? "warn" : undefined} href={reg("UNDER_REVIEW")} />
          <Kpi title="Approved" value={data ? s.APPROVED ?? 0 : "—"} tone="good" href={reg("APPROVED")} />
          <Kpi title="Closed" value={data ? s.CLOSED ?? 0 : "—"} href={reg("CLOSED")} />
          <Kpi title="Open recommendations" value={data ? data.openRecommendations : "—"} tone={data && data.openRecommendations > 0 ? "warn" : "good"} />
          <Kpi title="Overdue recommendations" value={data ? data.overdueRecommendations : "—"} tone={data && data.overdueRecommendations > 0 ? "bad" : "good"} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recently updated studies</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table className="text-sm">
                <TableHeader className="bg-slate-50">
                  <TableRow><TableHead>Study</TableHead><TableHead>Method</TableHead><TableHead>Plant / unit</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.recentStudies ?? []).map((st) => (
                    <TableRow key={st.id}>
                      <TableCell>
                        <Button asChild variant="link" size="sm" className="h-auto p-0">
                          <Link href={`/process-safety/hazop/${st.id}`}>{st.studyNo}</Link>
                        </Button>
                        <div className="text-xs text-slate-600">{st.title}</div>
                      </TableCell>
                      <TableCell className="text-xs">{st.methodLabel}</TableCell>
                      <TableCell className="text-xs">{st.plantName ?? "—"}{st.unit ? ` · ${st.unit}` : ""}</TableCell>
                      <TableCell><StatusBadge status={st.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data && data.recentStudies.length === 0 && <EmptyRow text="No PHA studies yet. Start one from the HAZOP register." />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><CalendarClock size={15} /> Revalidation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Kpi title="Overdue" value={data ? data.revalidationOverdue : "—"} tone={data && data.revalidationOverdue > 0 ? "bad" : "good"} />
              <Kpi title={`Due in ${data?.revalidationWindowDays ?? 180} days`} value={data ? data.revalidationDueSoon : "—"} tone={data && data.revalidationDueSoon > 0 ? "warn" : undefined} />
            </div>
            <div className="space-y-1.5">
              {(data?.revalidationQueue ?? []).map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-xs">
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link href={`/process-safety/hazop/${st.id}`}>{st.studyNo}</Link>
                  </Button>
                  <span className="text-slate-500">{fmtDate(st.revalidationDueDate)}</span>
                  {st.revalidationState && <StatusBadge status={st.revalidationState} />}
                </div>
              ))}
              {data && data.revalidationQueue.length === 0 && <p className="text-xs text-slate-400">No approved studies yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Process safety registers</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {MODULES.map((m) => (
            <Button key={m.href} asChild variant="bare" size="bare" className="h-full">
              <Link href={m.href} className="flex h-full flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-primary-400 hover:shadow-sm">
                <m.icon size={20} className="text-primary-700" />
                <span className="text-sm font-semibold text-slate-900">{m.title}</span>
                <span className="whitespace-normal text-xs font-normal text-slate-500">{m.description}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>
      {data && (
        <p className="text-[11px] text-slate-400">
          Studies by method: {Object.entries(data.studiesByMethod).map(([k, v]) => `${label(k)} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
