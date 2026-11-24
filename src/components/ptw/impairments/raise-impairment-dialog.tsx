"use client";

// Raise a safety-system impairment (POST /api/ptw/impairments). The new
// impairment starts as "requested"; it takes effect on permits only once a
// different person approves it (backend enforces both).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/client-errors";

export const SYSTEM_TYPES = [
  { key: "sprinkler", label: "Sprinkler" },
  { key: "fire_detection", label: "Fire detection" },
  { key: "fire_alarm", label: "Fire alarm" },
  { key: "gas_detection", label: "Gas detection" },
  { key: "interlock", label: "Interlock" },
  { key: "emergency_lighting", label: "Emergency lighting" },
  { key: "other", label: "Other" },
];

function localInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function RaiseImpairmentDialog({
  open,
  onOpenChange,
  plantId,
  areas,
  defaultAreaId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  areas: { id: string; name: string }[];
  defaultAreaId?: string | null;
  onCreated?: () => void;
}) {
  const [areaId, setAreaId] = useState("");
  const [systemType, setSystemType] = useState("sprinkler");
  const [systemName, setSystemName] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [restoreAt, setRestoreAt] = useState("");
  const [precautions, setPrecautions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setAreaId(defaultAreaId ?? areas[0]?.id ?? "");
    setStartedAt(localInput(now));
    setRestoreAt(localInput(new Date(now.getTime() + 4 * 3600_000)));
    setError(null);
  }, [open, defaultAreaId, areas]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ptw/impairments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantId,
          areaId,
          systemType,
          systemName: systemName.trim(),
          code: code.trim() || null,
          reason: reason.trim(),
          startedAt: new Date(startedAt).toISOString(),
          plannedRestoreAt: new Date(restoreAt).toISOString(),
          precautions: precautions.split("\n").map((x) => x.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not raise the impairment"));
      setSystemName("");
      setCode("");
      setReason("");
      setPrecautions("");
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      setError(err?.message ?? "Could not raise the impairment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Raise impairment</DialogTitle>
            <DialogDescription>
              A safety system taken out of service. It restricts permits in the zone once approved by someone else.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="imp-zone">Zone</Label>
              <Select id="imp-zone" value={areaId} onValueChange={setAreaId} required>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="imp-type">System type</Label>
              <Select id="imp-type" value={systemType} onValueChange={setSystemType}>
                {SYSTEM_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="imp-name">System name</Label>
              <Input id="imp-name" required minLength={2} value={systemName} onChange={(e) => setSystemName(e.target.value)} placeholder="Sprinkler zone SZ-03" />
            </div>
            <div>
              <Label htmlFor="imp-code">Code (optional)</Label>
              <Input id="imp-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto: IMP-0001" />
            </div>
            <div>
              <Label htmlFor="imp-start">Out of service from</Label>
              <Input id="imp-start" type="datetime-local" required value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="imp-restore">Restore by</Label>
              <Input id="imp-restore" type="datetime-local" required value={restoreAt} onChange={(e) => setRestoreAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="imp-reason">Reason</Label>
            <Textarea id="imp-reason" required minLength={3} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="imp-prec">Precautions in place (one per line)</Label>
            <Textarea id="imp-prec" rows={3} value={precautions} onChange={(e) => setPrecautions(e.target.value)} placeholder={"Fire watch on every hot work job\nHourly patrol by the fire team"} />
          </div>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !areaId}>{busy ? "Raising…" : "Raise impairment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
