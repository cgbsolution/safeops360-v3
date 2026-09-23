// "Where the backlog is" — the one thing the deleted Analytics Explorer knew
// that nothing else did.
//
// The Explorer was a module picker over a shared drill-down view. Once every
// register carries its own Analytics tab, the drill-down half is a second door
// to the same screen and was removed. The picker half was not redundant: it was
// the only place in the product that put every flow's backlog side by side, so
// a reader could see WHICH register was worth opening before opening one. That
// belongs next to the cross-module signals, which answer the same question from
// the other direction, so it moved here rather than staying a fourth Tier-1
// entry in the sidebar.
//
// One call, not fourteen: `GET /api/analytics/summary` computes every flow the
// caller can see in a single request and OMITS the ones they cannot read —
// showing "0 open incidents" to someone without INCIDENT.READ is a false
// statement about the business, and a hub is exactly where it would be believed.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";
import { analyticsHrefForFlow } from "@/lib/registers";

type FlowSummary = {
  flow: string;
  label: string;
  recordCount: number;
  summary?: { open?: number };
  sla?: { overdue?: number };
};

export async function RegisterFindingsBand() {
  let flows: FlowSummary[] = [];
  try {
    const res = await backendFetch<{ flows: FlowSummary[] }>("/api/analytics/summary", {
      query: { months: 12 },
    });
    flows = res.flows ?? [];
  } catch {
    // The signals below are the page. A backlog band that cannot load says so
    // by being absent rather than by blanking the screen around it.
    return null;
  }

  const rows = flows
    .map((f) => ({
      ...f,
      href: analyticsHrefForFlow(f.flow),
      open: f.summary?.open ?? 0,
      overdue: f.sla?.overdue ?? 0,
    }))
    // A flow whose analytics no register claims has nowhere to send the
    // reader; a chip that navigates nowhere is worse than one fewer chip.
    .filter((f) => f.href && f.recordCount > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  if (rows.length === 0) return null;

  return (
    <section
      className="mb-5 rounded-xl border p-3"
      style={{ borderColor: NAVY[200], backgroundColor: NAVY[50] }}
    >
      <h2
        className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Open backlog by register — overdue first
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((f) => (
          <Link
            key={f.flow}
            href={f.href!}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-primary-500"
            style={{ borderColor: NAVY[200], color: INK.base }}
          >
            {f.label}
            {f.overdue > 0 && (
              <span
                className="rounded px-1 text-[10px] font-bold tabular-nums"
                style={{ backgroundColor: STATUS.high.tint, color: STATUS.high.ink }}
                title={`${f.overdue} overdue`}
              >
                {f.overdue}
              </span>
            )}
            <span className="text-[10px] font-normal tabular-nums" style={{ color: INK.faint }}>
              {f.open} open
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
