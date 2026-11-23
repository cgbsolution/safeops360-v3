// Server-side loader shared by the process safety / HAZOP pages: the plants the
// user can pick and the API vocabularies + guideword library (GET /api/pha/meta),
// so every dropdown offers exactly the values the backend validates against.

import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import type { PhaMeta, PlantOption } from "@/lib/pha/api";

export async function loadPhaContext(): Promise<{ plants: PlantOption[]; meta: PhaMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<PhaMeta>("/api/pha/meta").catch(() => null),
  ]);
  return { plants, meta };
}
