// Wall / kiosk view of the PTW Control Center. Reached as
// /ptw/control-center?mode=wall[&token=…] — src/middleware.ts rewrites that URL
// here so the address the TV shows stays the documented one. Outside the
// (dashboard) group on purpose: no sidebar, no login redirect. With a kiosk
// token it reads the token-scoped read-only endpoint; without one it uses the
// signed-in session (a logged-in user's "Wall mode" button).

import { Suspense } from "react";
import type { Metadata } from "next";
import { PtwControlCenter } from "@/components/ptw/control-center/control-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PTW Control Center — wall display", robots: { index: false } };

export default async function PtwWallPage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await props.searchParams;
  return (
    <Suspense fallback={<div data-theme="ops" className="min-h-screen" />}>
      <PtwControlCenter mode="wall" kioskToken={token ?? null} />
    </Suspense>
  );
}
