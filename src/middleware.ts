// Only matches /ptw/control-center (see `config.matcher`) — every other route is
// untouched. Without it that path would be read as a permit id by /ptw/[id].
//
//   /ptw/control-center?mode=wall…  → rewrite to the kiosk wall view (URL unchanged)
//   /ptw/control-center?…           → redirect to /ptw (the Control Center tab), filters kept

import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  if (url.searchParams.get("mode") === "wall") {
    url.pathname = "/kiosk/ptw-wall";
    url.searchParams.delete("mode");
    return NextResponse.rewrite(url);
  }
  url.pathname = "/ptw";
  url.searchParams.delete("mode");
  url.searchParams.delete("token");
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/ptw/control-center"] };
