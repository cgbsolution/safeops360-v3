import { getServerSession } from "next-auth";
import { PageHeader } from "@/components/page-header";
import { HazopRegister } from "@/components/pha/hazop-register";
import { PhaNav } from "@/components/pha/shared";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server";
import { loadPhaContext } from "./_load";

export const dynamic = "force-dynamic";

export default async function HazopRegisterPage(props: { searchParams: Promise<{ plantId?: string; status?: string }> }) {
  await requirePermission("PHA.READ");
  const sp = await props.searchParams;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const canCreate = userId ? (await can(userId, "PHA.CREATE", {})).allowed : false;
  const { plants, meta } = await loadPhaContext();
  return (
    <div>
      <PageHeader
        title="PHA / HAZOP Studies"
        breadcrumbs={[{ label: "Process Safety", href: "/process-safety" }, { label: "PHA / HAZOP" }]}
        description="HAZOP, What-If and HAZID studies: team, sessions, nodes, the guideword worksheet with risk ranking, recommendations tracked to closure, and revalidation."
      />
      <PhaNav />
      <HazopRegister plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} defaultStatus={sp.status ?? null} canCreate={canCreate} />
    </div>
  );
}
