// Server-only MasterItem reference resolver.
//
// MasterItem-backed fields (shiftId, hazardCategory, energySource,
// activityBeingPerformed, …) are persisted as MasterItem *ids* — bare cuids.
// Rendering the stored value directly leaks that id onto the screen, which is
// the same defect class the user-ref / site-ref conventions already fix
// elsewhere: never show a raw id, always resolve to the human label.
//
// Some older rows (and a few forms) store the MasterItem `code` instead of the
// id, so the resolver indexes both and the presentational helper falls back to
// a humanised form of the raw value when nothing matches — a stale reference
// degrades to readable text rather than a cuid.
//
//   const masters = await resolveMasterLabels([n.hazardCategory, n.energySource]);
//   <span>{masterLabel(masters, n.hazardCategory)}</span>
//
// Import the render-side helpers from `./master-ref` (client-safe).

import { prisma } from "@/lib/prisma";
import type { MasterLabelMap } from "./master-ref";

export type { MasterLabelMap };
export { masterLabel, isOpaqueId } from "./master-ref";

/**
 * Batch-resolve MasterItem ids (or codes) to their labels. Dedupes, no-ops on
 * an empty set, and never throws — resolution is best-effort decoration, so a
 * DB hiccup degrades to the humanised fallback rather than blowing up a page.
 */
export async function resolveMasterLabels(
  refs: (string | null | undefined)[]
): Promise<MasterLabelMap> {
  const unique = Array.from(
    new Set(refs.filter((x): x is string => typeof x === "string" && x.trim() !== ""))
  );
  if (unique.length === 0) return {};
  try {
    const rows = await prisma.masterItem.findMany({
      where: { OR: [{ id: { in: unique } }, { code: { in: unique } }] },
      select: { id: true, code: true, label: true }
    });
    const map: MasterLabelMap = {};
    for (const r of rows) map[r.id] = r.label;
    // Only let a code claim a slot no id already owns, so an id that happens to
    // collide with someone else's code cannot be shadowed.
    for (const r of rows) if (!(r.code in map)) map[r.code] = r.label;
    return map;
  } catch {
    return {};
  }
}
