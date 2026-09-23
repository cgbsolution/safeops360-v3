import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { BookOpen, Users } from "lucide-react";
import {
  ACK_STATUS_CHIP,
  ACK_STATUS_LABEL,
  OPL_CATEGORY_LABEL,
  OPL_STATUS_CHIP,
  OPL_STATUS_LABEL,
  fmtDate,
  fmtDue
} from "../../_meta";
import { Chip, PersonRef } from "../../ui";
import { OplActions } from "./actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type Ack = {
  id: string;
  person: { id: string; name: string; role?: string | null } | null;
  status: string;
  dueAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  isOverdue: boolean;
};

type OplDetail = {
  id: string;
  oplNo: string | null;
  title: string;
  category: string;
  status: string;
  revision: number;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  contentHtml: string | null;
  keyPoints: string[];
  author: { id: string; name: string; role?: string | null } | null;
  approver: { id: string; name: string; role?: string | null } | null;
  approvedAt: string | null;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  publishedAt: string | null;
  isReviewOverdue: boolean;
  acknowledgement: {
    assigned: number;
    read: number;
    acknowledged: number;
    waived: number;
    overdue: number;
    percent: number | null;
  };
  myAcknowledgement: { status: string; dueAt: string | null } | null;
  rejectionReason: string | null;
  availableActions: string[];
  createdAt: string;
};

export default async function OplDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requirePermission("OPL.READ");

  let o: OplDetail;
  try {
    // NOTE: this GET has a side effect by design — opening a published lesson
    // you were assigned stamps `readAt`. Read is not acknowledged; the
    // acknowledgement is a separate, deliberate act, because scrolling past a
    // page must never count as training.
    o = await backendFetch<OplDetail>(`/api/be/opl/${id}`);
  } catch {
    redirectMissingRecord("/business-excellence/opl", "One Point Lesson");
  }

  let acks: Ack[] = [];
  if (o.status === "PUBLISHED" || o.acknowledgement.assigned > 0) {
    try {
      const res = await backendFetch<{ items: Ack[] }>(`/api/be/opl/${id}/acknowledgements`);
      acks = res?.items ?? [];
    } catch {
      // The matrix is supporting detail; the lesson itself still renders.
      acks = [];
    }
  }

  const a = o.acknowledgement;

  return (
    <div>
      <PageHeader
        title={o.title}
        description={
          o.oplNo
            ? `${o.oplNo} · revision ${o.revision} · ${OPL_CATEGORY_LABEL[o.category] ?? o.category}`
            : `Draft · not yet numbered · ${OPL_CATEGORY_LABEL[o.category] ?? o.category}`
        }
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "One Point Lesson", href: "/business-excellence/opl" },
          { label: o.oplNo ?? "Draft" }
        ]}
        action={
          <Chip
            label={OPL_STATUS_LABEL[o.status] ?? o.status}
            className={OPL_STATUS_CHIP[o.status]}
          />
        }
      />

      {o.rejectionReason && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <div className="font-semibold text-rose-900">Sent back</div>
          <div className="mt-1 text-rose-800">{o.rejectionReason}</div>
        </div>
      )}

      {o.isReviewOverdue && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This lesson passed its review date of {fmtDate(o.reviewDueAt)}. A lesson that
          no longer matches the machine teaches the wrong thing with the plant&apos;s
          authority behind it.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* The lesson itself, rendered as the one page it is meant to be. */}
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
              <BookOpen size={13} /> One Point Lesson
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{o.title}</h2>
            <div className="mt-1 text-xs text-slate-500">
              {[o.siteName, o.areaName, o.lineOrMachine].filter(Boolean).join(" · ")}
            </div>

            {o.keyPoints?.length > 0 && (
              <ol className="mt-5 space-y-2">
                {o.keyPoints.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed text-slate-800">{p}</span>
                  </li>
                ))}
              </ol>
            )}

            {o.contentHtml && (
              <p className="mt-5 whitespace-pre-wrap border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-700">
                {o.contentHtml}
              </p>
            )}

            {!o.contentHtml && !o.keyPoints?.length && (
              <p className="mt-5 text-sm italic text-slate-400">
                This lesson has no content yet.
              </p>
            )}
          </article>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">What happens next</h2>
            <OplActions
              id={o.id}
              availableActions={o.availableActions}
              myAcknowledgement={o.myAcknowledgement}
              assignedCount={a.assigned}
              status={o.status}
            />
          </section>

          {acks.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Users size={14} className="text-slate-400" /> Who has read it
              </h2>
              <div className="overflow-x-auto">
                <Table className="w-full min-w-[520px] text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <TableHead className="py-2 pr-4 font-medium">Person</TableHead>
                      <TableHead className="py-2 pr-4 font-medium">Status</TableHead>
                      <TableHead className="py-2 pr-4 font-medium">Due</TableHead>
                      <TableHead className="py-2 font-medium">Acknowledged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acks.map((ack) => (
                      <TableRow key={ack.id} className="border-b border-slate-100 last:border-0">
                        <TableCell className="py-2 pr-4">
                          <PersonRef person={ack.person} fallback="Unknown person" />
                        </TableCell>
                        <TableCell className="py-2 pr-4">
                          <Chip
                            label={ACK_STATUS_LABEL[ack.status] ?? ack.status}
                            className={ACK_STATUS_CHIP[ack.status]}
                          />
                        </TableCell>
                        <TableCell className="py-2 pr-4">
                          <span className={ack.isOverdue ? "text-rose-700" : "text-slate-600"}>
                            {fmtDue(ack.dueAt)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-slate-600">{fmtDate(ack.acknowledgedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Acknowledgement</h2>
            {a.assigned === 0 ? (
              <p className="text-sm text-slate-500">
                {o.status === "PUBLISHED"
                  ? "Published, but assigned to nobody. Nobody owes a reading of this lesson."
                  : "Not published yet, so nobody has been asked to read it."}
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-slate-900">
                    {a.percent ?? 0}%
                  </span>
                  <span className="text-sm text-slate-500">
                    {a.acknowledged} of {a.assigned}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${
                      (a.percent ?? 0) >= 90
                        ? "bg-emerald-500"
                        : (a.percent ?? 0) >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, a.percent ?? 0)}%` }}
                  />
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <Row label="Read, not acknowledged">{Math.max(0, a.read - a.acknowledged)}</Row>
                  <Row label="Not opened">{Math.max(0, a.assigned - a.read)}</Row>
                  <Row label="Overdue">
                    <span className={a.overdue ? "font-medium text-rose-700" : ""}>{a.overdue}</span>
                  </Row>
                  {a.waived > 0 && <Row label="Waived">{a.waived}</Row>}
                </dl>
              </>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Author">
                <PersonRef person={o.author} />
              </Row>
              <Row label="Approved by">
                <PersonRef person={o.approver} fallback="Not approved" />
              </Row>
              <Row label="Published">{fmtDate(o.publishedAt)}</Row>
              <Row label="Effective from">{fmtDate(o.effectiveFrom)}</Row>
              <Row label="Review due">
                <span className={o.isReviewOverdue ? "font-medium text-rose-700" : ""}>
                  {fmtDate(o.reviewDueAt)}
                </span>
              </Row>
              <Row label="Revision">{o.revision}</Row>
              <Row label="Created">{fmtDate(o.createdAt)}</Row>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums text-slate-700">{children}</dd>
    </div>
  );
}
