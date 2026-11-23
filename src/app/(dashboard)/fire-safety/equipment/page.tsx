import { PageHeader } from "@/components/page-header";
import { EquipmentRegister } from "@/components/fire/equipment-register";
import { FireNav } from "@/components/fire/shared";
import { loadFireContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function FireEquipmentPage(props: {
  searchParams: Promise<{ plantId?: string; type?: string; status?: string; q?: string }>;
}) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadFireContext();
  return (
    <div>
      <PageHeader
        title="Fire Equipment Register"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety", href: "/fire-safety" }, { label: "Equipment" }]}
        description="Every extinguisher, hydrant, hose reel, detector, panel and pump, with its inspection due date and live status. Each asset carries a QR label that opens its checklist."
      />
      <FireNav />
      <EquipmentRegister plants={plants} meta={meta} initial={sp} />
    </div>
  );
}
