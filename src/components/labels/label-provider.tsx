"use client";

// Client-side display-label overrides for the ACTIVE plant (the same plant the
// licence layer resolves: ?plantId= → home plant). Fetches the override rows
// once per plant; until they arrive — and on any error — L() returns the
// hardcoded default, so nothing ever renders blank.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLicence } from "@/components/licensing/licence-provider";
import { DEFAULT_LABELS, makeLabelFn, type LabelFn, type LabelMap } from "@/lib/labels/core";

type LabelContextValue = { L: LabelFn; profile: string | null };

const LabelContext = createContext<LabelContextValue>({ L: DEFAULT_LABELS, profile: null });

export function LabelProvider({ children }: { children: React.ReactNode }) {
  const { activePlantId } = useLicence();
  const [state, setState] = useState<{ labels: LabelMap; profile: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = activePlantId ? `?plantId=${encodeURIComponent(activePlantId)}` : "";
    fetch(`/api/display-labels${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setState(j ? { labels: j.labels ?? {}, profile: j.profile ?? null } : null);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activePlantId]);

  const value = useMemo<LabelContextValue>(
    () => ({ L: state ? makeLabelFn(state.labels) : DEFAULT_LABELS, profile: state?.profile ?? null }),
    [state],
  );
  return <LabelContext.Provider value={value}>{children}</LabelContext.Provider>;
}

/** `const L = useLabels(); L("term.plant", "Plant")` */
export function useLabels(): LabelFn {
  return useContext(LabelContext).L;
}

export function useLabelProfile(): string | null {
  return useContext(LabelContext).profile;
}
