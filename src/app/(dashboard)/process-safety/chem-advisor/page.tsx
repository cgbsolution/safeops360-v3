import { PageHeader } from "@/components/page-header";
import { ChemAdvisor } from "@/components/pssr-psi/chem-advisor";
import { PsiNav } from "@/components/pssr-psi/shared";
import { loadPsiContext } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chem Advisor | SafeOps360" };

export default async function ChemAdvisorPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadPsiContext();
  return (
    <div>
      <PageHeader
        title="Chem advisor"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "Chem advisor" }]}
        description="Ask about chemicals held at the plant. Answers are grounded in the chemical register, SDS records and the compatibility rules, and cite the records they used."
      />
      <PsiNav />
      <ChemAdvisor plants={plants} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
