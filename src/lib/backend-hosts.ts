// ════════════════════════════════════════════════════════════════════════
//  Backend host resolution. Shared by NextAuth login and the /api/[...path]
//  catch-all proxy so both agree on where Python lives.
// ════════════════════════════════════════════════════════════════════════
//
//  SINGLE SOURCE OF TRUTH: the `BACKEND_URL` environment variable.
//
//  This module used to hardcode a production hostname and *rewrite* the env
//  var onto it. That was a workaround for a stale value in the Vercel
//  dashboard, and it cost far more than it saved:
//
//   - When the backend moved to a new host, the env var was powerless. The
//     app kept talking to the old server until someone edited SOURCE CODE
//     and redeployed — for what is, by definition, configuration.
//   - Setting BACKEND_URL correctly appeared to do nothing, because the
//     rewrite silently overrode it. Config that lies is worse than no config.
//
//  So: whatever `BACKEND_URL` says is where requests go. If it is wrong, fix
//  it in the deployment's environment variables. Nothing here will paper over
//  it, and that is deliberate — a visible misconfiguration is cheaper to find
//  than an invisible override.
//
//  NO FAILOVER LIST. Retrying against a *different* server is only safe when
//  both share one database; otherwise a replayed write (a CAPA, a permit
//  closure, an approval) lands somewhere it can never be reconciled. The
//  hosts previously listed as "spares" were sibling Traefik routers on one
//  container — that stopped being true when the backend moved to a separate
//  VPS, so the list was removed rather than quietly becoming cross-server.
//
//  ⚠ The spares also masked the per-source-IP bans in
//  docs/ops/BACKEND_DOWNTIME.md. They never cured them (all the routers sat
//  behind one firewall) but they did hide the symptom. That fix is §4.1.

const strip = (u: string) => u.replace(/\/$/, "");

/**
 * The configured backend base URL, trailing slash removed, or "" when unset.
 * `NEXT_PUBLIC_BACKEND_URL` is accepted as a fallback for local development
 * only — production should set the server-side `BACKEND_URL` so the hostname
 * is never shipped to the browser bundle.
 */
export function backendBaseUrl(): string {
  return strip(process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "");
}

/**
 * Bases to try, in order — currently exactly one: whatever BACKEND_URL says.
 *
 * Returns an EMPTY array when unset, so callers fail loudly instead of
 * dialling the string "undefined". Add a second entry here only once it is
 * proven to be the same application on the same database.
 */
export function backendCandidates(): string[] {
  const base = backendBaseUrl();
  return base ? [base] : [];
}

/** Extract a comparable error code from a fetch/undici failure. */
export function errorCode(err: any): string {
  return String(err?.cause?.code ?? err?.code ?? err?.name ?? "unknown");
}

/**
 * True when the failure happened BEFORE the request could be processed —
 * DNS, TCP connect, or a reset mid-handshake. Only these are safe to replay
 * for a mutating method, because the server provably never saw the bytes.
 *
 * Deliberately EXCLUDES AbortError: our own timeout firing means the
 * connection was open and the server may well have applied the write. See
 * `isReplayable` for how that case is handled.
 */
export function isConnectLevelError(err: any): boolean {
  const code = errorCode(err);
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  );
}

/**
 * Whether a failed attempt may be retried.
 *
 * A connect-level failure is always replayable — the request never landed.
 * A timeout (AbortError) is replayable ONLY for idempotent methods: the
 * server may have received and applied a POST/PATCH/DELETE before we gave
 * up on it, and re-sending would duplicate the write. Those surface as a
 * clean 504 instead.
 *
 * With a single candidate this no longer drives cross-host failover, but the
 * proxy still consults it, and login retries the same host on a cold connect.
 */
export function isReplayable(err: any, method: string): boolean {
  if (isConnectLevelError(err)) return true;
  const code = errorCode(err);
  const isTimeout = code === "AbortError" || code === "TimeoutError";
  const idempotent = method === "GET" || method === "HEAD" || method === "OPTIONS";
  return isTimeout && idempotent;
}
