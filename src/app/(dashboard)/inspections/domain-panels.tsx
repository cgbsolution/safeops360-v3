// Inspection analytics that the Analytics Screen Contract does not model.
//
// The contract covers the inspection LIFECYCLE — open, opened-in-window,
// closure time, overdue, trend, ageing, breakdowns — from the shared flow
// engine, so the old page's Completed / In-progress / Overdue tiles are gone:
// they were the same numbers computed a second way, and two ways of counting
// "overdue" is how two screens come to disagree.
//
// What survives is what the contract genuinely cannot see, because it lives in
// other tables: equipment-level statutory exposure (EquipmentInspectionType),
// findings raised BY inspections (InspectionFinding), pass/fail by inspection
// type, and inspector workload. Those keep their own panel below the contract.
//
// The two tiles here wear ContextKPI like every other number on the platform,
// including its explicit "no prior period data" row — these two counts are
// point-in-time forward-looking exposure with nothing to compare against, and
// saying so is the contract working, not a gap in it.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ContextKPI } from "@/components/analytics/contract";
import { INK, NAVY, severityStep, STATUS } from "@/lib/design/midnight";

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={"rounded-xl border bg-white p-4 " + className}
      style={{ borderColor: NAVY[200] }}
    >
      <h3 className="text-sm font-semibold" style={{ color: INK.strong }}>
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: INK.faint }}>
          {subtitle}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CountRow({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const step = tone ? severityStep(tone) : null;
  return (
    <li className="flex items-baseline justify-between py-1.5">
      <span className="flex items-center gap-1.5 text-[12px]" style={{ color: INK.base }}>
        {step && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: step.bar }}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: INK.strong }}>
        {value}
      </span>
    </li>
  );
}

export async function InspectionDomainPanels() {
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  const [
    inspectionsByType,
    findingsBySeverity,
    findingsByStatus,
    overdueEquipment,
    statutoryDue,
    inspectorLeaders,
  ] = await Promise.all([
    prisma.inspection.findMany({
      where: { createdAt: { gte: sixtyDaysAgo }, inspectionTypeId: { not: null } },
      select: {
        inspectionTypeId: true,
        result: true,
        inspectionType: { select: { name: true, isStatutory: true } },
      },
    }),
    prisma.inspectionFinding.groupBy({ by: ["severity"], _count: true }),
    prisma.inspectionFinding.groupBy({ by: ["status"], _count: true }),
    prisma.equipmentInspectionType.count({
      where: { isActive: true, nextInspectionDue: { lt: now } },
    }),
    prisma.equipmentInspectionType.count({
      where: {
        isActive: true,
        inspectionType: { isStatutory: true },
        nextInspectionDue: { lt: new Date(now.getTime() + 30 * 86400000) },
      },
    }),
    prisma.inspection.groupBy({
      by: ["inspectorId"],
      where: {
        status: "COMPLETED",
        completedDate: { gte: sixtyDaysAgo },
        inspectorId: { not: null },
      },
      _count: true,
      orderBy: { _count: { inspectorId: "desc" } },
      take: 5,
    }),
  ]);

  const leaderUsers = inspectorLeaders.length
    ? await prisma.user.findMany({
        where: { id: { in: inspectorLeaders.map((l) => l.inspectorId!) } },
        select: { id: true, name: true },
      })
    : [];
  const leaderName = new Map(leaderUsers.map((u) => [u.id, u.name]));

  const typeAgg = new Map<
    string,
    { name: string; isStatutory: boolean; total: number; pass: number; fail: number; partial: number }
  >();
  for (const i of inspectionsByType) {
    if (!i.inspectionTypeId) continue;
    const prev = typeAgg.get(i.inspectionTypeId) ?? {
      name: i.inspectionType?.name ?? "Not recorded",
      isStatutory: i.inspectionType?.isStatutory ?? false,
      total: 0,
      pass: 0,
      fail: 0,
      partial: 0,
    };
    prev.total++;
    if (i.result === "Pass") prev.pass++;
    else if (i.result === "Fail") prev.fail++;
    else if (i.result === "Partial") prev.partial++;
    typeAgg.set(i.inspectionTypeId, prev);
  }
  const typeRows = [...typeAgg.values()].sort((a, b) => b.total - a.total);

  const cnt = (rows: { _count: any }[], key: string, value: string) =>
    (rows.find((r: any) => r[key] === value)?._count as number) ?? 0;
  const totalFindings = findingsBySeverity.reduce((a, r: any) => a + (r._count ?? 0), 0);

  return (
    <>
      <h2
        className="mb-3 mt-1 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Equipment &amp; findings — beyond the inspection lifecycle
      </h2>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <ContextKPI
          label="Equipment past its inspection date"
          value={overdueEquipment}
          /* No comparator exists: this is a forward-looking count of equipment
             state right now, and no prior-period snapshot is stored. The
             contract requires the row to say so rather than be dropped. */
          deltaValue={undefined}
          hint="active equipment whose next inspection is already due"
          href="/inspections"
        />
        <ContextKPI
          label="Statutory inspections due within 30 days"
          value={statutoryDue}
          deltaValue={undefined}
          hint="statutory types only — the ones a regulator asks about"
          href="/inspections"
        />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Panel
          title="Findings raised by inspections — by severity"
          subtitle={`All time. ${totalFindings} findings on record.`}
        >
          {totalFindings === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No inspection findings recorded yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: NAVY[100] }}>
              <CountRow label="Critical" value={cnt(findingsBySeverity, "severity", "CRITICAL")} tone="CRITICAL" />
              <CountRow label="High" value={cnt(findingsBySeverity, "severity", "HIGH")} tone="HIGH" />
              <CountRow label="Medium" value={cnt(findingsBySeverity, "severity", "MEDIUM")} tone="MEDIUM" />
              <CountRow label="Low" value={cnt(findingsBySeverity, "severity", "LOW")} tone="LOW" />
            </ul>
          )}
        </Panel>

        <Panel title="Findings — by state" subtitle="Where the inspection findings currently sit.">
          {findingsByStatus.length === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No inspection findings recorded yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: NAVY[100] }}>
              {findingsByStatus.map((r: any) => (
                <CountRow
                  key={String(r.status)}
                  label={String(r.status ?? "Not recorded")
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/^\w/, (c) => c.toUpperCase())}
                  value={r._count ?? 0}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Panel
          title="Pass rate by inspection type"
          subtitle="Last 60 days. A type that fails repeatedly is a control problem, not an inspection problem."
        >
          {typeRows.length === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No typed inspections completed in the last 60 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {typeRows.map((t) => {
                const pct = t.total ? Math.round((t.pass / t.total) * 100) : 0;
                return (
                  <li key={t.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[12px]" style={{ color: INK.base }}>
                        {t.name}
                        {t.isStatutory && (
                          <span
                            className="ml-1.5 rounded border px-1 py-0.5 text-[9px] uppercase"
                            style={{
                              borderColor: STATUS.medium.line,
                              color: STATUS.medium.ink,
                              backgroundColor: STATUS.medium.tint,
                            }}
                          >
                            statutory
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums" style={{ color: INK.muted }}>
                        {pct}% pass · {t.total} done
                        {t.fail > 0 && (
                          <span style={{ color: STATUS.high.ink }}> · {t.fail} fail</span>
                        )}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: NAVY[100] }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(pct, t.total ? 1.5 : 0)}%`,
                          backgroundColor: NAVY[600],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Inspections completed by inspector"
          subtitle="Last 60 days. Concentration here is usually a resourcing signal."
        >
          {inspectorLeaders.length === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No completed inspections in the last 60 days.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: NAVY[100] }}>
              {inspectorLeaders.map((l) => (
                <li key={l.inspectorId} className="flex items-baseline justify-between py-2">
                  {/* House rule: a name, never a user cuid. */}
                  <span className="text-[13px]" style={{ color: INK.base }}>
                    {leaderName.get(l.inspectorId!) ?? "Unknown inspector"}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: INK.muted }}>
                    {(l as any)._count} completed
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="mb-4 text-[11px]" style={{ color: INK.faint }}>
        Findings raised by inspections are managed on the{" "}
        <Link href="/inspections/findings" className="underline" style={{ color: NAVY[700] }}>
          Findings register
        </Link>
        .
      </p>
    </>
  );
}
