import Link from "next/link";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BookLock, FileCheck } from "lucide-react";
import { ExecutionConsole } from "@/components/loto/execution-console";
import type { Execution } from "../../_meta";

export const dynamic = "force-dynamic";

export default async function LotoExecutionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  // The redirect stays outside the try — redirect() signals by throwing, and a
  // bare catch would swallow it.
  let execution: Execution | null = null;
  try {
    execution = await backendFetch<Execution>(`/api/loto/executions/${id}`);
  } catch {
    execution = null;
  }
  if (!execution) redirectMissingRecord("/loto/executions", "Lockout record");

  // The console needs to know WHICH participant row belongs to the viewer, since
  // every confirm button acts only on that row. Read from the session rather
  // than trusting anything client-side.
  const session = await getServerSession(authOptions);
  const currentUserId = ((session?.user as any)?.id as string | undefined) ?? "";

  return (
    <div>
      <PageHeader
        title={execution.number}
        description={execution.procedureTitle ?? undefined}
        breadcrumbs={[
          { label: "LOTO", href: "/loto" },
          { label: "Lockout records", href: "/loto/executions" },
          { label: execution.number }
        ]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/loto/${execution.procedureId}`}>
                <BookLock size={14} /> Procedure
              </Link>
            </Button>
            {execution.ptwId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/ptw/${execution.ptwId}`}>
                  <FileCheck size={14} /> {execution.ptwNumber ?? "Permit"}
                </Link>
              </Button>
            )}
          </div>
        }
      />
      <ExecutionConsole execution={execution} currentUserId={currentUserId} />
    </div>
  );
}
