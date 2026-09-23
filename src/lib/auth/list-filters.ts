// Builds Prisma `where` clauses that match the user's READ scope for a given
// module. Used by every list page so users only see records their RBAC scope
// allows. Without this, list queries return everything the DB has — including
// records in other plants / departments / belonging to other users.
//
// The broadest applicable scope wins:  ALL_PLANTS → OWN_PLANT → OWN_DEPARTMENT → OWN_RECORDS.
//
// Per-module helpers exist because the WHERE clause shape differs per table
// (e.g., Observation has `observerId` + `responsiblePersonId`; PTW has
// `originatorId` + `issuerId` + `receiverId`).

import { cache } from "react";
import { backendFetch } from "@/lib/backend";

type Scope = "ALL_PLANTS" | "OWN_PLANT" | "OWN_DEPARTMENT" | "OWN_RECORDS";

// ── Scope now comes from the backend ───────────────────────────────────────
//
// This helper used to derive the user's scope itself: query UserRole → Role →
// RolePermission through Prisma, walk the grants, and pick the broadest scope
// by rank. That was a SECOND implementation of a rule FastAPI already owns —
// two copies of an access-control decision, free to drift apart, with the
// TypeScript copy deciding what the UI shows and the Python copy deciding what
// the API allows.
//
// GET /api/auth/scope?permission=CODE returns the answer from the same `can()`
// the API boundary enforces, so there is exactly one implementation. The
// scope-ranking table and the UserRole/validTo query live in Python now.
//
// Still wrapped in React.cache so two callers in one request (e.g.
// buildObservationListWhere + getReadScope on the observations page) share a
// single round-trip.
type ScopeResponse = {
  allowed: boolean;
  scope: Scope | null;
  /** null = unrestricted. [] = match nothing. Not interchangeable. */
  plantIds: string[] | null;
  plantId: string | null;
  department: string | null;
};

const loadReadScopeAndProfile = cache(async (userId: string, permissionCode: string) => {
  const res = await backendFetch<ScopeResponse>(
    `/api/auth/scope?permission=${encodeURIComponent(permissionCode)}`
  ).catch(() => null);

  // Fail CLOSED. If the scope service is unreachable we must not fall back to
  // "no filter" — that would show every record in the estate to whoever
  // happened to load the page during an outage.
  if (!res || !res.allowed) {
    return { scope: null as Scope | null, profile: null, plantIds: [] as string[] | null };
  }

  return {
    scope: res.scope,
    profile: { plantId: res.plantId, department: res.department },
    plantIds: res.plantIds
  };
});

// "match-nothing" sentinel — used when the user has no scope or their profile
// is missing required fields. Prisma resolves this to an impossible match.
const MATCH_NOTHING = { id: "__no_match__" };

// Build a Prisma plantId filter from accessible plant IDs.
// Single plant → { plantId: id }; multiple → { plantId: { in: [...] } }
function plantFilter(plantIds: string[] | null, fallback: string | null | undefined): Record<string, any> | null {
  if (plantIds && plantIds.length > 0) {
    return plantIds.length === 1 ? { plantId: plantIds[0] } : { plantId: { in: plantIds } };
  }
  // An EMPTY list means "this user has no accessible plants" — which must match
  // nothing. Falling through to the user's own plant here would hand them a
  // plant the scope resolver just said they cannot see. `null` (unrestricted)
  // is the only case that may fall back. This matches the backend, which
  // short-circuits to an empty result set on an empty plant list.
  if (plantIds && plantIds.length === 0) return null;
  if (fallback) return { plantId: fallback };
  return null;
}

// Build a where clause for OBSERVATION list/count queries.
export async function buildObservationListWhere(userId: string): Promise<Record<string, any>> {
  const { scope, profile, plantIds } = await loadReadScopeAndProfile(userId, "OBSERVATION.READ");
  if (!scope) return MATCH_NOTHING;

  if (scope === "ALL_PLANTS") return {};

  if (scope === "OWN_PLANT") {
    const pf = plantFilter(plantIds, profile?.plantId);
    return pf ?? MATCH_NOTHING;
  }

  if (scope === "OWN_DEPARTMENT") {
    if (!profile?.plantId || !profile?.department) return MATCH_NOTHING;
    // Department lives on the observer (departments aren't directly on the
    // record). So filter via the observer relation.
    return {
      plantId: profile.plantId,
      observer: { is: { department: profile.department } }
    };
  }

  // OWN_RECORDS — only observations the user originated or is responsible on
  return {
    OR: [
      { observerId: userId },
      { responsiblePersonId: userId }
    ]
  };
}

// Returns the scope code the helper applied. Useful for showing the user
// which slice of records they're seeing (e.g., a banner: "Showing your
// department's observations only.").
export async function getReadScope(userId: string, permissionCode: string): Promise<Scope | null> {
  const { scope } = await loadReadScopeAndProfile(userId, permissionCode);
  return scope;
}
