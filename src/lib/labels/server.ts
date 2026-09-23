// Server-component access to display-label overrides.
//
//   const L = await getServerLabels();
//   <PageHeader title={L("nav./ptw", "Permit to Work")} />
//
// Resolves the same active plant as the client (the `safeops_active_plant`
// cookie the plant switcher writes, else the backend falls back to the user's
// home plant). Fails SAFE: any error yields the identity resolver, so a server
// page renders its hardcoded defaults rather than erroring.

import { cache } from "react";
import { cookies } from "next/headers";
import { backendFetch } from "@/lib/backend/fetch";
import { DEFAULT_LABELS, makeLabelFn, type LabelFn, type LabelMap } from "@/lib/labels/core";

export const getServerLabelMap = cache(async (plantId?: string | null): Promise<LabelMap> => {
  try {
    const active = plantId ?? (await cookies()).get("safeops_active_plant")?.value ?? null;
    const res = await backendFetch<{ labels?: LabelMap }>("/api/display-labels", {
      query: { plantId: active ?? undefined },
    });
    return res?.labels ?? {};
  } catch {
    return {};
  }
});

export async function getServerLabels(plantId?: string | null): Promise<LabelFn> {
  const map = await getServerLabelMap(plantId);
  return Object.keys(map).length ? makeLabelFn(map) : DEFAULT_LABELS;
}
