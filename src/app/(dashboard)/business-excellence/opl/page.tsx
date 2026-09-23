// One Point Lesson register.
//
// The acknowledgement percentage is the column that matters. A published lesson
// nobody has read is worse than no lesson at all, because the plant believes the
// learning has landed.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { BookOpen, Plus, Inbox, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  OPL_CATEGORY_LABEL,
  OPL_STATUS_CHIP,
  OPL_STATUS_LABEL,
  fmtDate,
  type OplListItem
} from "../_meta";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: OplListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

type MineResponse = { items: any[]; total: number; overdue: number };

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "DRAFT", label: "Draft" },
  { code: "IN_REVIEW", label: "In review" },
  { code: "APPROVED", label: "Approved, not published" },
  { code: "PUBLISHED", label: "Published" },
  { code: "RETIRED", label: "Retired" }
];

export default async function OplRegisterPage(props: {
  searchParams: Promise<{ plantId?: string; status?: string; category?: string; q?: string }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  let data: ListResponse = { items: [], total: 0, statusCounts: {} };
  let mine: MineResponse = { items: [], total: 0, overdue: 0 };
  let loadError: string | null = null;
  try {
    [data, mine] = await Promise.all([
      backendFetch<ListResponse>("/api/be/opl", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          category: searchParams.category || undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      }),
      // The caller's own reading list. Fetched alongside the register because
      // "what do I still have to read" is the question most people open this
      // screen with, and burying it behind a tab means it never gets answered.
      backendFetch<MineResponse>("/api/be/opl/mine")
    ]);
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the One Point Lesson register.";
  }

  const items = data.items ?? [];
  const counts = data.statusCounts ?? {};
  const published = items.filter((o) => o.status === "PUBLISHED");
  const unreadAcross = published.reduce((n, o) => n + (o.acknowledgement?.overdue ?? 0), 0);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/business-excellence/opl${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="One Point Lesson"
        description="One page, one lesson, one audience — and a record of who has actually read it."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "One Point Lesson" }
        ]}
        action={
          <Can permission="OPL.CREATE">
            <Button asChild>
              <Link href="/business-excellence/opl/new">
                <Plus size={16} /> Write a lesson
              </Link>
            </Button>
          </Can>
        }
      />

      {plants.length > 1 && (
        <div className="mb-4">
          <PlantSwitcher plants={plants} currentPlantId={plantId} />
        </div>
      )}

      {loadError && <LoadError what="The One Point Lesson register" message={loadError} />}

      {mine.total > 0 && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            mine.overdue
              ? "border-rose-300 bg-rose-50"
              : "border-blue-200 bg-blue-50"
          }`}
        >
          <Inbox
            size={18}
            className={`mt-0.5 shrink-0 ${mine.overdue ? "text-rose-600" : "text-blue-600"}`}
          />
          <div className="flex-1">
            <div className={`font-semibold ${mine.overdue ? "text-rose-900" : "text-blue-900"}`}>
              You have {mine.total} lesson{mine.total === 1 ? "" : "s"} to read
              {mine.overdue ? `, ${mine.overdue} of them overdue` : ""}
            </div>
            <ul className="mt-2 space-y-1">
              {mine.items.slice(0, 4).map((m: any) => (
                <li key={m.acknowledgementId}>
                  <Link
                    href={`/business-excellence/opl/${m.oplId}`}
                    className="text-sm underline-offset-2 hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    {m.isOverdue ? "overdue" : `due ${fmtDate(m.dueAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatBox label="Lessons" value={data.total} icon={BookOpen} />
        <StatBox label="Published" value={counts.PUBLISHED ?? 0} tone="success" icon={CheckCircle2} />
        <StatBox label="Awaiting review" value={counts.IN_REVIEW ?? 0} tone="warning" />
        <StatBox
          label="Overdue reads"
          value={unreadAcross}
          tone={unreadAcross ? "danger" : "default"}
          icon={AlertTriangle}
          hint="Across published lessons on this page"
        />
      </div>

      <FilterTabsList label="Status" className="mb-4">
        {STATUS_TABS.map((t) => (
          <FilterTab
            key={t.code || "all"}
            href={qs({ status: t.code || undefined })}
            active={(searchParams.status ?? "") === t.code}
            label={t.code && counts[t.code] ? `${t.label} (${counts[t.code]})` : t.label}
          />
        ))}
      </FilterTabsList>

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No One Point Lessons yet."
          description={
            loadError
              ? undefined
              : "The best OPLs come straight out of something that went wrong — a trouble case written up the same week, on one page, with a picture."
          }
          action={
            <Can permission="OPL.CREATE">
              <Button asChild>
                <Link href="/business-excellence/opl/new">
                  <Plus size={16} /> Write the first one
                </Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[880px] text-sm">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <TableHead className="px-4 py-3 font-medium">Lesson</TableHead>
                <TableHead className="px-4 py-3 font-medium">Type</TableHead>
                <TableHead className="px-4 py-3 font-medium">Where</TableHead>
                <TableHead className="px-4 py-3 font-medium">Author</TableHead>
                <TableHead className="px-4 py-3 font-medium">Acknowledged</TableHead>
                <TableHead className="px-4 py-3 font-medium">Review due</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((o) => (
                <TableRow key={o.id} className="border-b border-slate-100 align-top last:border-0">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/opl/${o.id}`}
                      code={o.oplNo ? `${o.oplNo} · rev ${o.revision}` : null}
                      title={o.title}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-700">
                    {OPL_CATEGORY_LABEL[o.category] ?? o.category}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    <div>{o.siteName ?? "—"}</div>
                    <div className="text-xs text-slate-400">
                      {[o.areaName, o.lineOrMachine].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PersonRef person={o.author} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <AckCell opl={o} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={o.isReviewOverdue ? "font-medium text-rose-700" : "text-slate-600"}
                    >
                      {fmtDate(o.reviewDueAt)}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={OPL_STATUS_LABEL[o.status] ?? o.status}
                      className={OPL_STATUS_CHIP[o.status]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Acknowledgement progress for one lesson.
 *
 * `percent` is null when nothing is assigned. Rendering that as 0% would read
 * as "everyone is ignoring it" when the truth is "nobody has been asked yet" —
 * two different problems with two different fixes.
 */
function AckCell({ opl }: { opl: OplListItem }) {
  const a = opl.acknowledgement;
  if (!a || a.assigned === 0) {
    return (
      <span className="text-xs text-slate-400">
        {opl.status === "PUBLISHED" ? "Nobody assigned" : "Not published"}
      </span>
    );
  }
  const pct = a.percent ?? 0;
  const tone = pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="min-w-[110px]">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium tabular-nums text-slate-700">
          {a.acknowledged}/{a.assigned}
        </span>
        <span className="tabular-nums text-slate-500">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {a.overdue > 0 && (
        <div className="mt-0.5 text-[11px] text-rose-600">{a.overdue} overdue</div>
      )}
    </div>
  );
}
