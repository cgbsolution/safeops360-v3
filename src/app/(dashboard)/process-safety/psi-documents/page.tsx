import { PageHeader } from "@/components/page-header";
import { PsiDocumentsView } from "@/components/pssr-psi/psi-documents";
import { PsiNav } from "@/components/pssr-psi/shared";
import { loadPsiContext, userHolds } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "PSI Documents | SafeOps360" };

export default async function PsiDocumentsPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const [{ plants, meta }, canManage] = await Promise.all([loadPsiContext(), userHolds("PSI.MANAGE")]);
  return (
    <div>
      <PageHeader
        title="Process safety information"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "PSI documents" }]}
        description="Controlled PSI documents (P&IDs, PFDs, design basis, relief system design, area classification, datasheets, safe operating limits) with revision history, and which units hold a complete set."
      />
      <PsiNav />
      <PsiDocumentsView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} canManage={canManage} />
    </div>
  );
}
