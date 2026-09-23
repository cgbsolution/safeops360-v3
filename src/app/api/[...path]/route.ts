// Catch-all proxy. Every /api/* call from the browser is forwarded to the
// Python backend with the caller's session token.
//
// Why a proxy instead of pointing the browser directly at Python:
//   - Avoids exposing BACKEND_URL to the client (no NEXT_PUBLIC_ leak)
//   - Keeps cookie / CORS handling simple — same-origin from the browser
//   - Lets the Next.js layer add headers, log, or short-circuit if needed
//
// Routes that DON'T go through here:
//   - /api/auth/[...nextauth] — NextAuth's own handler (unchanged)
//   - /api/auth/permissions   — small per-route proxy (more specific path
//                               wins over this catch-all in Next.js)
//   - /api/anomalies/*        — still owned by the Node side until we port
//                               the AnomalyDetectionAgent to Python
//   - /api/observations/[id]/attachments/* — Python observations module
//                               doesn't yet have attachment endpoints

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mintBackendToken } from "@/lib/backend-token";
import { backendFetch } from "@/lib/backend-fetch";
import { backendCandidates, errorCode, isReplayable } from "@/lib/backend-hosts";

const BACKEND_URL = process.env.BACKEND_URL ?? "";

// Total time this function may spend talking to the backend, across ALL
// failover attempts. The old code used a single 30s attempt, which is the
// function's ENTIRE budget (vercel.json maxDuration) — so when the backend
// hung, Vercel killed the function before this code could return anything,
// and the logs showed "Vercel Runtime Timeout Error: Task timed out after 30
// seconds" instead of the clean 504 below. That error appears 5 times in the
// production logs for this route.
//
// A single DEADLINE (rather than a fixed per-host timeout) is what keeps this
// correct as the candidate list grows: backend-hosts.ts supplies the
// canonical host plus every spare, so a hard-coded 12s per host would blow
// the budget again the moment a third router is added. 26s leaves ~4s for
// session lookup, token minting, and serialising the response.
const BACKEND_DEADLINE_MS = 26_000;
/** Never start an attempt with less than this left — it cannot succeed. */
const MIN_ATTEMPT_MS = 2_000;

// Node 18+'s built-in fetch already pools connections to the same host via
// undici under the hood, so explicit keep-alive is unnecessary for the
// localhost dev case. In production add an explicit Agent if latency
// measurements show TCP setup is the bottleneck.

// Paths the proxy must NOT swallow — they have their own dedicated handlers
// in this app and must keep working for the Node-only features.
const PASSTHROUGH_PREFIXES = ["auth/", "anomalies", "diagnostics"];

async function forward(req: NextRequest, params: { path: string[] }): Promise<NextResponse> {
  if (!BACKEND_URL) {
    return NextResponse.json(
      {
        error: "BACKEND_URL is not configured",
        reason: "The Next.js deployment has no BACKEND_URL environment variable set.",
        hint: "Visit /api/diagnostics for a full configuration check, then add BACKEND_URL on Vercel → Settings → Environment Variables and redeploy.",
      },
      { status: 503 }
    );
  }

  const path = params.path.join("/");
  if (PASSTHROUGH_PREFIXES.some((p) => path.startsWith(p))) {
    // Belt-and-suspenders — Next.js routing already prefers the more specific
    // handlers, but if anyone hits the catch-all for these paths we 404 so
    // the dedicated handler shows up in tooling.
    return NextResponse.json(
      { error: `Path '${path}' is not proxied; it has a dedicated handler.` },
      { status: 404 }
    );
  }

  const session = await getServerSession(authOptions);
  // Mint a FRESH bearer on every request. The session may also carry a
  // `backendAccessToken` from sign-in time, but that token has the TTL
  // Python configured at login — typically 60 minutes — so reusing it
  // makes every API call fail with 401 once the user has been logged in
  // longer than the TTL. Minting per-request (a single HMAC sign over
  // ~50 bytes) is cheap and gives a new 12-hour window every time.
  // The session bearer remains the fallback only when no userId is
  // available — that path is for service-to-service edge cases.
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  let token: string | undefined;
  if (userId) {
    token = (await mintBackendToken(userId, role ?? "WORKER")) ?? undefined;
  }
  if (!token) {
    token = (session?.user as any)?.backendAccessToken as string | undefined;
  }

  // Resolved from BACKEND_URL — see lib/backend-hosts.ts for why there is no
  // longer a cross-server failover list.
  const bases = backendCandidates();
  if (!bases.length) {
    // Without this the proxy would request "undefined/api/…" and surface a
    // confusing parse error on every call. 503 says "this deployment is
    // misconfigured", which is exactly what an unset BACKEND_URL means.
    console.error("[proxy] BACKEND_URL is unset — refusing to proxy.");
    return NextResponse.json(
      { detail: "BACKEND_URL is not configured for this deployment." },
      { status: 503 }
    );
  }
  const suffix = `/api/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (token) headers["authorization"] = `Bearer ${token}`;
  // Forward client IP for audit logging on the Python side
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  // Forward the active factory/plant so per-factory module entitlement is
  // enforced server-side (cookie set by the licence provider — see
  // licence-provider.tsx). Absent → ceiling-only enforcement.
  const activePlant = req.cookies.get("safeops_active_plant")?.value;
  if (activePlant) headers["x-active-plant"] = activePlant;

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  // Server-Timing exposes per-hop latency in browser DevTools so we can see
  // whether the proxy or Python is the bottleneck for any given request.
  // Look for a "Timing" entry on the proxied response in the Network tab.
  //
  // Hard deadline so a cold/hung Python container can't hang the browser
  // indefinitely. Without this, the user saw a stuck loading skeleton and
  // thought the page was broken; with it, they get a clean 504 + retry button.
  const t0 = Date.now();
  let res: Response | null = null;
  let lastErr: any = null;
  let url = `${bases[0]}${suffix}`;

  // Try each router in turn. A host whose packets are being silently dropped
  // costs one attempt's slice of the budget before we move on, so the user
  // gets a served page instead of a dead one.
  const remaining = () => BACKEND_DEADLINE_MS - (Date.now() - t0);

  for (let b = 0; b < bases.length; b++) {
    url = `${bases[b]}${suffix}`;
    // Split whatever budget is left evenly across the hosts still untried, so
    // the total can never exceed BACKEND_DEADLINE_MS however many there are.
    if (remaining() < MIN_ATTEMPT_MS) break;
    const timeoutMs = Math.max(
      MIN_ATTEMPT_MS,
      Math.floor(remaining() / (bases.length - b))
    );
    try {
      // backendFetch honours INSECURE_BACKEND_TLS=true (env-gated, off by
      // default) so we can keep working when the Python backend is on a
      // self-signed cert during the Let's Encrypt rollout.
      res = await backendFetch(url, {
        method: req.method,
        headers,
        body,
        cache: "no-store",
        timeoutMs
      });
      if (b > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[proxy] ⚠ ${bases[0]} did not respond — served via fallback ${bases[b]}. ` +
            `The primary router is being dropped upstream; fix the host firewall ` +
            `(see docs/ops/BACKEND_DOWNTIME.md). Running on a spare is degraded, not healthy.`
        );
      }
      break;
    } catch (err: any) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.error("[proxy] upstream fetch failed", {
        url,
        code: errorCode(err),
        message: err?.message,
        method: req.method
      });
      // Only move to the next host when replaying is provably safe. A
      // timed-out POST may already have been applied upstream, so it is NOT
      // replayed — that would risk a duplicate write.
      if (!isReplayable(err, req.method) || b === bases.length - 1) break;
    }
  }

  if (res === null) {
    const err = lastErr;
    const code = errorCode(err);
    if (err?.name === "AbortError" || code === "AbortError") {
      return NextResponse.json(
        {
          error: "Backend timed out",
          reason:
            "The Python backend accepted the connection but did not respond in time — " +
            "it may be overloaded (production runs a single uvicorn worker) or blocked on a slow query.",
          code,
          triedHosts: bases,
          hint: "Retry once. If persistent, check Dokploy resource limits and visit /api/diagnostics.",
        },
        { status: 504 }
      );
    }
    // Surface the real failure mode (TLS / DNS / connection refused / etc.)
    // instead of letting it crash the function.
    let reason = "Network error reaching the backend.";
    if (code.includes("CERT") || code.includes("TLS") || code.includes("SSL")) {
      reason = "TLS certificate verification failed on the backend.";
    } else if (code === "ENOTFOUND") {
      reason = "DNS lookup failed for BACKEND_URL — verify the hostname.";
    } else if (code === "ECONNREFUSED") {
      reason = "Backend refused the connection — server is down or port closed.";
    } else if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
      // The distinction that matters: refused = process down; timed out on
      // CONNECT = packets silently dropped, i.e. a firewall ban on this
      // caller's IP, not an application fault.
      reason =
        "TCP connect timed out on every host — packets are being silently dropped " +
        "upstream. This is a firewall/IP ban on the Vercel egress IP, not a backend crash.";
    }
    return NextResponse.json(
      {
        error: "Backend unreachable",
        reason,
        code,
        triedHosts: bases,
        hint: "Visit /api/diagnostics for a full configuration check.",
      },
      { status: 502 }
    );
  }
  const upstreamMs = Date.now() - t0;

  // 204 / 205 / 304 are "null body" statuses — passing ANY body to the
  // NextResponse constructor with these statuses throws "Response
  // constructed with null body status cannot have body". That used to
  // turn every successful DELETE (Python returns 204) into a 500 here,
  // so the browser saw "Delete failed" even though the row was gone.
  const isNullBody = res.status === 204 || res.status === 205 || res.status === 304;
  const totalMs = Date.now() - t0;
  const responseHeaders: Record<string, string> = {
    "Server-Timing": `python;dur=${upstreamMs};desc="upstream", proxy;dur=${totalMs - upstreamMs};desc="proxy"`
  };

  if (isNullBody) {
    return new NextResponse(null, { status: res.status, headers: responseHeaders });
  }

  const upstreamCt = res.headers.get("content-type") ?? "application/json";
  responseHeaders["content-type"] = upstreamCt;
  // Forward the download filename so file exports keep their name.
  const cd = res.headers.get("content-disposition");
  if (cd) responseHeaders["content-disposition"] = cd;

  // Text-like responses (JSON / CSV / HTML / XML) are safe to round-trip as a
  // string. BINARY responses (xlsx, pdf, images, zip, octet-stream) MUST be
  // passed through as raw bytes — `res.text()` decodes them as UTF-8 and
  // corrupts the file (e.g. an .xlsx zip's central directory), so Excel and
  // other readers reject the download. This is why report Excel exports were
  // "not working" in production while CSV worked.
  //
  // CSV is excluded from the text path even though it IS text. `res.text()`
  // performs a UTF-8 decode, and that decode STRIPS a leading byte-order mark.
  // Excel on Windows reads a BOM-less UTF-8 CSV as the system codepage, so
  // every em-dash in a plant name ("Meridian Apparel — Surat") arrives as
  // mojibake — and this platform's plant names are full of them. Backends that
  // emit utf-8-sig are relying on that BOM surviving the proxy. Round-tripping
  // CSV as bytes preserves it and costs nothing: arrayBuffer is lossless for
  // text too.
  const isText = /^(?:text\/(?!csv\b)|application\/(?:json|xml|javascript|xhtml\+xml|x-www-form-urlencoded)\b)/i.test(upstreamCt);
  if (isText) {
    const responseText = await res.text();
    return new NextResponse(responseText, { status: res.status, headers: responseHeaders });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, { status: res.status, headers: responseHeaders });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params));
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params));
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params));
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params));
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params));
}
