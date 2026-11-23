// QR scan destination for fire equipment labels: <origin>/q/fire/<equipmentCode>.
//
// Lives in the (field) group because it is a phone surface: no AppShell or
// sidebar, large touch targets, one asset per screen. Unlike the offline capture
// pages in this group it checks the session on the server, because a fire
// inspection is submitted online and must be attributed to a signed-in
// inspector. Permissions are enforced by /api/fire/* (FIRE.READ / FIRE.INSPECT).
//
// ?src=app marks an inspection started from inside the app rather than by
// scanning the physical label (recorded as FireInspection.scanned = false).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InspectionForm } from "@/components/fire/inspection-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fire equipment inspection | SafeOps360",
  robots: { index: false, follow: false },
};

export default async function FireQrPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { code } = await props.params;
  // Come straight back to this asset after signing in (login honours same-site callbackUrl).
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/q/fire/${encodeURIComponent(code)}`)}`);
  const sp = await props.searchParams;
  return <InspectionForm code={decodeURIComponent(code)} scanned={sp.src !== "app"} />;
}
