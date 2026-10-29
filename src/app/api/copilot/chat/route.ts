// Streaming proxy for SafeOps Copilot (POST /api/copilot/chat).
//
// The catch-all proxy (app/api/[...path]) buffers every response and gives
// up after 26s, so a streamed chat turn needs its own route: same session →
// minted bearer → backend as the catch-all, but the upstream body is piped
// straight through as Server-Sent Events. When the browser stops reading
// (Stop button / panel closed) the stream is cancelled, which closes the
// upstream connection and the backend stops the turn.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mintBackendToken } from "@/lib/backend-token";
import { backendFetch } from "@/lib/backend-fetch";
import { backendCandidates } from "@/lib/backend-hosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A turn can run several tool rounds. Also set in vercel.json.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
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

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "text/event-stream"
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  const activePlant = req.cookies.get("safeops_active_plant")?.value;
  if (activePlant) headers["x-active-plant"] = activePlant;

  let upstream: Response;
  try {
    // The timeout covers getting response headers only; the backend sends
    // its first byte immediately, and the body then streams without a cap.
    upstream = await backendFetch(`${base}/api/copilot/chat`, {
      method: "POST",
      headers,
      body: await req.text(),
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
