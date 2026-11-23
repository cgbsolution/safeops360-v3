import { PageHeader } from "@/components/page-header";
import { PssrNewForm } from "@/components/pssr-psi/pssr-new";
import { PssrNav } from "@/components/pssr-psi/shared";
import { loadPssrContext } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "New PSSR | SafeOps360" };

export default async function NewPssrPage(props: { searchParams: Promise<{ plantId?: string; mocId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadPssrContext();
  return (
    <div>
      <PageHeader
        title="New pre-startup safety review"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "PSSR", href: "/process-safety/pssr" }, { label: "New" }]}
        description="The checklist is copied from the template when the review is created; later template edits do not change it."
      />
      <PssrNav />
      <PssrNewForm plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} defaultMocId={sp.mocId ?? null} />
    </div>
  );
}
