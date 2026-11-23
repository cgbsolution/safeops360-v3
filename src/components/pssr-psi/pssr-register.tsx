"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, label, psFetch, qs, type PlantOption, type PssrItem, type PssrMeta, type PssrReviewRow } from "@/lib/pssr-psi/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, plantParam, Stat, Tag } from "./shared";

const ANY = "__any__";

export function PssrRegister({ plants, meta, defaultPlantId }: { plants: PlantOption[]; meta: PssrMeta | null; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Button asChild size="sm" className="ml-auto">
          <Link href="/process-safety/pssr/new"><Plus size={14} className="mr-1" /> New PSSR</Link>
        </Button>
      </div>
      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="punch">Punch list</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews"><Reviews plant={plant} meta={meta} /></TabsContent>
        <TabsContent value="punch"><PunchList plant={plant} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Reviews({ plant, meta }: { plant: string; meta: PssrMeta | null }) {
  const [status, setStatus] = useState(ANY);
  const [trigger, setTrigger] = useState(ANY);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PssrReviewRow[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await psFetch<{ items: PssrReviewRow[]; byStatus: Record<string, number> }>(
        `/api/pssr/reviews${qs({ plantId: plantParam(plant), status: status === ANY ? undefined : status, trigger: trigger === ANY ? undefined : trigger, q: q.trim() || undefined })}`
      );
      setRows(r.items);
      setByStatus(r.byStatus);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the PSSR register");
    }
  }, [plant, status, trigger, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mt-3">
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="In progress" value={(byStatus.DRAFT ?? 0) + (byStatus.IN_PROGRESS ?? 0)} />
        <Stat label="Pending sign-off" value={byStatus.PENDING_APPROVAL ?? 0} tone="warn" />
        <Stat label="No-go" value={byStatus.NO_GO ?? 0} tone="bad" />
        <Stat label="Approved: GO" value={byStatus.APPROVED_GO ?? 0} tone="ok" />
        <Stat label="Closed" value={byStatus.CLOSED ?? 0} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus} className="h-9 w-48" aria-label="Status">
          <SelectItem value={ANY}>All statuses</SelectItem>
          <SelectItem value="OPEN">Open (not decided)</SelectItem>
          {(meta?.statuses ?? []).map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
        </Select>
        <Select value={trigger} onValueChange={setTrigger} className="h-9 w-56" aria-label="Trigger">
          <SelectItem value={ANY}>All triggers</SelectItem>
          {(meta?.triggers ?? []).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search no., title, unit, MOC" className="h-9 w-64" />
        <span className="text-xs text-slate-500">{rows.length} review(s)</span>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1050px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>PSSR no.</TableHead><TableHead>Title</TableHead><TableHead>Trigger</TableHead><TableHead>MOC</TableHead>
              <TableHead>Planned start-up</TableHead><TableHead>Leader</TableHead><TableHead className="text-right">Checklist</TableHead>
              <TableHead className="text-right">Open punch A / B</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Link href={`/process-safety/pssr/${r.id}`} className="font-medium text-primary-700 hover:underline">{r.pssrNo}</Link></TableCell>
                <TableCell>
                  {r.title}
                  <div className="text-[11px] text-slate-500">{[r.plantName, r.area, r.unit].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-xs">{label(r.trigger)}</TableCell>
                <TableCell className="text-xs">
                  {r.mocId ? <Link href={`/moc/${r.mocId}`} className="text-primary-700 hover:underline">{r.mocNumber ?? "MOC"}</Link> : "—"}
                </TableCell>
                <TableCell className="text-xs">{fmtDate(r.plannedStartupDate)}</TableCell>
                <TableCell className="text-xs">{r.leaderName ?? "—"}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.counts.answered ?? 0} / {r.counts.total ?? 0}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  <span className={(r.counts.punchAOpen ?? 0) > 0 ? "font-semibold text-rose-700" : ""}>{r.counts.punchAOpen ?? 0}</span>
                  {" / "}
                  <span className={(r.counts.punchBOpen ?? 0) > 0 ? "text-amber-700" : ""}>{r.counts.punchBOpen ?? 0}</span>
                </TableCell>
                <TableCell><Tag code={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No pre-startup safety reviews match this filter." />}
      </div>
    </div>
  );
}

function PunchList({ plant }: { plant: string }) {
  const [category, setCategory] = useState(ANY);
  const [status, setStatus] = useState("OPEN");
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [rows, setRows] = useState<PssrItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await psFetch<{ items: PssrItem[] }>(
        `/api/pssr/punch${qs({ plantId: plantParam(plant), category: category === ANY ? undefined : category, status: status === ANY ? undefined : status, mine, overdueOnly: overdue })}`
      );
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the punch list");
    }
  }, [plant, category, status, mine, overdue]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={setCategory} className="h-9 w-52" aria-label="Category">
          <SelectItem value={ANY}>Both categories</SelectItem>
          <SelectItem value="A">A: before start-up</SelectItem>
          <SelectItem value="B">B: may close after</SelectItem>
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-40" aria-label="Punch status">
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="OPEN">Open</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </Select>
        <Label className="flex items-center gap-2 text-xs text-slate-700"><Checkbox checked={mine} onCheckedChange={(v) => setMine(v === true)} /> Mine</Label>
        <Label className="flex items-center gap-2 text-xs text-slate-700"><Checkbox checked={overdue} onCheckedChange={(v) => setOverdue(v === true)} /> Overdue only</Label>
        <span className="text-xs text-slate-500">{rows.length} item(s)</span>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[950px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>PSSR</TableHead><TableHead>Punch item</TableHead><TableHead>Cat.</TableHead><TableHead>Owner</TableHead>
              <TableHead>Due</TableHead><TableHead>CAPA</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-xs">
                  <Link href={`/process-safety/pssr/${i.reviewId}`} className="font-medium text-primary-700 hover:underline">{i.pssrNo}</Link>
                  <div className="text-[11px] text-slate-500">{i.reviewTitle}</div>
                </TableCell>
                <TableCell>
                  {i.question}
                  {i.punchDescription && <div className="text-[11px] text-slate-500">{i.punchDescription}</div>}
                </TableCell>
                <TableCell><Tag code={i.punchCategory} /></TableCell>
                <TableCell className="text-xs">{i.punchOwnerName ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(i.punchDueDate)} {i.punchOverdue && <Tag code="OVERDUE" text="Overdue" />}</TableCell>
                <TableCell className="text-xs">{i.capaNumber ?? "—"}</TableCell>
                <TableCell><Tag code={i.punchStatus} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No punch items match this filter." />}
      </div>
    </div>
  );
}
