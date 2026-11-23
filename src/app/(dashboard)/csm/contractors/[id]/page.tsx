import { PageHeader } from "@/components/page-header";
import { Contractor360View } from "@/components/csm/contractor-360";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../../_load";

export const dynamic = "force-dynamic";

export default async function Contractor360Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ renew?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const { plants, meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Contractor 360"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Contractors", href: "/csm/contractors" }, { label: "Contractor 360" }]}
      />
      <CsmNav />
      <Contractor360View id={id} plants={plants} meta={meta} openRenew={sp.renew === "1"} />
    </div>
  );
}
