"use client";

// Quick look at a permit from the map / timeline / exceptions without leaving
// the board. Reads GET /api/ptw/{id}; "Open permit" goes to the full detail page.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/client-errors";
import { humanize } from "@/lib/utils";
import { typeInfo } from "@/lib/ptw/ops";

type PermitLite = {
  id: string;
  number: string;
  type: string;
  status: string;
  scopeOfWork: string;
  location?: string | null;
  specificLocation?: string | null;
  validFrom: string;
  validTo: string;
  contractorName?: string | null;
  suspendedReason?: string | null;
};

const fmt = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function PermitDrawer({ permitId, onClose, readOnly }: { permitId: string | null; onClose: () => void; readOnly?: boolean }) {
  const [p, setP] = useState<PermitLite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!permitId || readOnly) return;
    let live = true;
    setP(null);
    setError(null);
    fetch(`/api/ptw/${permitId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Could not load the permit"));
        return r.json();
      })
      .then((x) => live && setP(x))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [permitId, readOnly]);

  return (
    <Sheet open={!!permitId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{p?.number ?? "Permit"}</SheetTitle>
          <SheetDescription>{p ? `${typeInfo(p.type).label} · ${humanize(p.status)}` : readOnly ? "Wall display — open the permit on a signed-in device." : "Loading…"}</SheetDescription>
        </SheetHeader>
        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        {p && (
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Scope of work</dt><dd>{p.scopeOfWork}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Location</dt><dd>{p.specificLocation || p.location || "—"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Valid</dt><dd>{fmt(p.validFrom)} → {fmt(p.validTo)}</dd></div>
            {p.contractorName && <div><dt className="text-xs uppercase tracking-wide text-slate-500">Contractor</dt><dd>{p.contractorName}</dd></div>}
            {p.suspendedReason && <div><dt className="text-xs uppercase tracking-wide text-slate-500">Suspended</dt><dd>{p.suspendedReason}</dd></div>}
          </dl>
        )}
        {permitId && !readOnly && (
          <div className="mt-6">
            <Button asChild><Link href={`/ptw/${permitId}`}>Open permit</Link></Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
