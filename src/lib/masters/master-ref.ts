// Presentational half of the MasterItem-ref helpers — pure, no Prisma import,
// so client components can use it safely.
//
// Split out of `resolve-labels.ts` for the same reason `user-ref.tsx` is split
// from `user-ref-server.ts`: importing the resolver drags Prisma (and node:*)
// into any client bundle that touches it, which `tsc` happily accepts and
// `next build` then rejects. Import the resolver in server components only;
// import these helpers anywhere.

import { humanize } from "@/lib/utils";

export type MasterLabelMap = Record<string, string>;

/**
 * Look up a resolved MasterItem label. Returns the label, or a humanised form
 * of the raw value — never a bare cuid, which is meaningless to the reader.
 */
export function masterLabel(
  map: MasterLabelMap,
  ref: string | null | undefined,
  fallback = "—"
): string {
  if (!ref) return fallback;
  const hit = map[ref];
  if (hit) return hit;
  return isOpaqueId(ref) ? fallback : humanize(ref);
}

/** cuid / cuid2 / uuid shaped values — anything we must never render as-is. */
export function isOpaqueId(value: string): boolean {
  return (
    /^c[a-z0-9]{20,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
