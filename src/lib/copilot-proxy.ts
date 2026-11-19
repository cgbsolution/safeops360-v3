// Streaming proxy shared by the copilot routes:
//   POST /api/copilot/chat                   start a turn (or join it on a retry)
//   GET  /api/copilot/chat/{turnId}/events   resume a turn's event stream
//
// The catch-all proxy (app/api/[...path]) buffers responses and gives up
// after 26 s, so these need their own handler: same session → minted bearer →
// backend, but the upstream body is piped straight through as Server-Sent
// Events.
//
// No stream here has to last the whole answer. The backend ends each one
// after ~3 minutes (under Vercel's 300 s function cap) and the browser
// reconnects; a cut connection resumes the same way. Closing a stream never
// stops the turn on the backend; only the Stop button does.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mintBackendToken } from "@/lib/backend-token";
import { backendFetch } from "@/lib/backend-fetch";
import { backendCandidates } from "@/lib/backend-hosts";

export const TURN_ID_RE = /^[0-9a-f]{32}$/;

export async function proxyCopilotStream(
  req: NextRequest,
  path: string,
  init: { method: "GET" | "POST"; body?: string }
): Promise<Response> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }
  const base = backendCandidates()[0];
  if (!base) {
    return NextResponse.json({ detail: "BACKEND_URL is not configured for this deployment." }, { status: 503 });
  }
  const token = await mintBackendToken(userId, ((session?.user as any)?.role as string) ?? "WORKER");

  const headers: Record<string, string> = { accept: "text/event-stream" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  const activePlant = req.cookies.get("safeops_active_plant")?.value;
  if (activePlant) headers["x-active-plant"] = activePlant;

  let upstream: Response;
  try {
    // The timeout covers getting response headers only; the backend sends
    // its first byte immediately, and the body then streams without a cap.
    // On a timeout the browser simply retries: the turn id makes it safe.
    upstream = await backendFetch(`${base}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: "no-store",
      timeoutMs: 25_000
    });
  } catch (err: any) {
    const timedOut = err?.name === "AbortError";
    return NextResponse.json(
      { detail: timedOut ? "The copilot service did not respond in time." : "Could not reach the copilot service." },
      { status: timedOut ? 504 : 502 }
    );
  }

  const ct = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !ct.includes("text/event-stream") || !upstream.body) {
    // Validation / auth / rate-limit errors come back as ordinary JSON.
    const text = await upstream.text();
    return new NextResponse(text || JSON.stringify({ detail: "Copilot request failed" }), {
      status: upstream.ok ? 502 : upstream.status,
      headers: { "content-type": ct.includes("json") ? ct : "application/json" }
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no"
    }
  });
}
