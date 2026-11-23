// Server-side loader shared by the CSM pages: the plants the user can pick and
// the API vocabularies (GET /api/csm/meta), so every dropdown offers exactly
// the values the backend validates against.

import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import type { CsmMeta, PlantOption } from "@/lib/csm/api";

export async function loadCsmContext(): Promise<{ plants: PlantOption[]; meta: CsmMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<CsmMeta>("/api/csm/meta").catch(() => null),
  ]);
  return { plants, meta };
}
