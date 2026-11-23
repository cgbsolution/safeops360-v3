import { PageHeader } from "@/components/page-header";
import { ContractorsView } from "@/components/csm/contractors";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function CsmContractorsPage(props: { searchParams: Promise<{ plantId?: string; qualification?: string; register?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Contractors"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Contractors" }]}
        description="Plant contractors, their prequalification status and validity, live safety score and latest evaluation."
      />
      <CsmNav />
      <ContractorsView plants={plants} defaultPlantId={sp.plantId ?? null} initialQualification={sp.qualification ?? null} openRegister={sp.register === "1"} />
    </div>
  );
}
