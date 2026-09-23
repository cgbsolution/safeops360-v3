// Poka Yoke register — mistake-proofing devices and their verification state.
//
// The two columns that carry the register are Approach (prevention vs detection)
// and the next verification date. A device list without them is an asset
// inventory; with them it answers "how mistake-proofed is this line, really".

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { ShieldCheck, Plus, AlertTriangle, ShieldOff, Wrench } from "lucide-react";
import {
  APPROACH_HINT,
  APPROACH_LABEL,
  DEVICE_TYPE_LABEL,
  FREQUENCY_LABEL,
  POKA_YOKE_STATUS_CHIP,
  POKA_YOKE_STATUS_LABEL,
  fmtDate,
  fmtDue,
  fmtDuration,
  type PokaYokeListItem
} from "../_meta";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: PokaYokeListItem[];
  total: number;
  statusCounts: Record<string, number>;
  overdueCount: number;
  /**
   * Scope-wide, like overdueCount — NOT a count of the rows on this page.
   * This used to be computed here from `items`, which meant a plant with more
   * devices than the 200-row page size under-reported how much of its
   * mistake-proofing was switched off, silently and in the flattering
   * direction. The server counts open bypass episodes; the browser does not
   * count anything.
   */
  activeBypasses: number;
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "PROPOSED", label: "Proposed" },
  { code: "APPROVED", label: "Approved" },
  { code: "INSTALLED", label: "Installed, unverified" },
  { code: "ACTIVE", label: "Active" },
  { code: "DEGRADED", label: "Not protecting" },
  { code: "RETIRED", label: "Retired" }
];

export default async function PokaYokeRegisterPage(props: {
  searchParams: Promise<{
    plantId?: string;
    status?: string;
    approach?: string;
    overdue?: string;
    bypassed?: string;
    q?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  const overdueOnly = searchParams.overdue === "1";
  const bypassedOnly = searchParams.bypassed === "1";

  let data: ListResponse = { items: [], total: 0, statusCounts: {}, overdueCount: 0, activeBypasses: 0 };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/poka-yoke", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          approach: searchParams.approach || undefined,
          overdue: overdueOnly ? true : undefined,
          bypassed: bypassedOnly ? true : undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0, statusCounts: {}, overdueCount: 0, activeBypasses: 0 };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the Poka Yoke register.";
  }

  const items = data.items ?? [];
  const counts = data.statusCounts ?? {};
  // `protecting` reads statusCounts (scope-wide) and `activeBypasses` comes
  // from the server, so neither is a page-sized claim. `preventionCount` still
  // counts the loaded rows and is labelled as a proportion of what is shown
  // rather than a plant total.
  const bypassedCount = data.activeBypasses ?? 0;
  const protecting = Math.max(
    0,
    (counts.ACTIVE ?? 0) + (counts.VERIFIED ?? 0) - bypassedCount
  );
  const preventionCount = items.filter((d) => d.approach === "PREVENTION").length;

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/business-excellence/poka-yoke${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Poka Yoke"
        description="Mistake-proofing devices, what defect each one prevents, and the periodic check that proves it still works."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Poka Yoke" }
        ]}
        action={
          <Can permission="POKAYOKE.CREATE">
            <Button asChild>
              <Link href="/business-excellence/poka-yoke/new">
                <Plus size={16} /> Propose a device
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

      {loadError && <LoadError what="The Poka Yoke register" message={loadError} />}

      {/* Overdue gets its own banner rather than a tile people scroll past: an
          unverified device is the one state on this screen where somebody has
          to go and do something today. */}
      {data.overdueCount > 0 && !overdueOnly && (
        <Link
          href={qs({ overdue: "1" })}
          className="mb-4 flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm transition hover:bg-rose-100"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-900">
              {data.overdueCount} device{data.overdueCount === 1 ? "" : "s"} past a
              scheduled check
            </div>
            <div className="mt-0.5 text-rose-700">
              A device nobody has checked is a device nobody knows is working. Until it is
              verified, the line is running on an assumption.
            </div>
          </div>
        </Link>
      )}

      {bypassedCount > 0 && !bypassedOnly && (
        <Link
          href={qs({ bypassed: "1" })}
          className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm transition hover:bg-amber-100"
        >
          <ShieldOff size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <div className="font-semibold text-amber-900">
              {bypassedCount} device{bypassedCount === 1 ? " is" : "s are"} currently
              bypassed
            </div>
            <div className="mt-0.5 text-amber-800">
              Still fitted, not currently protecting anything. Each bypass carries a
              recorded reason and who authorised it.
            </div>
          </div>
        </Link>
      )}

      {/* Five tiles, and Active bypasses sits between Prevention type and
          Checks overdue on purpose. An overdue check means nobody has CONFIRMED
          a device works; an open bypass means somebody has confirmed it is
          switched off. The second is the more urgent fact, and it is the one
          the register previously never stated as a number at all.

          Both the bypass and overdue tiles LINK to their filtered list. A
          count nobody can click is a number people learn to scroll past. */}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatBox label="Devices" value={data.total} icon={ShieldCheck} />
        <StatBox
          label="Protecting the line"
          value={protecting}
          tone="success"
          icon={ShieldCheck}
          hint="Active or verified, and not currently bypassed"
        />
        <StatBox
          label="Prevention type"
          value={preventionCount}
          icon={Wrench}
          hint="The rest only detect the defect after it happens"
        />
        <StatBox
          label="Active bypasses"
          value={bypassedCount}
          tone={bypassedCount ? "danger" : "default"}
          icon={ShieldOff}
          href={bypassedCount ? qs({ bypassed: "1" }) : undefined}
          hint={
            bypassedCount
              ? "Fitted, authorised, and not protecting anything right now"
              : "No device is currently switched off"
          }
        />
        <StatBox
          label="Checks overdue"
          value={data.overdueCount}
          tone={data.overdueCount ? "danger" : "default"}
          icon={AlertTriangle}
          href={data.overdueCount ? qs({ overdue: "1" }) : undefined}
        />
      </div>

      <FilterTabsList label="Status" className="mb-3">
        {STATUS_TABS.map((t) => (
          <FilterTab
            key={t.code || "all"}
            href={qs({ status: t.code || undefined })}
            active={(searchParams.status ?? "") === t.code}
            label={t.code && counts[t.code] ? `${t.label} (${counts[t.code]})` : t.label}
          />
        ))}
      </FilterTabsList>

      <FilterTabsList label="Approach" className="mb-4">
        <FilterTab
          href={qs({ approach: undefined })}
          active={!searchParams.approach}
          label="All"
        />
        <FilterTab
          href={qs({ approach: "PREVENTION" })}
          active={searchParams.approach === "PREVENTION"}
          label="Prevention"
        />
        <FilterTab
          href={qs({ approach: "DETECTION" })}
          active={searchParams.approach === "DETECTION"}
          label="Detection"
        />
      </FilterTabsList>

      {items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={
            overdueOnly
              ? "No device has missed a check."
              : bypassedOnly
                ? "No device is currently bypassed."
                : "No mistake-proofing devices recorded yet."
          }
          description={
            loadError
              ? undefined
              : "Start with the defect that keeps coming back. If a jig, sensor or fixture already stops it, record that device — half of most plants' poka yoke is already fitted and undocumented."
          }
          action={
            <Can permission="POKAYOKE.CREATE">
              <Button asChild>
                <Link href="/business-excellence/poka-yoke/new">
                  <Plus size={16} /> Propose the first one
                </Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[960px] text-sm">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <TableHead className="px-4 py-3 font-medium">Device</TableHead>
                <TableHead className="px-4 py-3 font-medium">Prevents</TableHead>
                <TableHead className="px-4 py-3 font-medium">Approach</TableHead>
                <TableHead className="px-4 py-3 font-medium">Where</TableHead>
                <TableHead className="px-4 py-3 font-medium">Owner</TableHead>
                <TableHead className="px-4 py-3 font-medium">Next check</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id} className="border-b border-slate-100 align-top last:border-0">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/poka-yoke/${d.id}`}
                      code={d.deviceNo}
                      title={d.title}
                    />
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {DEVICE_TYPE_LABEL[d.deviceType] ?? d.deviceType}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] px-4 py-3 text-slate-600">
                    <span className="line-clamp-2">{d.defectModePrevented}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={APPROACH_LABEL[d.approach] ?? d.approach}
                      title={APPROACH_HINT[d.approach]}
                      className={
                        d.approach === "PREVENTION"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }
                    />

                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    <div>{d.siteName ?? "—"}</div>
                    <div className="text-xs text-slate-400">
                      {[d.areaName, d.lineOrMachine].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PersonRef person={d.owner} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={
                        d.isVerificationOverdue
                          ? "font-medium text-rose-700"
                          : "text-slate-600"
                      }
                    >
                      {d.nextVerificationDueAt ? fmtDue(d.nextVerificationDueAt) : "—"}
                    </span>
                    <div className="text-[11px] text-slate-400">
                      {FREQUENCY_LABEL[d.verificationFrequency] ?? d.verificationFrequency}
                      {d.lastVerifiedAt ? ` · last ${fmtDate(d.lastVerifiedAt)}` : ""}
                    </div>
                  </TableCell>
                  {/* displayStatus, not status. A bypassed device reads
                      "Bypassed" here instead of "Active" — the row must not
                      claim the device is protecting a line somebody has
                      switched it off. What it WAS is still in `status` and
                      still on the detail page. */}
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={POKA_YOKE_STATUS_LABEL[d.displayStatus] ?? d.displayStatus}
                      className={POKA_YOKE_STATUS_CHIP[d.displayStatus]}
                    />
                    {d.isBypassed && d.bypassOpenHours !== null && (
                      <div className="mt-0.5 text-[11px] text-amber-700">
                        {fmtDuration(d.bypassOpenHours)} so far
                      </div>
                    )}
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
