"use client";

// PTW Control Center (docs/ptw-control-center/PLAN.md). ONE request per refresh:
// every widget reads the same GET /api/ptw/control-center payload, polled every
// 30 s (usePolling: refetch on focus, back off on errors, keep the last good
// data — the board never blanks). Filters live in the URL so a view is
// shareable. `mode="wall"` is the TV view: no filters, 1.4× type, rotating
// between Overview and Map + Guidance every 45 s (paused while hovered).
// Portal look throughout (shadcn components, standard page header + tabs).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePolling } from "@/hooks/use-polling";
import { readApiError } from "@/lib/client-errors";
import { defaultZone, filterQuery, type ControlCenterPayload, type OpsException, type RangeKey, type ZoneGuidance } from "@/lib/ptw/ops";
import { HeaderBar, LiveClock, type Filters } from "./header-bar";
import { ShiftBrief } from "./shift-brief";
import { KpiBand } from "./kpi-band";
import { SiteMap } from "./site-map";
import { ZoneGuidanceStrip } from "./zone-guidance";
import { ExceptionsList } from "./exceptions-list";
import { ImpairmentsPanel } from "./impairments-panel";
import { Pipeline } from "./pipeline";
import { Timeline } from "./timeline";
import { TypeMix } from "./type-mix";
import { ComplianceHealth, ContractorsPeople, SafetySignals } from "./bottom-row";
import { PermitDrawer } from "./permit-drawer";

const REFRESH_MS = 30_000;
const ROTATE_MS = 45_000;
const RANGES: RangeKey[] = ["shift", "today", "7d"];

function readFilters(sp: URLSearchParams | null, fallbackPlant: string | null): Filters {
  const range = (sp?.get("range") ?? "") as RangeKey;
  return {
    plant: sp?.get("plant") ?? sp?.get("plantId") ?? fallbackPlant,
    area: sp?.get("area") || null,
    shift: sp?.get("shift") || null,
    range: RANGES.includes(range) ? range : sp?.get("shift") ? "shift" : "today",
  };
}

export function PtwControlCenter({
  plants = [],
  defaultPlantId = null,
  mode = "page",
  kioskToken,
}: {
  plants?: { id: string; name: string }[];
  defaultPlantId?: string | null;
  mode?: "page" | "wall";
  kioskToken?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const wall = mode === "wall";
  const filters = readFilters(sp, defaultPlantId);
  const kiosk = wall && !!kioskToken;

  const q = filterQuery({ plant: kiosk ? null : filters.plant, area: filters.area, shift: filters.shift, range: filters.range });
  const url = kiosk ? `/api/ptw/kiosk/control-center${q}` : `/api/ptw/control-center${q}`;
  const headers = useMemo(() => (kiosk ? { "x-kiosk-token": kioskToken! } : undefined), [kiosk, kioskToken]);
  const { data, error, loading, updatedAt, failures, refresh } = usePolling<ControlCenterPayload>(url, {
    intervalMs: REFRESH_MS,
    headers,
    keepOnUrlChange: true,
  });
  // A refresh for a different plant must not show the previous plant's numbers.
  const d = data && (!filters.plant || kiosk || data.plant.id === filters.plant) ? data : null;

  const setFilters = useCallback(
    (next: Partial<Filters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams(sp?.toString() ?? "");
      for (const k of ["plant", "plantId", "area", "shift", "range"]) params.delete(k);
      const fq = filterQuery(merged);
      new URLSearchParams(fq.slice(1)).forEach((v, k) => params.set(k, v));
      const s = params.toString();
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [filters, sp, pathname, router]
  );

  // Selected zone: first impaired zone, else the first; reset if it vanishes.
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    if (!d) return;
    const ids = d.map.zones.map((z) => z.id);
    if (filters.area && ids.includes(filters.area)) {
      setZone((z) => (z && ids.includes(z) && z === filters.area ? z : filters.area));
      return;
    }
    setZone((z) => (z && ids.includes(z) ? z : defaultZone(d.map.zones)));
  }, [d, filters.area]);

  const fetchGuidance = useCallback(
    async (areaId: string): Promise<ZoneGuidance> => {
      const res = kiosk
        ? await fetch(`/api/ptw/kiosk/zones/${areaId}/guidance`, { cache: "no-store", headers: { "x-kiosk-token": kioskToken! } })
        : await fetch(`/api/ptw/zones/${areaId}/guidance`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not load guidance"));
      return res.json();
    },
    [kiosk, kioskToken]
  );

  const [drawer, setDrawer] = useState<string | null>(null);
  const openException = (e: OpsException) => {
    if (e.permitId) setDrawer(e.permitId);
    else if (e.impairmentId && !wall) router.push(`/ptw?tab=impairments#imp-${e.impairmentId}`);
  };
  const scrollToExceptions = () => document.getElementById("ptw-exceptions")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ── wall rotation ──
  const [view, setView] = useState<0 | 1>(0);
  const [paused, setPaused] = useState(false);
  // Hover pauses the rotation; a cursor left resting on the TV must not pause it
  // forever, so it resumes after a minute without mouse movement.
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWallMove = useCallback(() => {
    setPaused(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setPaused(false), 60_000);
  }, []);
  const onWallLeave = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    setPaused(false);
  }, []);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  useEffect(() => {
    if (!wall || paused) return;
    const t = setInterval(() => setView((v) => (v === 0 ? 1 : 0)), ROTATE_MS);
    return () => clearInterval(t);
  }, [wall, paused]);

  const wallHref = `/ptw/control-center?mode=wall${q ? `&${q.slice(1)}` : ""}`;
  const err = error && !d ? error : null;
  const guidanceKey = d?.generatedAt;

  const mapBlock = (
    <div className="min-w-0" style={{ flex: "999 1 640px" }}>
      <SiteMap data={d} loading={loading} error={err} selected={zone} onSelect={setZone} onOpenPermit={setDrawer} />
      <ZoneGuidanceStrip areaId={zone} fetcher={fetchGuidance} refreshKey={guidanceKey} />
    </div>
  );

  const errorBox = (msg: string, retry?: boolean) => (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle size={16} aria-hidden /> {msg}
      {retry && <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>}
    </div>
  );

  if (wall) {
    // TV view: the portal's own look, scaled up 1.4× for distance reading.
    return (
      <div
        className="min-h-screen bg-slate-50 p-6"
        style={{ zoom: 1.4 }}
        onMouseMove={onWallMove}
        onMouseLeave={onWallLeave}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-700">Permit to Work · Control Center</div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{d?.plant.name ?? "Connecting…"}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div role="tablist" aria-label="Wall view" className="flex items-center gap-2">
              {["Overview", "Map + Guidance"].map((label, i) => (
                <Button
                  key={label}
                  type="button"
                  role="tab"
                  size="sm"
                  aria-selected={view === i}
                  variant={view === i ? "default" : "outline"}
                  onClick={() => setView(i as 0 | 1)}
                >
                  {label}
                </Button>
              ))}
              {paused && <Badge className="border-slate-200 bg-white text-slate-600">paused</Badge>}
            </div>
            <LiveClock updatedAt={updatedAt} failures={failures} large />
          </div>
        </div>
        {err && !d ? (
          errorBox(err)
        ) : view === 0 ? (
          <div className="space-y-4">
            <ShiftBrief data={d} onViewActions={scrollToExceptions} />
            <KpiBand data={d} loading={loading} />
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 space-y-4" style={{ flex: "999 1 640px" }}>
                <Pipeline data={d} loading={loading} interactive={false} />
                <Timeline data={d} loading={loading} onOpenPermit={setDrawer} />
              </div>
              <div className="min-w-0" style={{ flex: "1 1 380px" }}>
                <ExceptionsList data={d} loading={loading} limit={6} onOpen={openException} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {mapBlock}
              <div className="min-w-0" style={{ flex: "1 1 380px" }}>
                <ExceptionsList data={d} loading={loading} limit={6} onOpen={openException} />
              </div>
            </div>
            <ImpairmentsPanel data={d} loading={loading} readOnly />
          </div>
        )}
        <PermitDrawer permitId={drawer} onClose={() => setDrawer(null)} readOnly={kiosk} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeaderBar
        data={d}
        filters={filters}
        plants={plants}
        onChange={setFilters}
        updatedAt={updatedAt}
        failures={failures}
        wallHref={wallHref}
        onRefresh={refresh}
        loading={loading}
      />
      {err && errorBox(err, true)}
      {d && !d.setup.tablesReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Impairments, zone guidance, persisted exceptions and the shift brief need the Control Center tables. An
          administrator runs <code className="font-mono">prisma/apply-ptw-control-center-ddl.ts</code> once; until then
          the board shows live permit data with the default conflict rules.
        </div>
      )}
      <ShiftBrief data={d} onViewActions={scrollToExceptions} />
      <KpiBand data={d} loading={loading} />
      <div className="flex flex-wrap gap-4">
        {mapBlock}
        <div className="min-w-0" style={{ flex: "1 1 380px" }}>
          <ExceptionsList data={d} loading={loading} error={err} onOpen={openException} />
        </div>
      </div>
      <ImpairmentsPanel data={d} loading={loading} error={err} onChanged={refresh} />
      <Pipeline data={d} loading={loading} error={err} />
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0" style={{ flex: "999 1 640px" }}>
          <Timeline data={d} loading={loading} error={err} onOpenPermit={setDrawer} />
        </div>
        <div className="min-w-0" style={{ flex: "1 1 320px" }}>
          <TypeMix data={d} loading={loading} error={err} />
        </div>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <ComplianceHealth data={d} loading={loading} error={err} />
        <ContractorsPeople data={d} loading={loading} error={err} />
        <SafetySignals data={d} loading={loading} error={err} />
      </div>
      <PermitDrawer permitId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
