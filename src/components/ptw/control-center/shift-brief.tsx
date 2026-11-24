"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { briefParts, fmtClock, type ControlCenterPayload } from "@/lib/ptw/ops";

/** Hidden when there is no brief. The risk phrase (wrapped in [[…]] by the
 *  generator) is highlighted rose when the board has a critical exception,
 *  amber otherwise. */
export function ShiftBrief({ data, onViewActions }: { data: ControlCenterPayload | null; onViewActions: () => void }) {
  const brief = data?.brief;
  if (!data || !brief?.text) return null;
  const critical = data.exceptions.some((e) => e.severity === "critical");
  return (
    <Card aria-label="Shift brief" className="border-amber-200 bg-amber-50/40">
      <CardContent className="flex flex-wrap items-start gap-4 p-4">
        <div className="flex items-center gap-2 pt-0.5">
          <Sparkles size={16} aria-hidden className="text-amber-600" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Shift brief</span>
        </div>
        <p className="min-w-[240px] flex-1 text-sm leading-relaxed text-slate-700">
          {briefParts(brief.text).map((part, i) =>
            part.risk ? (
              <span
                key={i}
                className={cn(
                  "rounded px-1 font-semibold",
                  critical ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"
                )}
              >
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
          <span className="ml-2 text-[11px] text-slate-400">· {fmtClock(brief.generatedAt)}</span>
        </p>
        <Button variant="outline" size="sm" onClick={onViewActions}>View actions →</Button>
      </CardContent>
    </Card>
  );
}
