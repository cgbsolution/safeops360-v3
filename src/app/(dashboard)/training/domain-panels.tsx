// Training analytics that the Analytics Screen Contract does not model.
//
// The contract covers training ASSIGNMENTS — a flow with a lifecycle, a due
// date and a closure, served by the shared engine. Everything here is about
// CERTIFICATES, which is a different population answering a different question:
// not "was the assigned training done" but "is the workforce currently
// competent". Both belong on this screen; neither replaces the other, so the
// old page's certificate analysis is kept rather than deleted.
//
// What did go is the bespoke `StatCard` strip. Its numbers now wear ContextKPI
// like every other number on the platform — including, where no prior-period
// snapshot of certificate state exists, the explicit "no prior period data"
// row. Saying that out loud is the contract working.

import { prisma } from "@/lib/prisma";
import { ContextKPI, DataQualityFlag } from "@/components/analytics/contract";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";

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

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function TrainingDomainPanels() {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in60 = new Date(now.getTime() + 60 * 86400000);
  const in90 = new Date(now.getTime() + 90 * 86400000);

  const [
    statusCounts,
    statutoryActive,
    expiring30,
    expiring60,
    expiring90,
    effectivenessTotal,
    effectivenessReviewed,
    expiryPipeline,
    contractorWorkers,
    statutoryPrograms,
  ] = await Promise.all([
    prisma.trainingCertificate.groupBy({ by: ["status"], _count: true }),
    prisma.trainingCertificate.count({
      where: { status: "ACTIVE", program: { isStatutory: true } },
    }),
    prisma.trainingCertificate.count({
      where: { validTo: { gte: now, lt: in30 }, status: { in: ["ACTIVE", "EXPIRING_SOON"] } },
    }),
    prisma.trainingCertificate.count({
      where: { validTo: { gte: in30, lt: in60 }, status: { in: ["ACTIVE", "EXPIRING_SOON"] } },
    }),
    prisma.trainingCertificate.count({
      where: { validTo: { gte: in60, lt: in90 }, status: { in: ["ACTIVE", "EXPIRING_SOON"] } },
    }),
    prisma.trainingCertificate.count(),
    prisma.trainingCertificate.count({ where: { effectivenessReviewedAt: { not: null } } }),
    prisma.trainingCertificate.findMany({
      where: {
        validTo: { gte: now, lt: new Date(now.getTime() + 365 * 86400000) },
        status: { in: ["ACTIVE", "EXPIRING_SOON"] },
      },
      select: { validTo: true },
    }),
    prisma.contractorWorker.count(),
    prisma.trainingProgram.count({ where: { isStatutory: true } }),
  ]);

  const cnt = (v: string) =>
    (statusCounts.find((r: any) => r.status === v)?._count as number) ?? 0;
  const total = statusCounts.reduce((a, r: any) => a + (r._count ?? 0), 0);
  const active = cnt("ACTIVE");
  const activePct = total ? Math.round((active / total) * 100) : 0;

  const buckets = new Map<string, number>();
  for (const c of expiryPipeline) {
    if (!c.validTo) continue;
    const d = new Date(c.validTo);
    buckets.set(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      (buckets.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`) ?? 0) + 1
    );
  }
  const pipeline = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxMonth = Math.max(1, ...pipeline.map(([, n]) => n));

  return (
    <>
      <h2
        className="mb-3 mt-1 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Competency &amp; certificates — is the workforce currently qualified
      </h2>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContextKPI
          label="Certificates in force"
          value={active}
          /* Certificate state is a point-in-time fact and no historical
             snapshot is stored, so there is genuinely nothing to compare
             against. The contract prints that rather than dropping the row. */
          deltaValue={undefined}
          hint={`${activePct}% of ${total} certificates on record`}
        />
        <ContextKPI
          label="Statutory certificates in force"
          value={statutoryActive}
          deltaValue={undefined}
          hint={`across ${statutoryPrograms} statutory programmes`}
        />
        <ContextKPI
          label="Expiring within 30 days"
          value={expiring30}
          deltaValue={undefined}
          hint={`${expiring60} more in 30–60 days · ${expiring90} in 60–90`}
        />
        <ContextKPI
          label="Expired or lapsed"
          value={cnt("EXPIRED") + cnt("LAPSED")}
          deltaValue={undefined}
          hint={cnt("REVOKED") ? `${cnt("REVOKED")} revoked` : "none revoked"}
        />
      </div>

      {/* A false zero of exactly the Incident-Overdue kind: the effectiveness
          panel below reads as "no ineffective training" when in truth no
          effectiveness review has ever been recorded. */}
      {effectivenessTotal > 0 && effectivenessReviewed === 0 && (
        <div className="mb-5">
          <DataQualityFlag
            variant="banner"
            metric="Training effectiveness"
            incompleteCount={effectivenessTotal}
            totalCount={effectivenessTotal}
            field="effectiveness review"
            scope="certificates"
            blocking
            reason={
              `No certificate has ever had an effectiveness review recorded, so this screen ` +
              `cannot say whether training worked. An empty effectiveness result here is the ` +
              `absence of the review, not evidence that training was effective.`
            }
          />
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Panel
          title="Certificate expiry pipeline"
          subtitle="Certificates falling due over the next 12 months — the recertification workload."
        >
          {pipeline.length === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No certificates expire in the next 12 months.
            </p>
          ) : (
            <ul className="space-y-2">
              {pipeline.map(([key, n]) => {
                const [y, m] = key.split("-").map(Number);
                return (
                  <li key={key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px]" style={{ color: INK.base }}>
                        {MONTH[(m ?? 1) - 1]} {y}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: INK.muted }}>
                        {n}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: NAVY[100] }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((n / maxMonth) * 100, 1.5)}%`,
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
          title="Certificate state"
          subtitle="Every certificate on record, by its current state."
        >
          {total === 0 ? (
            <p className="text-xs" style={{ color: INK.faint }}>
              No certificates on record.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: NAVY[100] }}>
              {statusCounts.map((r: any) => (
                <li
                  key={String(r.status)}
                  className="flex items-baseline justify-between py-1.5"
                >
                  <span className="text-[12px]" style={{ color: INK.base }}>
                    {String(r.status)
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/^\w/, (c: string) => c.toUpperCase())}
                  </span>
                  <span
                    className="text-[12px] font-semibold tabular-nums"
                    style={{ color: INK.strong }}
                  >
                    {r._count}
                  </span>
                </li>
              ))}
              <li className="flex items-baseline justify-between py-1.5">
                <span className="text-[12px]" style={{ color: INK.muted }}>
                  Contract workers on record
                </span>
                <span className="text-[12px] tabular-nums" style={{ color: INK.muted }}>
                  {contractorWorkers}
                </span>
              </li>
            </ul>
          )}
          {contractorWorkers > 0 && (
            <p
              className="mt-2 rounded border px-2 py-1.5 text-[10.5px] leading-snug"
              style={{
                borderColor: STATUS.medium.line,
                backgroundColor: STATUS.medium.tint,
                color: STATUS.medium.ink,
              }}
            >
              Contractor training coverage is not derivable here: contractor workers carry no
              link to a training certificate, so a coverage percentage would be computed over a
              join that does not exist.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
