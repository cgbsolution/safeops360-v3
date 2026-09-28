// Client mirror of Safeops360-backend/app/services/tenant_roles.py.
//
// Meridian Retail users hold own-plant-only clones of the stock roles
// (RETAIL_STORE_MANAGER stands in for PLANT_HEAD, …). UI gates that name stock
// roles must count the clone, or the button the API would accept never shows
// (e.g. a Store Manager saw no "Start Handback Inspection"). Keep in step with
// the backend table; the API remains the authority.

const STANDS_IN_FOR: Record<string, readonly string[]> = {
  RETAIL_OPS_ADMIN: ["HSE_MANAGER", "SAFETY_OFFICER", "PLANT_HSE_HEAD", "EMERGENCY_RESPONSE_COORDINATOR"],
  RETAIL_STORE_MANAGER: ["PLANT_HEAD", "DEPARTMENT_HEAD", "SUPERVISOR", "FACTORY_MANAGER"],
  RETAIL_DC_MAINTENANCE: ["PERMIT_ISSUER", "MAINTENANCE_HEAD"],
  RETAIL_FIRE_TECHNICIAN: ["FIELD_TECHNICIAN"],
  RETAIL_FLOOR_STAFF: ["WORKER"],
  RETAIL_FIRE_AUDITOR: ["LEAD_AUDITOR", "AUDITOR"],
  RETAIL_PROJECTS: ["CONTRACTOR_COORDINATOR"],
};

/** The role plus every stock role it stands in for. Only for per-record action
 *  gates on a record the user can already open — never to widen a list. */
export function withStockEquivalents(role: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!role) return out;
  out.add(role);
  for (const r of STANDS_IN_FOR[role] ?? []) out.add(r);
  return out;
}
