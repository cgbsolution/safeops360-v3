import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  APPROACH_HINT,
  APPROACH_LABEL,
  DEVICE_TYPE_LABEL,
  FREQUENCY_LABEL,
  POKA_YOKE_STATUS_CHIP,
  POKA_YOKE_STATUS_LABEL,
  REACTION_LABEL,
  fmtDate,
  fmtDue,
  fmtDuration,
  fmtMoney
} from "../../_meta";
import { Chip, PersonRef } from "../../ui";
import { DeviceActions } from "./actions";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; role?: string | null } | null;

type Verification = {
  id: string;
  verifiedBy: Person;
  verifiedAt: string;
  result: string;
  note: string | null;
  dueAt: string | null;
  capaId: string | null;
};

type Bypass = {
  id: string;
  deviceId: string;
  bypassedBy: Person;
  bypassedAt: string;
  reason: string;
  approvedBy: Person;
  statusAtBypass: string | null;
  restoredAt: string | null;
  restoredBy: Person;
  restoreNote: string | null;
  durationHours: number | null;
  isOpen: boolean;
};

type DeviceDetail = {
  id: string;
  deviceNo: string | null;
  title: string;
  status: string;
  deviceType: string;
  approach: string;
  reactionMode: string;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  processStep: string | null;
  defectModePrevented: string;
  description: string | null;
  beforeCondition: string | null;
  afterCondition: string | null;
  owner: { id: string; name: string; role?: string | null } | null;
  currency: string;
  cost: number | null;
  installedAt: string | null;
  verificationFrequency: string;
  lastVerifiedAt: string | null;
  lastVerificationResult: string | null;
  nextVerificationDueAt: string | null;
  isVerificationOverdue: boolean;
  isBypassed: boolean;
  // What the badge should say. Not always `status` — see _meta.ts.
  displayStatus: string;
  bypassOpenHours: number | null;
  bypassReason: string | null;
  bypassedAt: string | null;
  bypassedBy: Person;
  bypassApprovedBy: Person;
  // The append-only history. `bypassReason`/`bypassedAt` above are a cache of
  // the currently-open episode and say nothing about earlier ones; this is the
  // record of truth.
  bypasses: Bypass[];
  activeBypass: Bypass | null;
  rejectionReason: string | null;
  retiredAt: string | null;
  sourceKaizenId: string | null;
  sourceRcaId: string | null;
  availableActions: string[];
  verifications: Verification[];
  createdAt: string;
};

/**
 * Checks and bypasses on ONE timeline, newest first.
 *
 * Kept as a merge rather than two panels because they answer the same
 * question and interleave in time: a device that passed on Monday, was
 * bypassed on Tuesday and restored on Thursday has a story, and two lists
 * side by side make the reader reconstruct it. A bypass contributes up to two
 * entries — one when it opened, one when it was restored — because those are
 * two things that happened on two days, and collapsing them into one row
 * would put the whole episode at whichever date the panel chose.
 */
type TimelineEntry = {
  key: string;
  at: string;
  kind: "PASS" | "FAIL" | "BYPASS" | "RESTORE";
  who: Person;
  body: string | null;
  capaId?: string | null;
  meta?: string | null;
};

function buildTimeline(d: DeviceDetail): TimelineEntry[] {
  const out: TimelineEntry[] = [];

  for (const v of d.verifications) {
    out.push({
      key: `v-${v.id}`,
      at: v.verifiedAt,
      kind: v.result === "FAIL" ? "FAIL" : "PASS",
      who: v.verifiedBy,
      body: v.note,
      capaId: v.capaId
    });
  }

  for (const b of d.bypasses) {
    out.push({
      key: `b-${b.id}`,
      at: b.bypassedAt,
      kind: "BYPASS",
      who: b.bypassedBy,
      body: b.reason,
      meta: [
        b.approvedBy ? `authorised by ${b.approvedBy.name}` : null,
        b.statusAtBypass
          ? `device was ${(POKA_YOKE_STATUS_LABEL[b.statusAtBypass] ?? b.statusAtBypass).toLowerCase()}`
          : null,
        b.isOpen
          ? `open ${fmtDuration(b.durationHours) ?? ""} so far`
          : `lasted ${fmtDuration(b.durationHours) ?? "an unrecorded time"}`
      ]
        .filter(Boolean)
        .join(" · ")
    });
    if (b.restoredAt) {
      out.push({
        key: `r-${b.id}`,
        at: b.restoredAt,
        kind: "RESTORE",
        who: b.restoredBy,
        body: b.restoreNote,
        meta: `ended a bypass that ran ${fmtDuration(b.durationHours) ?? "an unrecorded time"}`
      });
    }
  }

  // Descending. Ties broken on the key so the order is stable between renders
  // rather than depending on however the two source arrays happened to zip.
  return out.sort((a, b) =>
    a.at === b.at ? a.key.localeCompare(b.key) : (a.at < b.at ? 1 : -1)
  );
}

const TIMELINE_STYLE: Record<
  TimelineEntry["kind"],
  { label: string; chip: string; rail: string }
> = {
  PASS: {
    label: "Pass",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rail: "border-emerald-200"
  },
  FAIL: {
    label: "Fail",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
    rail: "border-rose-300"
  },
  BYPASS: {
    label: "Bypassed",
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    rail: "border-amber-300"
  },
  RESTORE: {
    label: "Restored",
    chip: "bg-sky-100 text-sky-800 border-sky-200",
    rail: "border-sky-200"
  }
};

export default async function PokaYokeDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requirePermission("POKAYOKE.READ");

  let d: DeviceDetail;
  try {
    d = await backendFetch<DeviceDetail>(`/api/be/poka-yoke/${id}`);
  } catch {
    redirectMissingRecord("/business-excellence/poka-yoke", "Poka Yoke device");
  }

  const timeline = buildTimeline(d);
  const closedBypasses = d.bypasses.filter((b) => !b.isOpen).length;

  return (
    <div>
      <PageHeader
        title={d.title}
        description={
          d.deviceNo
            ? `${d.deviceNo} · ${DEVICE_TYPE_LABEL[d.deviceType] ?? d.deviceType}`
            : `Not yet numbered · ${DEVICE_TYPE_LABEL[d.deviceType] ?? d.deviceType}`
        }
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Poka Yoke", href: "/business-excellence/poka-yoke" },
          { label: d.deviceNo ?? "Device" }
        ]}
        action={
          <div className="flex items-center gap-2">
            {/* displayStatus, not status. While a bypass is open the badge says
                Bypassed instead of Active — a screen that reads "Active" over a
                device somebody has switched off is stating something untrue on
                the one page an auditor opens. What it was underneath is still
                shown, in the banner below, so nothing is hidden. */}
            <Chip
              label={POKA_YOKE_STATUS_LABEL[d.displayStatus] ?? d.displayStatus}
              className={POKA_YOKE_STATUS_CHIP[d.displayStatus]}
            />
          </div>
        }
      />

      {d.isBypassed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <ShieldOff size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <div className="font-semibold text-amber-900">
              This device is not currently protecting the line
            </div>
            <div className="mt-1 text-amber-800">
              {d.activeBypass?.reason ?? d.bypassReason}
            </div>
            <div className="mt-1 text-xs text-amber-700">
              Logged {fmtDate(d.activeBypass?.bypassedAt ?? d.bypassedAt)} by{" "}
              {d.activeBypass?.bypassedBy?.name ?? d.bypassedBy?.name ?? "an unknown user"}
              {d.activeBypass?.approvedBy || d.bypassApprovedBy
                ? ` · authorised by ${(d.activeBypass?.approvedBy ?? d.bypassApprovedBy)!.name}`
                : ""}
            </div>
            {/* The duration is the number that makes somebody act. A bypass
                with a start date and no elapsed time reads as an event; one
                that says "open 9 days" reads as a decision nobody has
                revisited. */}
            {d.bypassOpenHours !== null && (
              <div className="mt-1 text-xs font-medium text-amber-900">
                Open {fmtDuration(d.bypassOpenHours)}
                {d.activeBypass?.statusAtBypass
                  ? ` · it was ${(
                      POKA_YOKE_STATUS_LABEL[d.activeBypass.statusAtBypass] ??
                      d.activeBypass.statusAtBypass
                    ).toLowerCase()} before this`
                  : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {d.isVerificationOverdue && !d.isBypassed && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          This device has missed its scheduled check
          {d.nextVerificationDueAt ? ` (${fmtDue(d.nextVerificationDueAt)})` : ""}. Until
          somebody verifies it, the line is running on an assumption that it still works.
        </div>
      )}

      {d.rejectionReason && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <div className="font-semibold text-rose-900">Not accepted</div>
          <div className="mt-1 text-rose-800">{d.rejectionReason}</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">What it prevents</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {d.defectModePrevented}
            </p>
            {d.description && (
              <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-700">
                {d.description}
              </p>
            )}

            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Approach</div>
                <div className="mt-1">
                  <Chip
                    label={APPROACH_LABEL[d.approach] ?? d.approach}
                    className={
                      d.approach === "PREVENTION"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500">{APPROACH_HINT[d.approach]}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  When it trips
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {REACTION_LABEL[d.reactionMode] ?? d.reactionMode}
                </div>
              </div>
            </div>

            {(d.beforeCondition || d.afterCondition) && (
              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {d.beforeCondition && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-400">Before</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {d.beforeCondition}
                    </p>
                  </div>
                )}
                {d.afterCondition && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-400">After</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {d.afterCondition}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">What happens next</h2>
            <DeviceActions
              id={d.id}
              status={d.status}
              availableActions={d.availableActions}
              isBypassed={d.isBypassed}
            />
          </section>

          {/* Checks AND bypasses, one timeline. A device's history is not two
              histories: "passed, then somebody switched it off, then it was
              restored and passed again" is the story, and it was previously
              only half told — bypasses appeared nowhere in this panel at all,
              so a device that had been overridden four times read as one that
              had simply passed every check. */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ShieldCheck size={14} className="text-slate-400" /> Verification &amp; bypass
              history
            </h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">
                {/* Never "no failures" — an unchecked device and a device that has
                    passed every check look identical on a screen that says nothing. */}
                This device has never been checked. Its record says it was fitted, and
                nothing more.
              </p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((e) => {
                  const style = TIMELINE_STYLE[e.kind];
                  return (
                    <li
                      key={e.key}
                      className={`flex items-start gap-3 border-l-2 pb-3 pl-3 ${style.rail} border-b border-b-slate-100 last:border-b-0 last:pb-0`}
                    >
                      <Chip label={style.label} className={style.chip} />
                      <div className="flex-1">
                        <div className="text-sm text-slate-700">
                          <PersonRef
                            person={e.who}
                            fallback={
                              e.kind === "BYPASS" || e.kind === "RESTORE"
                                ? "Unknown user"
                                : "Unknown verifier"
                            }
                          />
                          <span className="ml-2 text-xs text-slate-400">{fmtDate(e.at)}</span>
                        </div>
                        {e.body && <p className="mt-0.5 text-sm text-slate-600">{e.body}</p>}
                        {e.meta && (
                          <p className="mt-0.5 text-xs text-slate-500">{e.meta}</p>
                        )}
                        {e.capaId && (
                          <Link
                            href={`/capa/${e.capaId}`}
                            className="mt-1 inline-block text-xs font-medium text-primary-700 hover:underline"
                          >
                            View the CAPA this raised →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Verification</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Cadence">
                {FREQUENCY_LABEL[d.verificationFrequency] ?? d.verificationFrequency}
              </Row>
              <Row label="Last checked">
                {d.lastVerifiedAt ? (
                  <>
                    {fmtDate(d.lastVerifiedAt)}
                    {d.lastVerificationResult && (
                      <span
                        className={`ml-1 text-xs ${
                          d.lastVerificationResult === "PASS"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {d.lastVerificationResult.toLowerCase()}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">Never</span>
                )}
              </Row>
              <Row label="Next due">
                <span className={d.isVerificationOverdue ? "font-medium text-rose-700" : ""}>
                  {d.nextVerificationDueAt ? fmtDue(d.nextVerificationDueAt) : "—"}
                </span>
              </Row>
              <Row label="Checks recorded">{d.verifications.length}</Row>
              {/* Stated even when it is zero, on a device that HAS a history.
                  "Never bypassed" is a fact worth reading; a missing row is
                  indistinguishable from a screen that does not track it. */}
              <Row label="Times bypassed">
                {d.bypasses.length === 0 ? (
                  <span className="text-slate-400">Never</span>
                ) : (
                  <>
                    {d.bypasses.length}
                    <span className="ml-1 text-xs text-slate-500">
                      {d.activeBypass
                        ? closedBypasses
                          ? `· ${closedBypasses} ended, 1 open now`
                          : "· open now"
                        : "· none open"}
                    </span>
                  </>
                )}
              </Row>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Site">{d.siteName ?? "—"}</Row>
              <Row label="Area">{d.areaName ?? "Not area-specific"}</Row>
              <Row label="Line / machine">{d.lineOrMachine ?? "—"}</Row>
              <Row label="Process step">{d.processStep ?? "—"}</Row>
              <Row label="Owner">
                <PersonRef person={d.owner} />
              </Row>
              <Row label="Cost">{fmtMoney(d.cost, d.currency) ?? "—"}</Row>
              <Row label="Installed">{fmtDate(d.installedAt)}</Row>
              <Row label="Retired">{fmtDate(d.retiredAt)}</Row>
              {d.sourceKaizenId && (
                <Row label="From">
                  <Link
                    href={`/business-excellence/kaizen/${d.sourceKaizenId}`}
                    className="text-primary-700 hover:underline"
                  >
                    the Kaizen that proposed it →
                  </Link>
                </Row>
              )}
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
      <dd className="text-right text-slate-700">{children}</dd>
    </div>
  );
}
