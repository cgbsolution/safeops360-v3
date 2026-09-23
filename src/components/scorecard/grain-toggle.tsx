"use client";

// Monthly / quarterly toggle.
//
// Deliberately NOT folded into SegmentBar. SegmentBar is a Build 1 contract
// component shared by eleven analytics screens, and this build's brief is
// explicit that the contract components are to be consumed, not modified. The
// grain switch is specific to the scorecard — nothing else on the platform has
// a second reporting grain — so it lives here and follows the same conventions:
// the URL is the state, selection re-queries in place, no local state.

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import { INK, NAVY } from "@/lib/design/midnight";
import { Button } from "@/components/ui/button";

export function GrainToggle({ grain }: { grain: "month" | "quarter" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (next: "month" | "quarter") => {
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "month") p.delete("grain");
      else p.set("grain", next);
      const qs = p.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        router.refresh();
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-[12px]"
      style={{ borderColor: NAVY[200] }}
    >
      <CalendarRange size={13} style={{ color: INK.faint }} aria-hidden />
      <span className="font-medium" style={{ color: INK.muted }}>
        Grain
      </span>
      <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: NAVY[200] }}>
        {(["month", "quarter"] as const).map((g) => {
          const active = grain === g;
          return (
            <Button variant="bare"
              key={g}
              type="button"
              disabled={pending}
              onClick={() => set(g)}
              className="px-2.5 py-0.5 text-[11.5px] font-medium transition-colors disabled:cursor-wait"
              style={{
                backgroundColor: active ? NAVY[900] : "transparent",
                color: active ? "#FFFFFF" : INK.muted,
              }}
              aria-pressed={active}
            >
              {g === "month" ? "Monthly" : "Quarterly"}
            </Button>
          );
        })}
      </div>
      {pending && <Loader2 size={12} className="animate-spin" style={{ color: INK.faint }} aria-hidden />}
    </div>
  );
}
