// Emergency Response: one screen over the live emergency-preparedness records:
// fire equipment readiness (/api/fire/dashboard), mock drills (/api/fire/drills,
// managed at /ims/mock-drills), assembly points and emergency plans. Every
// figure comes from the backend; empty registers say so.

import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Flame, MapPin, ScrollText, Siren } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FireStatusBadge } from "@/components/fire/shared";
import { StatusBadge } from "@/components/ims/shared";
import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import { fmtDate, label } from "@/lib/ims/api";
import type { FireDrill } from "@/lib/ims/api";
import type { FireDashboard } from "@/lib/fire/api";

export const dynamic = "force-dynamic";

export const metadata = { title: "Emergency Response | SafeOps360" };

type AssemblyPoint = {
  id: string; code: string; name: string; plantId: string; plantName: string | null; capacity: number | null;
  wardenName: string | null; alternateWardenName: string | null; wardenUserId: string | null;
};
type Plan = {
  id: string; planCode: string; title: string; plantId: string; plantName: string | null; status: string;
  fireTypes: string[]; externalContacts: unknown[]; commandStructure: unknown[]; nextReviewDate: string | null;
  lastReviewDate: string | null;
};

async function safe<T>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await p, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? "Could not load" };
  }
}

const CARD = "rounded-xl border border-slate-200 bg-white p-4";

function SectionHead({ icon: Icon, title, href, linkLabel }: { icon: typeof Flame; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-500" />
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {href && (
        <Button asChild size="sm" variant="ghost" className="ml-auto"><Link href={href}>{linkLabel ?? "Open"}</Link></Button>
      )}
    </div>
  );
}

function Stat({ label: l, value, tone }: { label: string; value: number | string; tone?: "bad" | "warn" | "good" }) {
  const c = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</div>
      <div className={"text-xl font-bold tabular-nums " + c}>{value}</div>
    </div>
  );
}

function Failed({ what, error }: { what: string; error: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Could not load {what}: {error}</div>;
}

export default async function EmergencyResponsePage() {
  const [dash, drills, aps, plans, ctx] = await Promise.all([
    safe(backendFetch<FireDashboard>("/api/fire/dashboard")),
    safe(backendFetch<{ items: FireDrill[] }>("/api/fire/drills")),
    safe(backendFetch<{ items: AssemblyPoint[] }>("/api/fire/assembly-points")),
    safe(backendFetch<{ items: Plan[] }>("/api/fire/plans")),
    resolvePlantContext(null),
  ]);
  const plantName = Object.fromEntries(ctx.plants.map((p) => [p.id, p.name]));
  const now = Date.now();

  const drillItems = drills.data?.items ?? [];
  const planned = drillItems
    .filter((d) => d.status === "PLANNED")
    .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""));
  const overdueDrills = planned.filter((d) => d.scheduledDate && new Date(d.scheduledDate).getTime() < now);
  const completed = drillItems
    .filter((d) => d.status === "COMPLETED")
    .sort((a, b) => (b.conductedDate ?? "").localeCompare(a.conductedDate ?? ""));
  const lastDrill = completed[0] ?? null;
  const drillRows = [...planned.slice(0, 5), ...completed.slice(0, 5)];

  const planItems = plans.data?.items ?? [];
  const reviewDue = planItems.filter((p) => p.nextReviewDate && new Date(p.nextReviewDate).getTime() < now);
  const apItems = aps.data?.items ?? [];
  const noWarden = apItems.filter((a) => !a.wardenUserId);

  return (
    <div>
      <PageHeader
        title="Emergency Response"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Emergency Response" }]}
        description="Emergency preparedness at a glance: fire equipment readiness, mock drills, assembly points and emergency plans."
        action={
          <Button asChild size="sm"><Link href="/fire-safety/due"><ClipboardCheck size={14} /> Inspections due</Link></Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <SectionHead icon={Flame} title="Fire equipment readiness" href="/fire-safety" linkLabel="Fire safety" />
          {dash.error || !dash.data ? (
            <Failed what="fire equipment status" error={dash.error ?? "no data"} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Equipment" value={dash.data.totalEquipment} />
                <Stat label="Overdue" value={dash.data.overdue} tone={dash.data.overdue ? "bad" : "good"} />
                <Stat label="Defective" value={dash.data.defective} tone={dash.data.defective ? "bad" : "good"} />
                <Stat label="Out of service" value={dash.data.outOfService} tone={dash.data.outOfService ? "warn" : "good"} />
                <Stat label="Inspected (30 d)" value={dash.data.inspectionsLast30} />
                <Stat label="Failed (30 d)" value={dash.data.failedLast30} tone={dash.data.failedLast30 ? "warn" : undefined} />
              </div>
              {dash.data.totalEquipment > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(dash.data.byStatus).map(([s, n]) => (
                    <Link key={s} href={`/fire-safety/equipment?status=${s}`} className="inline-flex items-center gap-1 text-xs text-slate-600">
                      <FireStatusBadge status={s} /> {n}
                    </Link>
                  ))}
                </div>
              )}
              {dash.data.totalEquipment === 0 && (
                <p className="mt-3 text-sm text-slate-500">No fire equipment registered yet. Register assets in the equipment register.</p>
              )}
            </>
          )}
        </section>

        <section className={CARD}>
          <SectionHead icon={Siren} title="Mock drills" href="/ims/mock-drills" linkLabel="Schedule & close drills" />
          {drills.error ? (
            <Failed what="drills" error={drills.error} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Completed (all)" value={completed.length} tone={completed.length ? "good" : undefined} />
                <Stat label="Planned" value={planned.length} />
                <Stat label="Overdue" value={overdueDrills.length} tone={overdueDrills.length ? "bad" : "good"} />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {lastDrill
                  ? <>Last drill: <b>{lastDrill.drillCode}</b> ({label(lastDrill.drillType)}) on {fmtDate(lastDrill.conductedDate)}
                      {lastDrill.evacuationTimeMinutes != null && <>, evacuation {lastDrill.evacuationTimeMinutes} min{lastDrill.evacuationTargetMinutes != null ? ` against ${lastDrill.evacuationTargetMinutes} min target` : ""}</>}.</>
                  : "No drill has been completed yet."}
              </p>
            </>
          )}
        </section>
      </div>

      {!drills.error && drillRows.length > 0 && (
        <section className={CARD + " mt-4"}>
          <SectionHead icon={Siren} title="Upcoming and recent drills" />
          <div className="overflow-x-auto">
            <Table className="min-w-[720px] text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow><TableHead>Drill</TableHead><TableHead>Type</TableHead><TableHead>Plant</TableHead><TableHead>Scheduled</TableHead><TableHead>Conducted</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {drillRows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.drillCode}</TableCell>
                    <TableCell className="text-xs">{label(d.drillType)}</TableCell>
                    <TableCell className="text-xs">{plantName[d.plantId] ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(d.scheduledDate)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(d.conductedDate)}{d.outcome ? ` · ${label(d.outcome)}` : ""}</TableCell>
                    <TableCell><StatusBadge status={d.status} overdue={d.status === "PLANNED" && !!d.scheduledDate && new Date(d.scheduledDate).getTime() < now} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <SectionHead icon={MapPin} title="Assembly points" />
          {aps.error ? (
            <Failed what="assembly points" error={aps.error} />
          ) : apItems.length === 0 ? (
            <p className="text-sm text-slate-500">No assembly points recorded.</p>
          ) : (
            <>
              {noWarden.length > 0 && (
                <p className="mb-2 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} /> {noWarden.length} without a warden</p>
              )}
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader className="bg-slate-50">
                    <TableRow><TableHead>Point</TableHead><TableHead>Plant</TableHead><TableHead>Capacity</TableHead><TableHead>Warden / alternate</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {apItems.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell><span className="font-medium">{a.code}</span><div className="text-xs text-slate-500">{a.name}</div></TableCell>
                        <TableCell className="text-xs">{a.plantName ?? plantName[a.plantId] ?? "—"}</TableCell>
                        <TableCell className="text-xs tabular-nums">{a.capacity ?? "—"}</TableCell>
                        <TableCell className="text-xs">{a.wardenName ?? (a.wardenUserId ? "Assigned" : <span className="text-amber-700">None</span>)}{a.alternateWardenName ? ` / ${a.alternateWardenName}` : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        <section className={CARD}>
          <SectionHead icon={ScrollText} title="Emergency plans" />
          {plans.error ? (
            <Failed what="emergency plans" error={plans.error} />
          ) : planItems.length === 0 ? (
            <p className="text-sm text-slate-500">No emergency plans recorded.</p>
          ) : (
            <>
              {reviewDue.length > 0 && (
                <p className="mb-2 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} /> {reviewDue.length} past the review date</p>
              )}
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader className="bg-slate-50">
                    <TableRow><TableHead>Plan</TableHead><TableHead>Plant</TableHead><TableHead>Status</TableHead><TableHead>Next review</TableHead><TableHead>Contacts</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {planItems.map((p) => {
                      const due = !!p.nextReviewDate && new Date(p.nextReviewDate).getTime() < now;
                      return (
                        <TableRow key={p.id}>
                          <TableCell><span className="font-medium">{p.planCode}</span><div className="text-xs text-slate-500">{p.title}</div></TableCell>
                          <TableCell className="text-xs">{p.plantName ?? plantName[p.plantId] ?? "—"}</TableCell>
                          <TableCell className="text-xs">{label(p.status)}</TableCell>
                          <TableCell className={"text-xs " + (due ? "font-medium text-rose-700" : "")}>{fmtDate(p.nextReviewDate)}{due ? " (overdue)" : ""}</TableCell>
                          <TableCell className="text-xs tabular-nums">{Array.isArray(p.externalContacts) ? p.externalContacts.length : 0}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
