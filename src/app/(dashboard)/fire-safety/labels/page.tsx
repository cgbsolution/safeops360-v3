import { PageHeader } from "@/components/page-header";
import { LabelSheet } from "@/components/fire/label-sheet";
import { FireNav } from "@/components/fire/shared";
import { loadFireContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function FireLabelsPage(props: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadFireContext();
  const preselect = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="QR Labels"
          breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety", href: "/fire-safety" }, { label: "QR Labels" }]}
          description="Print weatherproof QR labels for fire equipment (A4, 21 per sheet, 63.5 × 38.1 mm). Scanning a label with any phone camera opens that asset's checklist after sign-in."
        />
        <FireNav />
      </div>
      <LabelSheet plants={plants} meta={meta} preselect={preselect} />
    </div>
  );
}
