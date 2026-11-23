"use client";

// The contractor link is shown exactly once, when it is minted (only its hash
// is stored), so this box makes copying it the obvious next step.

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/csm/api";

export function InviteLinkBox({ portalPath, expiresAt, contactEmail }: { portalPath: string; expiresAt: string | null; contactEmail?: string | null }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}${portalPath}` : portalPath;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900"><Link2 size={14} /> Contractor link</div>
      <div className="flex gap-2">
        <Input readOnly value={url} className="h-9 bg-white text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</Button>
      </div>
      <p className="text-[11px] text-emerald-900">
        Send it to {contactEmail || "the contractor"}. It works until {fmtDate(expiresAt)} and is shown only now; issuing a new
        one cancels this one.
      </p>
    </div>
  );
}
