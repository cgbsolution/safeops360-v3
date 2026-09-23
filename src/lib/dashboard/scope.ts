// Shared plant-scope resolver for analytics-strip / widget data loaders.
//
// Modules that already expose a list-scope helper (observations, incidents)
// reuse THAT — the strip's numbers then match the list exactly. For modules
// without one, this gives a consistent rule.
//
// ── Now resolved by the backend ────────────────────────────────────────────
//
// This used to query User + UserRole through Prisma and decide "sees every
// plant" from a HARD-CODED role list:
//
//     const GROUP_WIDE_ROLES = new Set(["ADMIN","CORPORATE_HSE","CEO","MD","DIRECTOR"]);
//
// That list was independent of RBAC, which made it wrong in both directions: a
// role granted ALL_PLANTS through the permission model was still filtered here,
// and a role removed from the estate-wide set in RBAC still saw everything in
// the strips. It was also a fourth copy of plant-scope resolution, alongside
// list-filters.ts, auth/permissions.ts and Python's get_accessible_plants().
//
// GET /api/auth/accessible-plants resolves it from the RBAC grants, so the
// strips now scope the same way the API does.
//
// ⚠ BEHAVIOUR CHANGE: a user whose visibility came from the hard-coded list
// but NOT from an RBAC grant will now see their scoped plants rather than the
// whole group (and vice versa). That is the intended correction, but it does
// change what some dashboards show — verify against a CEO/DIRECTOR account.

import { cache } from "react";
import { backendFetch } from "@/lib/backend";

export type PlantIdFilter = string | { in: string[] };
export type PlantWhere = { plantId?: PlantIdFilter };

type AccessiblePlantsResponse = {
  /** null = unrestricted. [] = no accessible plants (match nothing). */
  plantIds: string[] | null;
  plantId: string | null;
};

/**
 * Returns all plant IDs the current user can access FOR `permission`, or null
 * for unrestricted.
 *
 * ⚠ `permission` is required on purpose. Resolving plant scope without naming
 * the permission being read is what made this wrong before: the backend's
 * permission-agnostic helper reports "all plants" for anyone holding a single
 * ALL_PLANTS grant on any module — and every role holds NEAR_MISS.CREATE at
 * ALL_PLANTS — so a WORKER resolved to the entire estate. Measured
 * 2026-08-13: SUPERVISOR and WORKER both came back unrestricted that way;
 * scoped to NEAR_MISS.READ they correctly resolve to 2 and 1 plants.
 *
 * Fails CLOSED: if the backend is unreachable this returns an EMPTY list, not
 * null. Returning null on failure would drop the plant filter entirely and
 * show every plant's records to whoever loaded the page during an outage.
 */
export const getAccessiblePlantIds = cache(
  async (permission?: string): Promise<string[] | null> => {
    // Omit only for a surface with no module restriction of its own (a widget
    // whose catalog entry declares no permission). Anything reading a specific
    // module must name it, or the scope resolves too broadly.
    const qs = permission ? `?permission=${encodeURIComponent(permission)}` : "";
    const res = await backendFetch<AccessiblePlantsResponse>(
      `/api/auth/accessible-plants${qs}`
    ).catch(() => null);
    if (!res) return [];
    return res.plantIds;
  }
);

/**
 * Returns a Prisma `where` fragment scoping a query to the caller's plants,
 * or `{}` for unrestricted roles. Spread into any model query with a `plantId`
 * column: `where: { ...(await stripPlantWhere()), status: "OPEN" }`.
 *
 * An explicit `plantId` override always wins when provided.
 *
 * NOTE: this still returns a Prisma-shaped clause because its callers (the
 * analytics strips and widget loaders) still query Prisma. It loses that shape
 * when those move to the backend — see docs/ops/PRISMA_TO_BACKEND_MIGRATION.md
 * stages 3 and 4.
 */
export const stripPlantWhere = cache(
  async (permission?: string, override?: string): Promise<PlantWhere> => {
    if (override) return { plantId: override };
    const ids = await getAccessiblePlantIds(permission);
    if (!ids) return {}; // unrestricted — no filter
    // Empty means no accessible plants. Match nothing rather than falling
    // through to an unfiltered query.
    if (ids.length === 0) return { plantId: "__no_match__" };
    if (ids.length === 1) return { plantId: ids[0] };
    return { plantId: { in: ids } };
  }
);
