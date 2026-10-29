"use client";

// Dashboard error boundary. Three failure shapes we handle:
//
// 1. Webpack chunk-load / "module factory undefined" errors — these are
//    Next.js dev-server HMR drift bugs (especially on 14.1.x) where the
//    browser holds a reference to a chunk the server already replaced.
//    These auto-recover on full reload, so we silently reload after a
//    short delay instead of dumping a scary red error to the user. This
//    is the single biggest UX fix — it stops the "I have to hard-refresh
//    every page" pain.
// 2. Transient Supabase pool exhaustion. Showed up because the old
//    connection_limit=1 was strangling parallel queries; now mitigated
//    by the prisma.ts pool fix, but the recovery copy stays for safety.
// 3. Genuine code/data errors — show the digest + manual refresh button.
//
// In production builds Next.js HIDES `error.message` (security — to avoid
// leaking sensitive info). Only `error.digest` is available client-side.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Returns true if the error looks like a transient webpack/HMR chunk-load
// failure — these always recover on a full page reload, so we should
// auto-recover instead of asking the user to click anything.
// Match on the MESSAGE, never on the bare presence of a webpack frame. In
// `next dev` webpack wraps every module, so `__webpack_require__` /
// `requireModule` appear in the stack of essentially any client-side error —
// matching on those made every genuine bug masquerade as HMR drift, which is
// the opposite of useful when you're trying to find out what broke.
function isChunkLoadError(error: Error & { digest?: string }): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const stack = (error?.stack ?? "").toLowerCase();
  const factoryBug =
    msg.includes("cannot read properties of undefined") && msg.includes("'call'");
  return (
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("chunkloaderror") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module") ||
    // The signature of the Next.js HMR-drift bug is the undefined-factory
    // message *together with* the webpack module-factory frame — not either
    // one on its own.
    (factoryBug && stack.includes("options.factory"))
  );
}

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  // A stale-chunk error is still worth DETECTING — it means the user is
  // holding a page from a previous deployment — but it now only changes the
  // copy we show. It never triggers an automatic reload. See the effect below.
  const chunkBug = isChunkLoadError(error);

  useEffect(() => {
    // Always log so engineers can see the real cause in dev.
    console.error("[dashboard error]", error);

    // ── AUTO-RELOAD REMOVED (2026-08-13) ────────────────────────────────
    // This effect used to call window.location.reload() for chunk-load
    // errors, capped at 2 retries tracked in sessionStorage. It trapped
    // users in an endless reload loop in production, and the cap could not
    // stop it, for two compounding reasons:
    //
    //  1. The cap depends on sessionStorage PERSISTING across the reload.
    //     When it doesn't — privacy modes that accept writes then discard
    //     them, blocked storage, a fresh tab per reload — the counter reads
    //     back as empty every time, so `count` is always 1, `count <= 2` is
    //     always true, and the page reloads forever.
    //  2. It reloads on a condition that cannot distinguish "stale chunk,
    //     will fix itself" from "this page throws every time". If the render
    //     fails deterministically (a server error, bad data, a missing DB
    //     column), reloading re-runs the exact same failing render.
    //
    // A reload loop is strictly worse than a visible error: it burns the
    // user's time, hides the digest they need to report, and re-runs the
    // failing server render on every cycle. The page now always renders the
    // diagnostic UI, and refreshing is a deliberate click.
    //
    // Clear any counter left behind by the old build, so returning users
    // aren't carrying dead state.
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("safeops_chunk_reload_count");
      } catch {
        /* storage unavailable — nothing to clean up */
      }
    }
  }, [error]);

  // Best-effort classification. In dev `message` is populated and we
  // recognise the Supabase pool error; in prod we fall back to a
  // generic "temporary problem" copy that's still actionable.
  const msg = (error?.message ?? "").toLowerCase();
  const isPoolExhausted =
    msg.includes("max clients") ||
    msg.includes("emaxconn") ||
    msg.includes("too many connections");
  const isReachable =
    !msg.includes("can't reach database") &&
    !msg.includes("econnrefused");

  const headline = chunkBug
    ? "A new version was deployed"
    : isPoolExhausted
      ? "Server is briefly busy"
      : isReachable
        ? "This page didn't load"
        : "Cannot reach the server";

  const detail = chunkBug
    ? "This tab is running an older version of the app. Click Refresh page once to load the current one."
    : isPoolExhausted
      ? "Too many requests hit the database at once. A refresh almost always fixes this — the next attempt gets a fresh connection."
      : isReachable
        ? "A temporary problem stopped this page from rendering. If refreshing doesn't clear it, send the reference below to support — it identifies the exact server error."
        : "We can't connect to the backend right now. Please check your network or try again in a moment.";

  // Force a real navigation refresh — not the React error boundary's
  // soft reset. This is what actually re-runs the SSR fetch (and on
  // Vercel typically lands on a fresh Lambda + fresh DB connection).
  function hardRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 p-8">
      <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
        <AlertTriangle className="text-rose-600" size={28} />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">{headline}</h2>
      <p className="text-slate-500 max-w-sm text-sm">{detail}</p>

      <div className="flex items-center gap-2">
        <Button onClick={hardRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh page"}
        </Button>
        <Button onClick={reset} variant="outline" size="sm" disabled={refreshing}>
          Retry without refresh
        </Button>
      </div>

      {error?.digest && (
        <p className="text-[11px] text-slate-400 font-mono pt-2">
          Reference: {error.digest}
        </p>
      )}

      {/* The real cause. Dev only — production builds deliberately strip
          `error.message` for server errors, and we must not start leaking
          stack traces to end users. Without this the boundary was a dead
          end: no digest on client-side errors, no message, nothing to act
          on. */}
      {process.env.NODE_ENV !== "production" && error?.message && (
        <Collapsible className="w-full max-w-3xl text-left pt-2" open>
          <CollapsibleTrigger className="cursor-pointer text-[11px] uppercase tracking-wide text-slate-400 w-full text-left">
            Error detail (dev only)
          </CollapsibleTrigger>
          <CollapsibleContent>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-rose-200 whitespace-pre-wrap break-words">
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
