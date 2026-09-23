import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ChunkRecovery } from "@/components/layout/chunk-recovery";
import { MissingRecordToast } from "@/components/common/missing-record-toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <AppShell>
      <ChunkRecovery />
      {/* useSearchParams() must sit under a Suspense boundary or `next build`
          refuses to prerender anything above it. */}
      <Suspense fallback={null}>
        <MissingRecordToast />
      </Suspense>
      {children}
    </AppShell>
  );
}
