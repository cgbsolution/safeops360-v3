"use client";

import { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { MX, type IndicatorWithValue } from "../../../lib-brsr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const MIN_OVERRIDE_CHARS = 10;

/**
 * Editor for one BRSR indicator.
 *
 * Renders from `indicator.valueType` and `tableSchemaJson`, so the P2/P4/P7/P8
 * manual forms are the SEBI taxonomy rendered as data rather than four
 * hand-built forms that would drift from it.
 *
 * The override rule is mirrored here, not owned here: the server re-checks it.
 * This copy exists so the requirement is visible while typing, not discovered
 * on submit.
 */
export function IndicatorEditor({
  cycleId, row, onClose, onSaved,
}: {
  cycleId: string;
  row: IndicatorWithValue;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { indicator: ind, value: iv } = row;
  const wasAuto = iv?.provenance === "AUTO";

  const [num, setNum] = useState<string>(iv?.valueNumber?.toString() ?? "");
  const [text, setText] = useState<string>(iv?.valueText ?? "");
  const [bool, setBool] = useState<boolean | null>(iv?.valueBoolean ?? null);
  const [rows, setRows] = useState<Record<string, string>[]>(
    Array.isArray(iv?.valueJson) ? (iv!.valueJson as Record<string, string>[]) : []
  );
  const [na, setNa] = useState(iv?.provenance === "NOT_APPLICABLE");
  const [naReason, setNaReason] = useState(iv?.notApplicableReason ?? "");
  const [overrideReason, setOverrideReason] = useState("");
  const [evidenceNote, setEvidenceNote] = useState(iv?.evidenceNote ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cols = ind.tableSchemaJson ?? [];
  const needsOverrideReason = wasAuto && !na;
  const overrideTooShort =
    needsOverrideReason && overrideReason.trim().length < MIN_OVERRIDE_CHARS;
  const naMissingReason = na && !naReason.trim();

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        notApplicable: na,
        notApplicableReason: na ? naReason : null,
        overrideReason: needsOverrideReason ? overrideReason : null,
        evidenceNote: evidenceNote || null,
        unit: iv?.unit ?? ind.unit ?? null,
      };
      if (!na) {
        if (ind.valueType === "NUMBER") body.valueNumber = num === "" ? null : Number(num);
        else if (ind.valueType === "BOOLEAN") body.valueBoolean = bool;
        else if (ind.valueType === "TABLE") body.valueJson = rows;
        else body.valueText = text;
      }
      const res = await fetch(`/api/brsr/cycles/${cycleId}/values/${ind.code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Could not save (${res.status})`);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl" style={{ fontFamily: MX.body }}>
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
              {ind.code}
            </span>
            {!ind.isMandatory && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                voluntary
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-sm font-semibold leading-snug" style={{ color: MX.navy }}>
            {ind.label}
          </h2>
          {ind.guidance && <p className="mt-1 text-xs text-slate-500">{ind.guidance}</p>}
          {ind.sebiFormatVersion === "DRAFT-UNVERIFIED" && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              This indicator's wording has not yet been reconciled against the current SEBI circular.
            </p>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          {wasAuto && (
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: MX.iceDeep, background: MX.ice, color: MX.navy }}>
              <strong>The platform derived this figure.</strong>{" "}
              {iv?.derivationNote}
              <div className="mt-1 text-slate-600">
                Changing it records an override against your name, keeps the platform's number for
                comparison, and requires a justification.
              </div>
            </div>
          )}

          <Label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 font-normal leading-normal text-inherit">
            <Checkbox
              className="mt-0.5"
              checked={na}
              onChange={(e) => setNa(e.target.checked)}
            />
            <span className="text-xs text-slate-700">
              <strong>Not applicable to this entity.</strong> Counts as a complete disclosure, but only
              with a reason — an unexplained N/A on a mandatory indicator is a finding waiting to happen.
            </span>
          </Label>

          {na ? (
            <Field label="Why is this not applicable?">
              <Textarea
                className="min-h-0 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={naReason}
                onChange={(e) => setNaReason(e.target.value)}
                placeholder="e.g. The entity operates no facilities in an ecologically sensitive area."
              />
            </Field>
          ) : (
            <>
              {ind.valueType === "NUMBER" && (
                <Field label={`Value${ind.unit ? ` (${ind.unit})` : ""}`}>
                  <Input
                    type="number"
                    step="any"
                    className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    value={num}
                    onChange={(e) => setNum(e.target.value)}
                  />
                </Field>
              )}

              {ind.valueType === "BOOLEAN" && (
                <Field label="Answer">
                  <div className="flex gap-2">
                    {[
                      { v: true, l: "Yes" },
                      { v: false, l: "No" },
                    ].map((o) => (
                      <Button variant="bare"
                        key={o.l}
                        onClick={() => setBool(o.v)}
                        className="rounded-lg border px-4 py-2 text-sm font-medium"
                        style={
                          bool === o.v
                            ? { background: MX.navy, color: "#fff", borderColor: MX.navy }
                            : { borderColor: "#e2e8f0", color: "#334155" }
                        }
                      >
                        {o.l}
                      </Button>
                    ))}
                  </div>
                </Field>
              )}

              {ind.valueType === "TEXT" && (
                <Field label="Disclosure">
                  <Textarea
                    className="min-h-0 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={5}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>
              )}

              {ind.valueType === "TABLE" && (
                <Field label="Disclosure table">
                  {cols.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No column definition is seeded for this indicator.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <Table className="w-full text-xs">
                        <TableHeader>
                          <TableRow className="border-b border-slate-100 bg-slate-50 text-left">
                            {cols.map((c) => (
                              <TableHead key={c.key} className="h-auto text-xs px-2 py-1.5 font-semibold text-slate-600">
                                {c.label}
                              </TableHead>
                            ))}
                            <TableHead className="h-auto w-8 px-2 py-1.5" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r, i) => (
                            <TableRow key={i} className="border-b border-slate-50 last:border-0">
                              {cols.map((c) => (
                                <TableCell key={c.key} className="px-1 py-1">
                                  <Input
                                    type={c.type === "NUMBER" ? "number" : "text"}
                                    step="any"
                                    className="h-auto w-full rounded border border-slate-200 px-2 py-1 text-xs"
                                    value={r[c.key] ?? ""}
                                    onChange={(e) => {
                                      const copy = [...rows];
                                      copy[i] = { ...copy[i], [c.key]: e.target.value };
                                      setRows(copy);
                                    }}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="px-1 py-1 text-center">
                                <Button variant="bare"
                                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {rows.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={cols.length + 1} className="px-2 py-3 text-center text-slate-400">
                                No rows yet.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {cols.length > 0 && (
                    <Button variant="bare"
                      onClick={() => setRows([...rows, {}])}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      <Plus size={12} /> Add row
                    </Button>
                  )}
                </Field>
              )}
            </>
          )}

          {needsOverrideReason && (
            <Field label={`Why are you overriding the platform's figure? (min ${MIN_OVERRIDE_CHARS} characters)`}>
              <Textarea
                className="min-h-0 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: overrideTooShort ? "#fca5a5" : "#e2e8f0" }}
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. The register excludes the Surat unit, which was divested in Q3."
              />
            </Field>
          )}

          <Field label="Evidence note (optional)">
            <Input
              className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              placeholder="Where the supporting document lives"
            />
          </Field>

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="bare" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            Cancel
          </Button>
          <Button variant="bare"
            onClick={save}
            disabled={busy || overrideTooShort || naMissingReason}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: MX.navy }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
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
