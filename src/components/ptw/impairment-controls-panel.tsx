"use client";

// Impairment controls on a permit (GET/POST/DELETE /api/ptw/{id}/controls).
// When a safety system in the permit's zone is impaired, the matching rule can
// require controls on the permit; the workflow will not approve it past Issuer
// Review until each one is recorded here. Renders nothing when no impairment
// affects this permit.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/client-errors";

type Controls = {
  effect: "allow" | "require_controls" | "block_new";
  blocking: string[];
  impairments: { code: string; systemName: string; effect: string }[];
  controls: { key: string; label: string; satisfied: boolean; satisfiedAt: string | null; satisfiedBy: string | null; note: string | null; needsFireOfficer: boolean }[];
  missing: string[];
  ready: boolean;
};

export function ImpairmentControlsPanel({ permitId }: { permitId: string }) {
  const [d, setD] = useState<Controls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ptw/${permitId}/controls`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [permitId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(key: string, on: boolean) {
    setBusy(key);
    setError(null);
    try {
      const res = on
        ? await fetch(`/api/ptw/${permitId}/controls`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ controlKey: key, note: notes[key] || null }),
          })
        : await fetch(`/api/ptw/${permitId}/controls/${key}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not update the control"));
      setD(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!d || (!d.impairments.length && !d.blocking.length)) return null;

  return (
    <Card className="border-rose-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-rose-800">
          <ShieldAlert size={18} aria-hidden /> Impairment controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-700">
          {d.impairments.map((i) => `${i.systemName} (${i.code})`).join(", ")} {d.impairments.length === 1 ? "is" : "are"} out of service in this zone.
          {d.missing.length > 0 && " The permit cannot be approved until every control below is recorded."}
        </p>
        {d.blocking.map((b) => (
          <p key={b} role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{b}</p>
        ))}
        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <ul className="space-y-2">
          {d.controls.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3">
              {c.satisfied ? <CheckCircle2 size={18} className="text-emerald-600" aria-hidden /> : <CircleDashed size={18} className="text-rose-600" aria-hidden />}
              <div className="min-w-[180px] flex-1">
                <div className="font-medium">{c.label}{c.needsFireOfficer && <span className="ml-1 text-xs text-slate-500">(Fire Officer)</span>}</div>
                <div className="text-xs text-slate-500">
                  {c.satisfied ? `Recorded${c.satisfiedBy ? ` by ${c.satisfiedBy}` : ""}${c.satisfiedAt ? ` · ${new Date(c.satisfiedAt).toLocaleString("en-GB")}` : ""}${c.note ? ` · ${c.note}` : ""}` : "Not recorded"}
                </div>
              </div>
              {!c.satisfied && (
                <Input aria-label={`Note for ${c.label}`} className="h-9 w-56" placeholder="Note (who / where)" value={notes[c.key] ?? ""}
                       onChange={(e) => setNotes((n) => ({ ...n, [c.key]: e.target.value }))} />
              )}
              {c.satisfied ? (
                c.satisfiedAt && <Button size="sm" variant="ghost" disabled={busy === c.key || !d.ready} onClick={() => toggle(c.key, false)}>Undo</Button>
              ) : (
                <Button size="sm" disabled={busy === c.key || !d.ready} onClick={() => toggle(c.key, true)}>Record</Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
