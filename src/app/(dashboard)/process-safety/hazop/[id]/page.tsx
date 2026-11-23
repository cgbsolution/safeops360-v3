import { PageHeader } from "@/components/page-header";
import { PhaNav } from "@/components/pha/shared";
import { StudyDetailView } from "@/components/pha/study-detail";
import { backendFetch } from "@/lib/backend/fetch";
import { requirePermission } from "@/lib/auth/server";
import type { StudyDetail } from "@/lib/pha/api";
import { loadPhaContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function HazopStudyPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("PHA.READ");
  const { id } = await props.params;
  let study: StudyDetail | null = null;
  let error: string | null = null;
  try {
    study = await backendFetch<StudyDetail>(`/api/pha/studies/${encodeURIComponent(id)}`);
  } catch (e: any) {
    error = e?.message ?? "Could not load the study";
  }
  const { plants, meta } = await loadPhaContext();
  return (
    <div>
      <PageHeader
        title={study ? `${study.studyNo} · ${study.title}` : "PHA study"}
        breadcrumbs={[
          { label: "Process Safety", href: "/process-safety" },
          { label: "PHA / HAZOP", href: "/process-safety/hazop" },
          { label: study?.studyNo ?? "Study" },
        ]}
      />
      <PhaNav />
      {study ? (
        <StudyDetailView initial={study} meta={meta} plants={plants} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      )}
    </div>
  );
}
