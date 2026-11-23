import { PageHeader } from "@/components/page-header";
import { InspectionRegister } from "@/components/fire/inspection-register";
import { FireNav } from "@/components/fire/shared";
import { loadFireContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function FireInspectionsPage(props: {
  searchParams: Promise<{ plantId?: string; equipmentType?: string; result?: string; critical?: string }>;
}) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadFireContext();
  return (
    <div>
      <PageHeader
        title="Fire Inspection Register"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety", href: "/fire-safety" }, { label: "Inspection Register" }]}
        description="Every completed QR checklist inspection: who inspected what, where and when, the answers, and the CAPA raised for any failed critical check."
      />
      <FireNav />
      <InspectionRegister
        plants={plants} meta={meta}
        initial={{ plantId: sp.plantId, equipmentType: sp.equipmentType, result: sp.result, criticalOnly: sp.critical === "1" }}
      />
    </div>
  );
}
