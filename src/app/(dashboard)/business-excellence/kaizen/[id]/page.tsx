import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/permissions";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { Lightbulb, Share2 } from "lucide-react";
import Link from "next/link";
import {
  FAST_TRACK_BADGE_LABEL,
  KAIZEN_CATEGORY_LABEL,
  KAIZEN_LANE_LABEL,
  KAIZEN_STATUS_CHIP,
  KAIZEN_STATUS_LABEL,
  SAVING_TYPE_LABEL,
  fmtDate,
  fmtMoney,
  type KaizenReplication
} from "../../_meta";
import { Chip, PersonRef } from "../../ui";
import { KaizenActions } from "./actions";
import { BeforeAfterPhotos } from "./before-after";
import { EvidenceAttachment } from "@/components/evidence/EvidenceAttachment";

export const dynamic = "force-dynamic";

type KaizenDetail = {
  id: string;
  kaizenNo: string | null;
  title: string;
  category: string;
  lane: string;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  processStep: string | null;
  problemStatement: string;
  currentState: string | null;
  proposedImprovement: string;
  expectedBenefit: string | null;
  owner: { id: string; name: string; role?: string | null } | null;
  raisedBy: { id: string; name: string; role?: string | null } | null;
  targetDate: string | null;
  implementedAt: string | null;
  implementationNote: string | null;
  currency: string;
  investmentCost: number | null;
  estimatedAnnualSaving: number | null;
  verifiedAnnualSaving: number | null;
  savingType: string | null;
  verifiedBy: { id: string; name: string; role?: string | null } | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  rejectionReason: string | null;
  isOverdue: boolean;
  availableActions: string[];
  createdAt: string;

  // Server-derived, never read off `lane`.
  fastTrack: boolean;
  fastTrackReasons: string[];
  fastTrackMaxInvestment: number | null;
  fastTrackMaxImplementationDays: number | null;

  // Empty means Approve is possible. The server enforces the same list.
  approvalBlockers: string[];

  screenedAt: string | null;
  approvedAt: string | null;

  originKaizenId: string | null;
  originKaizenNo: string | null;
  replications: KaizenReplication[];
  replicationCount: number;

  generatedOplId: string | null;
  generatedOplNo: string | null;
  generatedOplTitle: string | null;
};

export default async function KaizenDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requirePermission("KAIZEN.READ");

  let k: KaizenDetail;
  try {
    k = await backendFetch<KaizenDetail>(`/api/be/kaizen/${id}`);
  } catch {
    // A dead deep link becomes a redirect with a toast, never a blank page.
    redirectMissingRecord("/business-excellence/kaizen", "Kaizen");
  }

  // The RCA button gates on RCA.CREATE, not on a Kaizen permission: opening a
  // root cause analysis writes into the ERM engine, and that module owns who
  // may do it. Resolved here rather than with <Can/> because the value is a
  // prop on a client component, not a wrapper around markup.
  const canRaiseRca = (await can((user as any).id, "RCA.CREATE", {})).allowed;
  // Photo upload writes into the shared evidence layer, which gates on
  // KAIZEN.UPDATE for this entity — resolved here so the component can render
  // read-only rather than offering an upload that will 403.
  const canManageEvidence = (
    await can((user as any).id, "KAIZEN.UPDATE", { plantId: k.plantId })
  ).allowed;
  // Creating an OPL writes a record in a different register that other people
  // will be required to read, so it gates on that register's own permission.
  const canCreateOpl = (
    await can((user as any).id, "OPL.CREATE", { plantId: k.plantId })
  ).allowed;

  // Once the work is genuinely under way there is something to photograph.
  const afterPhotoEnabled = [
    "IN_IMPLEMENTATION",
    "IMPLEMENTED",
    "VERIFIED",
    "CLOSED"
  ].includes(k.status);

  return (
    <div>
      <PageHeader
        title={k.title}
        description={
          k.kaizenNo
            ? `${k.kaizenNo} · raised ${fmtDate(k.createdAt)}`
            : `Draft · not yet numbered · started ${fmtDate(k.createdAt)}`
        }
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Kaizen", href: "/business-excellence/kaizen" },
          { label: k.kaizenNo ?? "Draft" }
        ]}
        action={
          <div className="flex items-center gap-2">
            <Chip
              label={KAIZEN_STATUS_LABEL[k.status] ?? k.status}
              className={KAIZEN_STATUS_CHIP[k.status]}
            />
            {/* The badge is EARNED from the record's own investment and
                implementation window, not claimed by picking a lane. The lane
                is shown as what it is — the approval route — in Details. */}
            {k.fastTrack && (
              <Chip
                label={FAST_TRACK_BADGE_LABEL}
                className="border-sky-200 bg-sky-50 text-sky-700"
                title={`Investment at or under ${k.fastTrackMaxInvestment?.toLocaleString() ?? ""} and implemented within ${k.fastTrackMaxImplementationDays ?? ""} day`}
              />
            )}
            {k.replicationCount > 0 && (
              <Chip
                label={`Deployed at ${k.replicationCount} other plant${k.replicationCount === 1 ? "" : "s"}`}
                className="border-violet-200 bg-violet-50 text-violet-700"
              />
            )}
          </div>
        }
      />

      {k.originKaizenId && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <span className="font-semibold">Replicated from another plant.</span>{" "}
          This idea was taken up from{" "}
          <Link
            href={`/business-excellence/kaizen/${k.originKaizenId}`}
            className="font-medium underline underline-offset-2"
          >
            {k.originKaizenNo ?? "the original record"}
          </Link>
          . Its investment and saving figures were deliberately not copied — this
          plant records its own.
        </div>
      )}

      {k.rejectionReason && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <div className="font-semibold text-rose-900">This idea was rejected</div>
          <div className="mt-1 text-rose-800">{k.rejectionReason}</div>
        </div>
      )}

      {k.isOverdue && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Past its implementation target of {fmtDate(k.targetDate)}. Either move the date
          with a reason, or park the idea — an overdue record nobody touches teaches
          people to ignore the column.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Artefact first. The two photographs answer "did this actually
              change?" in a glance, which no amount of prose does. */}
          <BeforeAfterPhotos
            kaizenId={k.id}
            canManage={canManageEvidence}
            afterEnabled={afterPhotoEnabled}
          />

          <Card title="Problem">
            <Prose text={k.problemStatement} />
            {k.currentState && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current state
                </h4>
                <Prose text={k.currentState} />
              </>
            )}
          </Card>

          <Card title="Countermeasure">
            <Prose text={k.proposedImprovement} />
            {k.expectedBenefit && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Expected benefit
                </h4>
                <Prose text={k.expectedBenefit} />
              </>
            )}
            {k.implementationNote && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Implementation note
                </h4>
                <Prose text={k.implementationNote} />
              </>
            )}
          </Card>

          <Card title="What happens next">
            <KaizenActions
              id={k.id}
              status={k.status}
              availableActions={k.availableActions}
              verifiedAnnualSaving={k.verifiedAnnualSaving}
              currency={k.currency}
              canRaiseRca={canRaiseRca}
              hasRca={false}
              approvalBlockers={k.approvalBlockers}
              canCreateOpl={canCreateOpl}
              generatedOplId={k.generatedOplId}
              generatedOplNo={k.generatedOplNo}
              generatedOplTitle={k.generatedOplTitle}
              plantId={k.plantId}
            />
          </Card>

          {k.replications.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Share2 size={14} className="text-slate-400" /> Where else this is running
              </h2>
              <ul className="space-y-2 text-sm">
                {k.replications.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <span className="font-medium text-slate-800">
                        {r.replicatedAtPlantName ?? "Another plant"}
                      </span>
                      {r.replicaKaizenId && (
                        <>
                          {" · "}
                          <Link
                            href={`/business-excellence/kaizen/${r.replicaKaizenId}`}
                            className="text-primary-700 underline-offset-2 hover:underline"
                          >
                            {r.replicaKaizenNo ?? "their record"}
                          </Link>
                        </>
                      )}
                      {r.notes && (
                        <div className="text-xs text-slate-500">{r.notes}</div>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.replicatedBy?.name ? `${r.replicatedBy.name} · ` : ""}
                      {fmtDate(r.replicatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Supporting documents — drawings, quotes, the savings calculation.
              The shared platform component; the before/after card above is the
              only bespoke part, and only because a filename list cannot answer
              the before/after question. */}
          <EvidenceAttachment
            entityType="be_kaizen"
            entityId={k.id}
            canManage={canManageEvidence}
            title="Supporting documents"
            help="Drawings, quotations, the savings calculation — anything that backs up the figures on this record."
            categories={[
              { value: "SUPPORTING_EVIDENCE", label: "Supporting evidence" },
              { value: "SAVINGS_EVIDENCE", label: "Savings evidence" },
              { value: "DRAWING", label: "Drawing" },
              { value: "REPORT", label: "Report" },
              { value: "OTHER", label: "Other" }
            ]}
          />
        </div>

        <div className="space-y-4">
          <Card title="Savings">
            <dl className="space-y-3 text-sm">
              <Row label="Investment">{fmtMoney(k.investmentCost, k.currency) ?? "—"}</Row>
              <Row label="Estimated / yr">
                {fmtMoney(k.estimatedAnnualSaving, k.currency) ?? "—"}
                {k.savingType && (
                  <span className="ml-1 text-[11px] text-slate-400">
                    {SAVING_TYPE_LABEL[k.savingType] ?? k.savingType}
                  </span>
                )}
              </Row>
              <Row label="Verified / yr">
                {k.verifiedAnnualSaving != null ? (
                  <span className="font-semibold text-emerald-700">
                    {fmtMoney(k.verifiedAnnualSaving, k.currency)}
                  </span>
                ) : (
                  /* Explicitly "not yet confirmed" rather than a dash, because
                     an unverified saving is a claim in progress, not an absent
                     one. */
                  <span className="text-slate-400">Not yet confirmed</span>
                )}
              </Row>
              {k.verifiedBy && (
                <Row label="Verified by">
                  <PersonRef person={k.verifiedBy} />
                  <div className="text-xs text-slate-400">{fmtDate(k.verifiedAt)}</div>
                  {k.verificationNote && (
                    <div className="mt-1 text-xs text-slate-500">{k.verificationNote}</div>
                  )}
                </Row>
              )}
            </dl>
          </Card>

          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <Row label="Category">{KAIZEN_CATEGORY_LABEL[k.category] ?? k.category}</Row>
              <Row label="Approval route">{KAIZEN_LANE_LABEL[k.lane] ?? k.lane}</Row>
              <Row label="Site">{k.siteName ?? "—"}</Row>
              <Row label="Area">{k.areaName ?? "Not area-specific"}</Row>
              <Row label="Line / machine">{k.lineOrMachine ?? "—"}</Row>
              <Row label="Process step">{k.processStep ?? "—"}</Row>
              <Row label="Raised by">
                <PersonRef person={k.raisedBy} />
              </Row>
              <Row label="Owner">
                <PersonRef person={k.owner} />
              </Row>
              <Row label="Target date">{fmtDate(k.targetDate)}</Row>
              <Row label="Screened">{fmtDate(k.screenedAt)}</Row>
              <Row label="Approved">{fmtDate(k.approvedAt)}</Row>
              <Row label="Implemented">{fmtDate(k.implementedAt)}</Row>
            </dl>

            {/* A badge that quietly does not appear is indistinguishable from a
                bug. If the record is on the fast lane but has not earned the
                badge, say which figure is missing so somebody can fix it. */}
            {!k.fastTrack && k.lane === "FAST_TRACK" && k.fastTrackReasons.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">
                  No “{FAST_TRACK_BADGE_LABEL}” badge on this record
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {k.fastTrackReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-slate-500">
                  It still runs through the supervisor fast lane — only the badge
                  needs the figures.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Lightbulb size={14} className="text-slate-400" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-right text-slate-700">{children}</dd>
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>;
}
