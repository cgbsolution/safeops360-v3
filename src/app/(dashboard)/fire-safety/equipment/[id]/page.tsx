import { PageHeader } from "@/components/page-header";
import { EquipmentDetail } from "@/components/fire/equipment-detail";
import { FireNav } from "@/components/fire/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { EquipmentDetail as Detail } from "@/lib/fire/api";
import { loadFireContext } from "../../_load";

export const dynamic = "force-dynamic";

type Loaded = { d: Detail; error: null } | { d: null; error: string };

export default async function FireEquipmentDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [ctx, loaded] = await Promise.all([
    loadFireContext(),
    backendFetch<Detail>(`/api/fire/equipment/${encodeURIComponent(id)}`)
      .then((d): Loaded => ({ d, error: null }))
      .catch((e: any): Loaded => ({ d: null, error: e?.message ?? "Could not load the equipment" })),
  ]);
  const d = loaded.d;
  return (
    <div>
      <PageHeader
        title={d ? d.equipmentCode : "Fire equipment"}
        breadcrumbs={[
          { label: "Operational Safety" },
          { label: "Fire Safety", href: "/fire-safety" },
          { label: "Equipment", href: "/fire-safety/equipment" },
          { label: d?.equipmentCode ?? "Asset" },
        ]}
      />
      <FireNav />
      {d ? (
        <EquipmentDetail initial={d} plants={ctx.plants} meta={ctx.meta} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{loaded.error}</div>
      )}
    </div>
  );
}
