// Server-side loader shared by the Knowledge Bank pages: the API vocabularies,
// categories, every plant (the bank is company-wide, so the plant filter lists
// all plants, not just the caller's) and the caller's manage/approve caps.

import { backendFetch } from "@/lib/backend/fetch";
import type { KbMeta } from "@/lib/knowledge-bank/api";

export async function loadKbMeta(): Promise<{ meta: KbMeta | null; error: string | null }> {
  try {
    return { meta: await backendFetch<KbMeta>("/api/kb/meta"), error: null };
  } catch (e: any) {
    return { meta: null, error: e?.message ?? "The knowledge bank is not available right now." };
  }
}
