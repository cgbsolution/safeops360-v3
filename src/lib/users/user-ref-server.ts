// Server-only half of the user-ref helpers.
//
// Split out of `user-ref.tsx` because that module is imported by client
// components for <UserRefLabel> / formatUserRefText. Keeping the backend call
// in the same file dragged @/lib/backend/fetch → auth → undici → node:crypto
// into the browser bundle, and every client component that touched it failed
// `next build` with UnhandledSchemeError. `tsc` passes either way — only a real
// build surfaces it — so the boundary is enforced by this file existing.
//
// Import from here in server components; import the presentational helpers from
// `./user-ref`.

import { backendFetch } from "@/lib/backend/fetch";
import type { UserDirectory } from "./user-ref";

/**
 * Server-side batch resolver for pages whose payload does NOT already embed a
 * user directory. Dedupes ids, no-ops on an empty set, and never throws —
 * resolution is best-effort decoration, so a backend hiccup degrades to the
 * id-fallback rather than blowing up the page.
 */
export async function resolveUsers(
  ids: (string | null | undefined)[]
): Promise<UserDirectory> {
  const unique = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  if (unique.length === 0) return {};
  try {
    return await backendFetch<UserDirectory>("/api/users/by-ids", {
      query: { ids: unique.join(",") },
    });
  } catch {
    return {};
  }
}
