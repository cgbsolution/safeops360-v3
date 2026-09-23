"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Save, Send, ShieldCheck, AlertTriangle, Lock, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  DATA_QUALITY_OPTIONS, FLOW_LABEL, MX, STREAM_LABEL, fmtInr, fmtNum,
  type Cycle, type EnvMetric, type EnvSlot, type EnvTotals,
} from "../../lib-brsr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Plant = { id: string; name: string };
type Draft = Record<string, { quantity: string; dataQuality: string; treatmentLevel: string }>;

/** Slot key must match the backend's unique slot: category + flow + destination. */
const slotKey = (s: { categoryCode: string; flowType: string; destination: string }) =>
  `${s.categoryCode}|${s.flowType}|${s.destination}`;

const STREAM_ORDER = ["ENERGY", "WATER", "EMISSIONS", "WASTE"];

export function EnvironmentView({
  cycle, metrics, slots, totals, plants,
}: {
  cycle: Cycle;
  metrics: EnvMetric[];
  slots: EnvSlot[];
  totals: EnvTotals | null;
  plants: Plant[];
}) {
  const router = useRouter();
  const locked = cycle.status === "FILED";
  const [selectedId, setSelectedId] = useState<string | null>(metrics[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newSiteId, setNewSiteId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openStreams, setOpenStreams] = useState<Set<string>>(new Set(["EMISSIONS"]));

  const selected = metrics.find((m) => m.id === selectedId) ?? null;

  const [draft, setDraft] = useState<Draft>({});
  const [header, setHeader] = useState({
    turnoverInr: "", productionVolume: "", productionUnit: "", scope3TCo2e: "",
    scope3Methodology: "", consentStatus: "",
  });

  // Re-seed the form whenever a different submission is selected.
  const seededFor = useMemo(() => selected?.id ?? null, [selected?.id]);
  const [seeded, setSeeded] = useState<string | null>(null);
  if (selected && seeded !== seededFor) {
    const d: Draft = {};
    for (const l of selected.lines) {
      d[slotKey(l)] = {
        quantity: l.quantity?.toString() ?? "",
        dataQuality: l.dataQuality ?? "",
        treatmentLevel: l.treatmentLevel ?? "",
      };
    }
    setDraft(d);
    setHeader({
      turnoverInr: selected.turnoverInr?.toString() ?? "",
      productionVolume: selected.productionVolume?.toString() ?? "",
      productionUnit: selected.productionUnit ?? "",
      scope3TCo2e: selected.scope3TCo2e?.toString() ?? "",
      scope3Methodology: selected.scope3Methodology ?? "",
      consentStatus: selected.consentStatus ?? "",
    });
    setSeeded(seededFor);
  }

  const editable = !locked && selected && selected.status !== "VERIFIED";

  async function createSubmission() {
    if (!newSiteId) return;
    setBusy("create");
    setErr(null);
    try {
      const res = await fetch(`/api/brsr/cycles/${cycle.id}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: newSiteId, periodLabel: cycle.financialYear }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Could not open the submission (${res.status})`);
      }
      setCreating(false);
      setNewSiteId("");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not open the submission");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!selected) return;
    setBusy("save");
    setErr(null);
    try {
      const lines = slots
        .map((s) => {
          const d = draft[slotKey(s)];
          if (!d || d.quantity.trim() === "") return null;
          return {
            stream: s.stream,
            categoryCode: s.categoryCode,
            flowType: s.flowType,
            destination: s.destination,
            treatmentLevel: d.treatmentLevel || null,
            quantity: Number(d.quantity),
            unit: s.unit,
            dataQuality: d.dataQuality || null,
          };
        })
        .filter(Boolean);

      const res = await fetch(`/api/brsr/cycles/${cycle.id}/env/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnoverInr: header.turnoverInr === "" ? null : Number(header.turnoverInr),
          productionVolume: header.productionVolume === "" ? null : Number(header.productionVolume),
          productionUnit: header.productionUnit || null,
          scope3TCo2e: header.scope3TCo2e === "" ? null : Number(header.scope3TCo2e),
          scope3Methodology: header.scope3Methodology || null,
          consentStatus: header.consentStatus || null,
          lines,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Could not save (${res.status})`);
      }
      setSeeded(null);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(target: string) {
    if (!selected) return;
    setBusy(target);
    setErr(null);
    try {
      const res = await fetch(
        `/api/brsr/cycles/${cycle.id}/env/${selected.id}/status?target=${target}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Could not move to ${target}`);
      }
      setSeeded(null);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Status change failed");
    } finally {
      setBusy(null);
    }
  }

  const takenSites = new Set(metrics.map((m) => m.siteId));
  const availableSites = plants.filter((p) => !takenSites.has(p.id));

  return (
    <div className="space-y-4" style={{ fontFamily: MX.body }}>
      {/* ── entity totals ── */}
      {totals && totals.sitesReporting > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: MX.iceDeep, background: MX.ice }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MX.navy }}>
            Entity total — {totals.sitesReporting} site{totals.sitesReporting === 1 ? "" : "s"} submitted or verified
          </div>
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm" style={{ color: MX.navy }}>
            <span>Scope 1 <strong className="tabular-nums">{fmtNum(totals.scope1TCo2e)}</strong> tCO₂e</span>
            <span>Scope 2 <strong className="tabular-nums">{fmtNum(totals.scope2TCo2e)}</strong> tCO₂e</span>
            <span>Energy <strong className="tabular-nums">{fmtNum(totals.energyTotalGj)}</strong> GJ</span>
            <span>Water withdrawn <strong className="tabular-nums">{fmtNum(totals.waterWithdrawnKl)}</strong> kL</span>
            <span>Waste <strong className="tabular-nums">{fmtNum(totals.wasteGeneratedT)}</strong> MT</span>
            <span>Turnover <strong>{fmtInr(totals.turnoverInr)}</strong></span>
          </div>
          {totals.unresolvedEmissionLines > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {totals.unresolvedEmissionLines} emission line(s) have no resolvable factor and are excluded
              from the Scope totals above.
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* ── site list ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
              Facility returns
            </h3>
            {!locked && availableSites.length > 0 && (
              <Button variant="bare"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: MX.navy }}
              >
                <Plus size={12} /> Add
              </Button>
            )}
          </div>

          {metrics.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
              No facility has opened a return for {cycle.financialYear}.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {metrics.map((m) => (
                <Button variant="bare"
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-0"
                  style={m.id === selectedId ? { background: MX.ice } : undefined}
                >
                  <div className="text-sm font-medium text-slate-800">{m.siteName ?? "Site"}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                      style={
                        m.status === "VERIFIED"
                          ? { background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }
                          : m.status === "SUBMITTED"
                            ? { background: MX.ice, color: MX.navy, borderColor: MX.iceDeep }
                            : { background: "#f8fafc", color: "#64748b", borderColor: "#e2e8f0" }
                      }
                    >
                      {m.status.toLowerCase()}
                    </span>
                    <span className="text-[10px] text-slate-400">{m.lines.length} lines</span>
                  </div>
                </Button>
              ))}
            </div>
          )}

          {creating && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Site
              </Label>
              <Select
                className="h-auto w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={newSiteId}
                onChange={(e) => setNewSiteId(e.target.value)}
              >
                <SelectItem value="">Choose a site…</SelectItem>
                {availableSites.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </Select>
              <div className="mt-2 flex gap-2">
                <Button variant="bare" onClick={() => setCreating(false)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                  Cancel
                </Button>
                <Button variant="bare"
                  onClick={createSubmission}
                  disabled={!newSiteId || busy === "create"}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: MX.navy }}
                >
                  Open
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── capture form ── */}
        {!selected ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Select or add a facility return to capture its environmental data.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <div>
                  <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
                    {selected.siteName ?? "Site"} — {selected.periodLabel}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {selected.status === "VERIFIED"
                      ? "Verified. Reopen to draft before editing."
                      : selected.status === "SUBMITTED"
                        ? "Submitted — these figures now feed the disclosure totals."
                        : "Draft — excluded from the disclosure totals until submitted."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {locked && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Lock size={12} /> cycle filed
                    </span>
                  )}
                  {editable && (
                    <Button variant="bare"
                      onClick={save}
                      disabled={busy === "save"}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: MX.navy }}
                    >
                      <Save size={12} /> {busy === "save" ? "Saving…" : "Save"}
                    </Button>
                  )}
                  {!locked && selected.status === "DRAFT" && (
                    <Button variant="bare"
                      onClick={() => setStatus("SUBMITTED")}
                      disabled={busy === "SUBMITTED"}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ borderColor: MX.navy, color: MX.navy }}
                    >
                      <Send size={12} /> Submit
                    </Button>
                  )}
                  {!locked && selected.status === "SUBMITTED" && (
                    <Button variant="bare"
                      onClick={() => setStatus("VERIFIED")}
                      disabled={busy === "VERIFIED"}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: "#047857" }}
                    >
                      <ShieldCheck size={12} /> Verify
                    </Button>
                  )}
                  {!locked && selected.status === "VERIFIED" && (
                    <Button variant="bare"
                      onClick={() => setStatus("DRAFT")}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {/* denominators */}
              <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
                <Field label="Turnover (INR)" hint="Denominator for intensity ratios">
                  <Input
                    type="number" step="any" disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    value={header.turnoverInr}
                    onChange={(e) => setHeader({ ...header, turnoverInr: e.target.value })}
                  />
                </Field>
                <Field label="Production volume" hint="Optional physical-output denominator">
                  <Input
                    type="number" step="any" disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    value={header.productionVolume}
                    onChange={(e) => setHeader({ ...header, productionVolume: e.target.value })}
                  />
                </Field>
                <Field label="Production unit">
                  <Input
                    disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="MT, pieces, …"
                    value={header.productionUnit}
                    onChange={(e) => setHeader({ ...header, productionUnit: e.target.value })}
                  />
                </Field>
                <Field label="Scope 3 (tCO₂e)" hint="Entered manually — no calculator is applied">
                  <Input
                    type="number" step="any" disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    value={header.scope3TCo2e}
                    onChange={(e) => setHeader({ ...header, scope3TCo2e: e.target.value })}
                  />
                </Field>
                <Field label="Scope 3 methodology" hint="How the figure was arrived at">
                  <Input
                    disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={header.scope3Methodology}
                    onChange={(e) => setHeader({ ...header, scope3Methodology: e.target.value })}
                  />
                </Field>
                <Field label="SPCB consent standing">
                  <Input
                    disabled={!editable}
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={header.consentStatus}
                    onChange={(e) => setHeader({ ...header, consentStatus: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            {/* ── the capture grid, one panel per stream ── */}
            {STREAM_ORDER.map((stream) => {
              const streamSlots = slots.filter((s) => s.stream === stream);
              if (streamSlots.length === 0) return null;
              const isOpen = openStreams.has(stream);
              const filled = streamSlots.filter((s) => draft[slotKey(s)]?.quantity).length;
              return (
                <div key={stream} className="rounded-xl border border-slate-200 bg-white">
                  <Button variant="bare"
                    onClick={() =>
                      setOpenStreams((p) => {
                        const n = new Set(p);
                        n.has(stream) ? n.delete(stream) : n.add(stream);
                        return n;
                      })
                    }
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
                        {STREAM_LABEL[stream]}
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {filled} of {streamSlots.length} entered
                    </span>
                  </Button>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <Table className="w-full text-xs">
                        <TableHeader>
                          <TableRow className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                            <TableHead className="h-auto text-xs text-slate-500 px-3 py-1.5 font-semibold">Category</TableHead>
                            {stream !== "ENERGY" && stream !== "EMISSIONS" && (
                              <TableHead className="h-auto text-xs text-slate-500 px-3 py-1.5 font-semibold">Flow</TableHead>
                            )}
                            {stream === "WATER" && <TableHead className="h-auto text-xs text-slate-500 px-3 py-1.5 font-semibold">Destination</TableHead>}
                            <TableHead className="h-auto text-xs text-slate-500 w-32 px-3 py-1.5 font-semibold">Quantity</TableHead>
                            <TableHead className="h-auto text-xs text-slate-500 w-16 px-3 py-1.5 font-semibold">Unit</TableHead>
                            <TableHead className="h-auto text-xs text-slate-500 w-36 px-3 py-1.5 font-semibold">Data source</TableHead>
                            {stream === "EMISSIONS" && (
                              <TableHead className="h-auto text-xs text-slate-500 px-3 py-1.5 font-semibold">Computed</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {streamSlots.map((s) => {
                            const k = slotKey(s);
                            const d = draft[k] ?? { quantity: "", dataQuality: "", treatmentLevel: "" };
                            const line = selected.lines.find((l) => slotKey(l) === k);
                            return (
                              <TableRow key={k} className="border-b border-slate-50 last:border-0">
                                <TableCell className="px-3 py-1.5 text-slate-700">{s.categoryLabel}</TableCell>
                                {stream !== "ENERGY" && stream !== "EMISSIONS" && (
                                  <TableCell className="px-3 py-1.5 text-slate-500">{FLOW_LABEL[s.flowType] ?? s.flowType}</TableCell>
                                )}
                                {stream === "WATER" && (
                                  <TableCell className="px-3 py-1.5 text-slate-500">{s.destinationLabel ?? "—"}</TableCell>
                                )}
                                <TableCell className="px-2 py-1">
                                  <Input
                                    type="number" step="any" disabled={!editable}
                                    className="h-auto w-full rounded border border-slate-200 px-2 py-1 text-xs tabular-nums"
                                    value={d.quantity}
                                    onChange={(e) =>
                                      setDraft({ ...draft, [k]: { ...d, quantity: e.target.value } })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-1.5 text-slate-400">{s.unit}</TableCell>
                                <TableCell className="px-2 py-1">
                                  <Select
                                    disabled={!editable}
                                    className="h-auto w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
                                    value={d.dataQuality}
                                    onChange={(e) =>
                                      setDraft({ ...draft, [k]: { ...d, dataQuality: e.target.value } })
                                    }
                                  >
                                    <SelectItem value="">—</SelectItem>
                                    {DATA_QUALITY_OPTIONS.map((o) => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </Select>
                                </TableCell>
                                {stream === "EMISSIONS" && (
                                  <TableCell className="px-3 py-1.5">
                                    {line?.computedTCo2e !== null && line?.computedTCo2e !== undefined ? (
                                      <span title={line.factorSource ?? undefined}>
                                        <strong className="tabular-nums" style={{ color: MX.navy }}>
                                          {fmtNum(line.computedTCo2e)}
                                        </strong>{" "}
                                        <span className="text-slate-400">tCO₂e</span>
                                        {line.factorSource && (
                                          <div className="text-[10px] leading-tight text-slate-400">
                                            {line.factorSource}
                                          </div>
                                        )}
                                      </span>
                                    ) : d.quantity ? (
                                      <span className="text-[10px] text-amber-700">
                                        save to compute
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <p className="border-t border-slate-50 px-3 py-2 text-[11px] text-slate-400">
                        A blank cell is not saved as zero — “not applicable to this site” and “measured
                        zero” are different disclosures. Enter 0 explicitly for a measured zero.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Label className="block font-normal leading-normal text-inherit">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span>}
    </Label>
  );
}
