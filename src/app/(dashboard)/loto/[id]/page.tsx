// LOTO procedure detail — the authored body, its version history, and the
// lifecycle actions.

import Link from "next/link";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Can } from "@/components/auth/can";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  PenLine,
  Pencil,
  QrCode
} from "lucide-react";
import { ProcedureActions } from "@/components/loto/procedure-actions";
import {
  ENERGY_TYPE_CHIP,
  ENERGY_TYPE_LABEL,
  HARDWARE_ITEM_LABEL,
  ISOLATION_METHOD_LABEL,
  PROCEDURE_STATUS_CHIP,
  PROCEDURE_STATUS_LABEL,
  type Procedure
} from "../_meta";

export const dynamic = "force-dynamic";

export default async function LotoProcedurePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  // NB: the redirect MUST happen outside the try. redirect() signals by
  // throwing, so a bare `catch {}` around it would swallow the navigation and
  // fall through to rendering an undefined procedure.
  let procedure: Procedure | null = null;
  try {
    procedure = await backendFetch<Procedure>(`/api/loto/procedures/${id}`);
  } catch {
    procedure = null;
  }
  if (!procedure) redirectMissingRecord("/loto", "LOTO procedure");

  const sourceById = new Map(procedure.energySources.map((s) => [s.id, s]));
  const overdue = procedure.review.isOverdue;

  return (
    <div>
      <PageHeader
        title={procedure.procedureCode}
        description={procedure.title}
        breadcrumbs={[
          { label: "LOTO", href: "/loto" },
          { label: procedure.procedureCode }
        ]}
        action={
          <Can permission="LOTO.UPDATE">
            {procedure.status !== "retired" && (
              <Button asChild variant="outline">
                <Link href={`/loto/${procedure.id}/edit`}>
                  <Pencil size={14} /> Edit
                </Link>
              </Button>
            )}
          </Can>
        }
      />

      {/* ─── State banners ─── */}
      <div className="mb-4 space-y-3">
        {overdue && (
          <Banner tone="danger" icon={AlertTriangle} title="Scheduled review is overdue">
            This procedure has passed its evaluation date
            {procedure.review.daysUntilDue != null &&
              ` by ${Math.abs(procedure.review.daysUntilDue)} day${
                Math.abs(procedure.review.daysUntilDue) === 1 ? "" : "s"
              }`}
            . Confirm the isolation sequence still matches the plant, or correct it.
          </Banner>
        )}

        {procedure.hasUnpublishedChanges && (
          <Banner tone="warning" icon={Clock} title="Edits are awaiting re-approval">
            The live procedure is v{procedure.version}, but anyone scanning the QR label
            sees v{procedure.publishedVersion} — the last approved version. That is
            deliberate: a crew is never handed an isolation sequence nobody has signed
            off. Publish v{procedure.version} to put the changes into the field.
          </Banner>
        )}

        {procedure.status === "draft" && (
          <Banner tone="info" icon={QrCode} title="Not yet published">
            A draft has no QR label and cannot be locked out against. Publishing
            generates the QR token, which is then permanent — the label goes on the
            machine and never changes.
          </Banner>
        )}

        {procedure.openExecutionCount > 0 && (
          <Banner tone="warning" icon={AlertTriangle} title="Lockouts are running">
            {procedure.openExecutionCount} lockout
            {procedure.openExecutionCount === 1 ? " is" : "s are"} currently open against
            this procedure. Each one follows the snapshot frozen when it started, so
            edits here do not change what those crews are doing.{" "}
            <Link
              href={`/loto/executions?procedureId=${procedure.id}`}
              className="font-medium underline"
            >
              View them
            </Link>
            .
          </Banner>
        )}
      </div>

      <div className="mb-5">
        <ProcedureActions procedure={procedure} />
      </div>

      {/* ─── Summary ─── */}
      <div className="mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Status">
          <span
            className={cn(
              "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
              PROCEDURE_STATUS_CHIP[procedure.status]
            )}
          >
            {PROCEDURE_STATUS_LABEL[procedure.status] ?? procedure.status}
          </span>
          <div className="mt-1 text-xs text-slate-500">
            Live v{procedure.version}
            {procedure.publishedVersion != null &&
              ` · field sees v${procedure.publishedVersion}`}
          </div>
        </Meta>
        <Meta label="Equipment">
          <div className="text-slate-800">{procedure.equipmentName ?? "—"}</div>
          {procedure.equipmentTag && (
            <div className="font-mono text-xs text-slate-500">{procedure.equipmentTag}</div>
          )}
        </Meta>
        <Meta label="Site / area">
          <div className="text-slate-800">{procedure.siteName ?? "—"}</div>
          {procedure.area && <div className="text-xs text-slate-500">{procedure.area}</div>}
        </Meta>
        <Meta label="Next review">
          <div className={cn("text-slate-800", overdue && "font-semibold text-rose-700")}>
            {procedure.review.nextReviewDueAt
              ? new Date(procedure.review.nextReviewDueAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                })
              : "Not scheduled"}
          </div>
          <div className="text-xs text-slate-500">
            Every {procedure.reviewFrequencyMonths} month
            {procedure.reviewFrequencyMonths === 1 ? "" : "s"}
          </div>
        </Meta>
      </div>

      {procedure.description && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Description</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">
            {procedure.description}
          </p>
        </div>
      )}

      {/* ─── Energy sources ─── */}
      <Card title="Energy sources" count={procedure.energySources.length}>
        {procedure.energySources.length === 0 ? (
          <Empty text="No energy sources listed." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {procedure.energySources.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  ENERGY_TYPE_CHIP[s.energyType] ?? ENERGY_TYPE_CHIP.other
                )}
              >
                <div className="font-semibold">
                  {ENERGY_TYPE_LABEL[s.energyType] ?? s.energyType}
                </div>
                {s.magnitude && <div className="text-xs opacity-80">{s.magnitude}</div>}
                {s.locationDescription && (
                  <div className="text-xs opacity-70">{s.locationDescription}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Isolation points ─── */}
      <Card
        title="Isolation points"
        count={procedure.isolationPoints.length}
        subtitle="Action in this order."
      >
        {procedure.isolationPoints.length === 0 ? (
          <Empty text="No isolation points — this procedure cannot be published." warn />
        ) : (
          <ol className="space-y-2">
            {procedure.isolationPoints.map((p) => {
              const src = p.energySourceId ? sourceById.get(p.energySourceId) : null;
              return (
                <li
                  key={p.id}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                    {p.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{p.location}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">
                        {ISOLATION_METHOD_LABEL[p.isolationMethod] ?? p.isolationMethod}
                      </span>
                      {src && (
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5",
                            ENERGY_TYPE_CHIP[src.energyType] ?? ENERGY_TYPE_CHIP.other
                          )}
                        >
                          {ENERGY_TYPE_LABEL[src.energyType]}
                          {src.magnitude ? ` · ${src.magnitude}` : ""}
                        </span>
                      )}
                      {p.lockType && (
                        <span className="text-slate-500">Lock: {p.lockType}</span>
                      )}
                    </div>
                    {p.verificationMethod && (
                      <p className="mt-1.5 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Zero-energy check:</span>{" "}
                        {p.verificationMethod}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* ─── Hardware ─── */}
      <Card title="Required hardware" count={procedure.hardware.length}>
        {procedure.hardware.length === 0 ? (
          <Empty text="No hardware listed." />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {procedure.hardware.map((h) => (
              <li
                key={h.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
              >
                <span className="font-semibold">{h.quantityRequired}×</span>{" "}
                {HARDWARE_ITEM_LABEL[h.itemType] ?? h.itemType}
                {h.description && (
                  <span className="text-slate-500"> — {h.description}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ─── Verification steps ─── */}
      <Card
        title="Zero-energy verification"
        count={procedure.verificationSteps.length}
        subtitle="Signed off at the equipment, in order."
      >
        {procedure.verificationSteps.length === 0 ? (
          <Empty
            text="No verification steps — this procedure cannot be published."
            warn
          />
        ) : (
          <ol className="space-y-2">
            {procedure.verificationSteps.map((s) => (
              <li
                key={s.id}
                className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {s.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{s.stepText}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                    {s.requiresSignoff && (
                      <span className="inline-flex items-center gap-1">
                        <PenLine size={11} /> Sign-off required
                      </span>
                    )}
                    {s.requiresPhoto && (
                      <span className="inline-flex items-center gap-1">
                        <Camera size={11} /> Photo required
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* ─── Version history ─── */}
      <Card
        title="Version history"
        count={procedure.versions.length}
        subtitle="Old versions are retained, never overwritten — this is what proves what the procedure said on the day a job was done."
      >
        {procedure.versions.length === 0 ? (
          <Empty text="No versions recorded yet — the first is written on publish." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Version</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Recorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedure.versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="py-2 align-top">
                      <Link
                        href={`/api/loto/procedures/${procedure.id}/versions/${v.version}`}
                        target="_blank"
                        className="font-medium text-primary-700 hover:underline"
                      >
                        v{v.version}
                      </Link>
                      {v.isPublished && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 size={9} /> Live in field
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 align-top text-xs">
                      {v.changeType === "MATERIAL" ? "Material" : "Minor"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs py-2 align-top text-xs">
                      {v.changeSummary ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 align-top text-xs">
                      {new Date(v.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                      {v.createdByName && (
                        <div className="text-muted-foreground">{v.createdByName}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Presentational helpers ─────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  count,
  children
}: {
  title: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="font-semibold text-slate-900">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-slate-400">{count}</span>
          )}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function Empty({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed p-5 text-center text-sm",
        warn
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-slate-300 bg-slate-50 text-slate-500"
      )}
    >
      {text}
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  children
}: {
  tone: "danger" | "warning" | "info";
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    danger: "border-rose-300 bg-rose-50 text-rose-900",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-slate-300 bg-slate-50 text-slate-700"
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm", styles[tone])}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
