// Contractor prequalification form, reached by token (no account).
//
// Rendered client-side on purpose, like /supplier/[token]: the token is in the
// URL, the API is public, and server-rendering would put the token into the
// Next.js server's request logs on every view for no benefit.

import type { Metadata } from "next";
import { ContractorPrequalPortal } from "./prequal-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SafeOps360 — Contractor prequalification",
  robots: { index: false, follow: false },
};

export default async function ContractorPrequalPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  return <ContractorPrequalPortal token={token} />;
}
