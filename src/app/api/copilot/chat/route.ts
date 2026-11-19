// Start a SafeOps Copilot turn (POST /api/copilot/chat) and stream it as
// Server-Sent Events. See lib/copilot-proxy.ts for how long answers survive
// Vercel's function limit (segments + resume).

import { NextRequest } from "next/server";
import { proxyCopilotStream } from "@/lib/copilot-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One stream segment is ~200 s; the backend ends it before this. Also set in vercel.json.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return proxyCopilotStream(req, "/api/copilot/chat", { method: "POST", body: await req.text() });
}
