import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { StudyReportView } from "@/components/pha/study-report";
import { backendFetch } from "@/lib/backend/fetch";
import { requirePermission } from "@/lib/auth/server";
import type { StudyReport } from "@/lib/pha/api";

export const dynamic = "force-dynamic";

export default async function HazopReportPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("PHA.READ");
  const { id } = await props.params;
  let report: StudyReport | null = null;
  let error: string | null = null;
  try {
    report = await backendFetch<StudyReport>(`/api/pha/studies/${encodeURIComponent(id)}/report`);
  } catch (e: any) {
    error = e?.message ?? "Could not load the report";
  }
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Button asChild size="sm" variant="outline">
          <Link href={`/process-safety/hazop/${encodeURIComponent(id)}`}>Back to study</Link>
        </Button>
        <PrintButton label="Print / save as PDF" />
        <span className="text-xs text-slate-500">Prints in A4 landscape.</span>
      </div>
      {report ? (
        <StudyReportView report={report} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      )}
    </div>
  );
}
