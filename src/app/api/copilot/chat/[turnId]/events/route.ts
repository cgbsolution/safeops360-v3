// Resume a SafeOps Copilot turn's event stream
// (GET /api/copilot/chat/{turnId}/events?after=N). The browser calls this when
// a stream segment ends or a connection drops; the turn kept running on the
// backend meanwhile. See lib/copilot-proxy.ts.

import { NextRequest, NextResponse } from "next/server";
import { proxyCopilotStream, TURN_ID_RE } from "@/lib/copilot-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One stream segment is ~200 s; the backend ends it before this. Also set in vercel.json.
export const maxDuration = 300;

export async function GET(req: NextRequest, ctx: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await ctx.params;
  if (!TURN_ID_RE.test(turnId)) {
    return NextResponse.json({ detail: "Invalid turn id" }, { status: 400 });
  }
  const after = Math.max(0, Number.parseInt(req.nextUrl.searchParams.get("after") ?? "0", 10) || 0);
  return proxyCopilotStream(req, `/api/copilot/chat/${turnId}/events?after=${after}`, { method: "GET" });
}
