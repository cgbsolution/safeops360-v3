import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FireNav, FireStatusBadge } from "@/components/fire/shared";
import { fireLabel, type FireDashboard } from "@/lib/fire/api";

export const dynamic = "force-dynamic";

const TILE = "rounded-xl border border-slate-200 bg-white p-4";
const STATUS_ORDER = ["ACTIVE", "DUE_INSPECTION", "OVERDUE", "DEFECTIVE", "OUT_OF_SERVICE", "DECOMMISSIONED"];

function Kpi({ label, value, tone, sub, href }: { label: string; value: number; tone?: string; sub?: string; href?: string }) {
  const color = tone === "critical" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-2xl font-bold tabular-nums " + color}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={TILE + " block hover:border-slate-300"}>{body}</Link>
  ) : (
    <div className={TILE}>{body}</div>
  );
}

export default async function FireSafetyPage() {
  let d: FireDashboard | null = null;
  let error: string | null = null;
  try {
    d = await backendFetch<FireDashboard>("/api/fire/dashboard");
  } catch (e: any) {
    error = e?.message ?? "Failed to load the fire safety dashboard";
  }

  return (
    <div>
      <PageHeader title="Fire Safety & Emergency Response"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety" }]}
        description="Fire equipment register, QR-code inspections against IS checklists, defects and CAPAs, assembly points, emergency plans and evacuation drills." />
      <FireNav />
      {error || !d ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi label="Total equipment" value={d.totalEquipment} href="/fire-safety/equipment" />
            <Kpi label="Overdue" value={d.overdue} tone={d.overdue ? "critical" : "good"} href="/fire-safety/due" />
            <Kpi label="Due in 30 days" value={d.dueThisMonth} tone="warn" href="/fire-safety/due" />
            <Kpi label="Defective" value={d.defective} tone={d.defective ? "critical" : "good"} href="/fire-safety/equipment?status=DEFECTIVE" />
            <Kpi label="Out of service" value={d.outOfService} tone={d.outOfService ? "warn" : "good"} href="/fire-safety/equipment?status=OUT_OF_SERVICE" />
            <Kpi label="Inspections (30 days)" value={d.inspectionsLast30} sub={`${d.scannedLast30} by QR scan`} href="/fire-safety/inspections" />
            <Kpi label="Failed (30 days)" value={d.failedLast30} tone={d.failedLast30 ? "warn" : "good"} sub={`${d.criticalFailsLast30} with a critical failure`} href="/fire-safety/inspections?result=FAIL" />
            <Kpi label="Drills this year" value={d.drillsCompletedThisYear} tone="good" href="/ims/mock-drills" />
            <Kpi label="Drills planned" value={d.drillsDue} tone="warn" href="/ims/mock-drills" />
            <Kpi label="Plans due review" value={d.plansReviewDue} tone={d.plansReviewDue > 0 ? "warn" : "good"} href="/emergency-response" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={TILE}>
              <div className="mb-2 text-sm font-semibold text-slate-800">Equipment by status</div>
              {Object.keys(d.byStatus).length === 0 ? (
                <div className="text-sm text-slate-400">No equipment registered yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {STATUS_ORDER.filter((s) => d!.byStatus[s]).map((s) => (
                    <Link key={s} href={`/fire-safety/equipment?status=${s}`} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                      <FireStatusBadge status={s} />
                      <span className="ml-auto font-semibold tabular-nums text-slate-800">{d!.byStatus[s]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className={TILE}>
              <div className="mb-2 flex items-center text-sm font-semibold text-rose-700">
                Overdue equipment
                <Button asChild size="sm" variant="ghost" className="ml-auto"><Link href="/fire-safety/due">Due list</Link></Button>
              </div>
              {d.overdueItems.length === 0 ? (
                <div className="text-sm text-slate-400">Nothing overdue.</div>
              ) : (
                <div className="space-y-1">
                  {d.overdueItems.map((e) => (
                    <Link key={e.id} href={`/fire-safety/equipment/${e.id}`} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <span className="font-medium text-primary-700">{e.equipmentCode}</span>
                      <span className="truncate text-xs text-slate-500">{fireLabel(e.type)} · {e.location}</span>
                      <span className="ml-auto text-[11px] text-rose-600">due {e.nextInspectionDueDate ? new Date(e.nextInspectionDueDate).toLocaleDateString("en-IN") : "—"}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
