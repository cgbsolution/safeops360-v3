"use client";

// Wall-display (kiosk) tokens. A token is shown ONCE, as a ready-to-open URL;
// only its hash is stored. It can read one plant's Control Center and nothing else.

import { useCallback, useEffect, useState } from "react";
import { Copy, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readApiError } from "@/lib/client-errors";

type Tok = { id: string; label: string; createdAt: string; revokedAt: string | null; lastSeenAt: string | null };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

export function KioskTokens({ plantId }: { plantId: string | null }) {
  const [rows, setRows] = useState<Tok[] | null>(null);
  const [label, setLabel] = useState("Control room TV");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!plantId) return;
    const res = await fetch(`/api/ptw/kiosk-tokens?plant=${plantId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readApiError(res, "Could not load wall displays"));
      setRows([]);
      return;
    }
    setError(null);
    setRows(await res.json());
  }, [plantId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setError(null);
    const res = await fetch("/api/ptw/kiosk-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plantId, label }),
    });
    if (!res.ok) return setError(await readApiError(res, "Could not create the token"));
    const t = await res.json();
    setFresh(`${window.location.origin}/ptw/control-center?mode=wall&token=${encodeURIComponent(t.token)}`);
    load();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/ptw/kiosk-tokens/${id}`, { method: "DELETE" });
    if (!res.ok) return setError(await readApiError(res, "Could not revoke"));
    load();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Monitor size={18} aria-hidden /> Wall displays</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          A wall display opens the Control Center for one plant without a login. Its link is read-only: it cannot raise, approve or edit anything, and you can revoke it here at any time.
        </p>
        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Label htmlFor="kiosk-label">Display name</Label>
            <Input id="kiosk-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </div>
          <Button onClick={create} disabled={!label.trim() || !plantId}>Create wall display link</Button>
        </div>
        {fresh && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="mb-1 font-medium text-amber-900">Copy this link now — it is shown only once.</div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">{fresh}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(fresh)}><Copy size={14} /> Copy</Button>
            </div>
          </div>
        )}
        {rows && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Display</TableHead><TableHead>Created</TableHead><TableHead>Last seen</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell>{fmt(r.createdAt)}</TableCell>
                  <TableCell>{fmt(r.lastSeenAt)}</TableCell>
                  <TableCell>{r.revokedAt ? <span className="text-slate-500">revoked</span> : <span className="text-emerald-700">active</span>}</TableCell>
                  <TableCell className="text-right">
                    {!r.revokedAt && <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>Revoke</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
