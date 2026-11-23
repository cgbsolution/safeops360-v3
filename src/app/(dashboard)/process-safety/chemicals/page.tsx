import { PageHeader } from "@/components/page-header";
import { ChemicalRegister } from "@/components/pssr-psi/chemical-register";
import { PsiNav } from "@/components/pssr-psi/shared";
import { loadPsiContext, userHolds } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chemical Register | SafeOps360" };

export default async function ChemicalRegisterPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const [{ plants, meta }, canManage] = await Promise.all([loadPsiContext(), userHolds("PSI.MANAGE")]);
  return (
    <div>
      <PageHeader
        title="Chemical register"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "Chemical register" }]}
        description="Every hazardous chemical held across the plant facilities, with GHS hazard, quantity against the permitted maximum, storage, SDS status and a compatibility checker."
      />
      <PsiNav />
      <ChemicalRegister plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} canManage={canManage} />
    </div>
  );
}
