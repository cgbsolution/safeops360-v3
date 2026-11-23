// Server-side loader shared by the IMS pages: the plants the user can pick and
// the API vocabularies (GET /api/ims/meta), so every dropdown offers exactly
// the values the backend validates against.

import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import type { ImsMeta, PlantOption } from "@/lib/ims/api";

export async function loadImsContext(): Promise<{ plants: PlantOption[]; meta: ImsMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<ImsMeta>("/api/ims/meta").catch(() => null),
  ]);
  return { plants, meta };
}
