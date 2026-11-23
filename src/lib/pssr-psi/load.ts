// Server-side loaders for the PSSR and PSI pages: the plants the user can pick
// and the API vocabularies, so every dropdown offers exactly the values the
// backend validates against.

import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import type { PlantOption, PsiMeta, PssrMeta } from "@/lib/pssr-psi/api";

export async function loadPssrContext(): Promise<{ plants: PlantOption[]; meta: PssrMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<PssrMeta>("/api/pssr/meta").catch(() => null),
  ]);
  return { plants, meta };
}

export async function loadPsiContext(): Promise<{ plants: PlantOption[]; meta: PsiMeta | null }> {
  const [{ plants }, meta] = await Promise.all([
    resolvePlantContext(null),
    backendFetch<PsiMeta>("/api/psi/meta").catch(() => null),
  ]);
  return { plants, meta };
}

/** Whether the signed-in user holds `code` at all (UI affordance only; every
 *  write is still checked per plant by the backend). */
export async function userHolds(code: string): Promise<boolean> {
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const { can } = await import("@/lib/auth/permissions");
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return false;
    return (await can(userId, code, {})).allowed;
  } catch {
    return false;
  }
}
