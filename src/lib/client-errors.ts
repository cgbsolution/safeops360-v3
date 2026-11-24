// Client-side helpers to extract a meaningful error message from a fetch
// Response (or its already-parsed JSON body). Node/proxy errors use {error};
// FastAPI uses {detail} (string, 422 array, or object). Both must reach the
// user — a toast that reads only `j.error` shows nothing for every backend
// validation message ("Training is required before go-live…", "Not your task").

/** Message from an already-parsed error body, or null when it carries none. */
export function messageFromBody(j: unknown): string | null {
  if (!j || typeof j !== "object") return typeof j === "string" && j.trim() ? j : null;
  const b = j as Record<string, any>;
  if (typeof b.error === "string" && b.error.trim()) return b.error;
  if (typeof b.detail === "string" && b.detail.trim()) return b.detail;
  if (Array.isArray(b.detail)) {
    // FastAPI 422 — array of {loc, msg, type}. Join the human messages,
    // naming the offending field so "field required" is actionable.
    const msgs = b.detail
      .map((d: any) => {
        if (typeof d === "string") return d;
        if (!d?.msg) return null;
        const field = Array.isArray(d.loc) ? d.loc.filter((x: any) => x !== "body").join(".") : "";
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  // Some handlers pass a dict as `detail` / `error`. String(obj) would render
  // "[object Object]" in a toast — dig out a message field, else compact JSON.
  const nested = b.detail && typeof b.detail === "object" ? b.detail : b.error && typeof b.error === "object" ? b.error : null;
  if (nested) {
    for (const k of ["message", "msg", "detail", "reason", "error"]) {
      if (typeof nested[k] === "string" && nested[k].trim()) return nested[k];
    }
    try {
      return JSON.stringify(nested).slice(0, 200);
    } catch {
      /* fall through */
    }
  }
  if (typeof b.reason === "string" && b.reason.trim()) return b.reason;
  return null;
}

/** Message from a parsed error body, or `fallback` when it carries none. */
export function errorText(j: unknown, fallback = "Request failed"): string {
  return messageFromBody(j) ?? fallback;
}

export async function readApiError(res: Response, fallback = "Request failed"): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${fallback} (HTTP ${res.status})`;
    try {
      return messageFromBody(JSON.parse(text)) ?? `${fallback} (HTTP ${res.status})`;
    } catch {
      // Non-JSON body. Truncate so we don't dump an HTML error page in the UI.
      const trimmed = text.replace(/<[^>]*>/g, "").trim().slice(0, 200);
      return trimmed || `${fallback} (HTTP ${res.status})`;
    }
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}
