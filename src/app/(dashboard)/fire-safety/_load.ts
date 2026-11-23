// Server-side loader shared by the fire safety pages: the plants the user can
// pick and the API vocabularies (GET /api/fire/meta), so every dropdown offers
// exactly the values the backend validates against.

import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import type { FireMeta, PlantOption } from "@/lib/fire/api";

export async function loadFireContext(): Promise<{ plants: PlantOption[]; meta: FireMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<FireMeta>("/api/fire/meta").catch(() => null),
  ]);
  return { plants, meta };
}
