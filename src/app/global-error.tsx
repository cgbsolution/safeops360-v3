"use client";

// Last-resort error boundary at the app root. Most errors should be caught
// by the per-segment error.tsx (e.g. (dashboard)/error.tsx) — this only
// fires when something blows up so early in the render that the segment
// boundary can't catch it (e.g. a layout-level chunk failure).
//
// ── AUTO-RELOAD REMOVED (2026-08-13) ──────────────────────────────────────
// This boundary used to reload the page automatically, capped at 2 retries
// per URL in sessionStorage. In production it produced an endless reload
// loop with "Reloading…" frozen on screen. Two independent defects combined:
//
//  1. Its chunk detection matched on the STACK containing
//     `__webpack_require__`, `requireModule`, or `options.factory`. Webpack
//     wraps every module, so those frames appear in essentially ANY
//     client-side error — meaning this treated almost every failure as a
//     recoverable stale chunk. (The sibling (dashboard)/error.tsx had
//     already learned this and deliberately narrowed its own matcher; this
//     copy never got the fix.)
//  2. The retry cap only holds if sessionStorage PERSISTS across the reload.
//     When it doesn't, the counter reads back empty every time, so `count`
//     is always 1, `count <= 2` is always true, and it reloads forever.
//
// Reloading also cannot fix a deterministic failure: it re-runs the exact
// same render that just threw. So a reload loop turns a one-line error into
// an unusable page that also hides the digest needed to diagnose it.
//
// This boundary now shows the error and lets the user decide. Refreshing is
// a deliberate click.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global error]", error);
    // Clear the counter left behind by the old auto-reload build so users
    // coming from it aren't carrying dead state.
    try {
      sessionStorage.removeItem("safeops_chunk_reload_count");
    } catch {
      /* storage unavailable — nothing to clean up */
    }
  }, [error]);

  const btn = {
    marginTop: 16,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "white",
    cursor: "pointer"
  } as const;

  return (
    <html>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "4rem 2rem",
          textAlign: "center",
          color: "#334155"
        }}
      >
        <h2 style={{ fontSize: "1.25rem", margin: 0 }}>This page didn&apos;t load</h2>
        <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: 8 }}>
          Something failed before the page could render. Try again — if it keeps
          happening, send the reference below to support.
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => reset()} style={btn}>
            Try again
          </button>
          <button onClick={() => window.location.reload()} style={btn}>
            Refresh page
          </button>
        </div>

        {error?.digest && (
          <p
            style={{
              fontSize: "11px",
              color: "#94a3b8",
              fontFamily: "ui-monospace, monospace",
              marginTop: 20
            }}
          >
            Reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
