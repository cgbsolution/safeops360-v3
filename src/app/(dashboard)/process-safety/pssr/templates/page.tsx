import { PageHeader } from "@/components/page-header";
import { PssrTemplatesAdmin } from "@/components/pssr-psi/pssr-templates";
import { PssrNav } from "@/components/pssr-psi/shared";
import { loadPssrContext } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "PSSR Templates | SafeOps360" };

export default async function PssrTemplatesPage() {
  const { plants, meta } = await loadPssrContext();
  return (
    <div>
      <PageHeader
        title="PSSR checklist templates"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "PSSR", href: "/process-safety/pssr" }, { label: "Templates" }]}
        description="The checklist each new review starts from: sections, checks, the discipline that owns each check and the punch category a NO answer gets."
      />
      <PssrNav />
      <PssrTemplatesAdmin plants={plants} meta={meta} />
    </div>
  );
}
