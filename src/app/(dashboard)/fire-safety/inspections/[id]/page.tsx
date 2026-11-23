import { PageHeader } from "@/components/page-header";
import { InspectionDetail } from "@/components/fire/inspection-detail";
import { FireNav } from "@/components/fire/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { FireInspection } from "@/lib/fire/api";

export const dynamic = "force-dynamic";

export default async function FireInspectionDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  let insp: FireInspection | null = null;
  let error: string | null = null;
  try {
    insp = await backendFetch<FireInspection>(`/api/fire/inspections/${encodeURIComponent(id)}`);
  } catch (e: any) {
    error = e?.message ?? "Could not load the inspection";
  }
  return (
    <div>
      <PageHeader
        title={insp ? `${insp.inspectionNo} · ${insp.equipmentCode}` : "Fire inspection"}
        breadcrumbs={[
          { label: "Operational Safety" },
          { label: "Fire Safety", href: "/fire-safety" },
          { label: "Inspection Register", href: "/fire-safety/inspections" },
          { label: insp?.inspectionNo ?? "Inspection" },
        ]}
      />
      <FireNav />
      {insp ? (
        <InspectionDetail i={insp} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      )}
    </div>
  );
}
