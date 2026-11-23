import { PageHeader } from "@/components/page-header";
import { PssrRegister } from "@/components/pssr-psi/pssr-register";
import { PssrNav } from "@/components/pssr-psi/shared";
import { loadPssrContext } from "@/lib/pssr-psi/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "PSSR Register | SafeOps360" };

export default async function PssrRegisterPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadPssrContext();
  return (
    <div>
      <PageHeader
        title="Pre-Startup Safety Review"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "PSSR" }]}
        description="Pre-startup safety reviews for new facilities, modifications, turnarounds and restarts: checklist, punch list, sign-off matrix and the go / no-go decision."
      />
      <PssrNav />
      <PssrRegister plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
