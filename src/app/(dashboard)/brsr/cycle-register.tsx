"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText, Lock, ArrowRight } from "lucide-react";
import {
  CYCLE_STATUS_CHIP, CYCLE_STATUS_LABEL, MX, fmtDate, type Cycle,
} from "./lib-brsr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Derives the default FY label and period from today's date (Indian FY: Apr–Mar). */
function defaultFy(): { label: string; start: string; end: string } {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    label: `FY${y}-${String((y + 1) % 100).padStart(2, "0")}`,
    start: `${y}-04-01`,
    end: `${y + 1}-03-31`,
  };
}

export function CycleRegister({ cycles }: { cycles: Cycle[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = defaultFy();
  const [form, setForm] = useState({
    financialYear: d.label,
    periodStart: d.start,
    periodEnd: d.end,
    entityName: "",
    cin: "",
  });

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brsr/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financialYear: form.financialYear,
          periodStart: new Date(form.periodStart).toISOString(),
          periodEnd: new Date(form.periodEnd).toISOString(),
          entityName: form.entityName || null,
          cin: form.cin || null,
          stockExchangeCodes: [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Could not open the cycle (${res.status})`);
      }
      const created: Cycle = await res.json();
      setOpen(false);
      router.push(`/brsr/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not open the cycle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" style={{ fontFamily: MX.body }}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {cycles.length === 0
            ? "No reporting cycles yet."
            : `${cycles.length} reporting ${cycles.length === 1 ? "cycle" : "cycles"}.`}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/brsr/trends"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Year-over-year trends
          </Link>
          <Button variant="bare"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ background: MX.navy }}
          >
            <Plus size={15} /> Open a cycle
          </Button>
        </div>
      </div>

      {cycles.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: MX.iceDeep, background: MX.ice }}
        >
          <FileText size={28} className="mx-auto mb-3" style={{ color: MX.navy }} />
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: MX.display, color: MX.navy }}
          >
            No BRSR cycle open yet
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
            A cycle covers one financial year for the listed entity. Opening one creates the nine
            Principle responses and lets the mapping engine pull what it can from ERM, Manhours,
            Incidents, Training, Contractor Management and Facilities.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table className="w-full text-sm">
            <TableHeader className="bg-transparent">
              <TableRow className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Financial year</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Entity</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Period</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Status</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Completion</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">From platform data</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <TableCell className="px-4 py-3">
                    <Link href={`/brsr/${c.id}`} className="font-semibold" style={{ color: MX.navy }}>
                      {c.financialYear}
                    </Link>
                    {c.status === "FILED" && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Lock size={11} /> immutable
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-700">{c.entityName ?? "—"}</TableCell>
                  <TableCell className="px-4 py-3 text-slate-500">
                    {fmtDate(c.periodStart)} – {fmtDate(c.periodEnd)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${CYCLE_STATUS_CHIP[c.status]}`}>
                      {CYCLE_STATUS_LABEL[c.status]}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, c.completionPct)}%`, background: MX.navy }}
                        />
                      </div>
                      <span className="tabular-nums text-slate-700">{c.completionPct.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-slate-600">
                    {c.autoPopulatedPct.toFixed(1)}%
                    <span className="ml-1 text-[11px] text-slate-400">of answered</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Link href={`/brsr/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: MX.navy }}>
                      Open <ArrowRight size={12} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-base font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
                Open a BRSR reporting cycle
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                One cycle per financial year. The nine Principle responses are created with it.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <Field label="Financial year">
                <Input
                  className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.financialYear}
                  onChange={(e) => setForm({ ...form, financialYear: e.target.value })}
                  placeholder="FY2025-26"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period start">
                  <Input
                    type="date"
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.periodStart}
                    onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                  />
                </Field>
                <Field label="Period end">
                  <Input
                    type="date"
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.periodEnd}
                    onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Entity name (optional)">
                <Input
                  className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.entityName}
                  onChange={(e) => setForm({ ...form, entityName: e.target.value })}
                />
              </Field>
              <Field label="CIN (optional)">
                <Input
                  className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.cin}
                  onChange={(e) => setForm({ ...form, cin: e.target.value })}
                />
              </Field>
              {err && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {err}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button variant="bare"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                Cancel
              </Button>
              <Button variant="bare"
                onClick={create}
                disabled={busy || !form.financialYear.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: MX.navy }}
              >
                {busy ? "Opening…" : "Open cycle"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block font-normal leading-normal text-inherit">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </Label>
  );
}
