import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { ProcedureBuilder } from "@/components/loto/procedure-builder";
import type { Procedure } from "../../_meta";

export const dynamic = "force-dynamic";

export default async function EditLotoProcedurePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  // The redirect stays outside the try — redirect() signals by throwing.
  let procedure: Procedure | null = null;
  try {
    procedure = await backendFetch<Procedure>(`/api/loto/procedures/${id}`);
  } catch {
    procedure = null;
  }
  if (!procedure) redirectMissingRecord("/loto", "LOTO procedure");

  return (
    <div>
      <PageHeader
        title={`Edit ${procedure.procedureCode}`}
        description={procedure.title}
        breadcrumbs={[
          { label: "LOTO", href: "/loto" },
          { label: procedure.procedureCode, href: `/loto/${procedure.id}` },
          { label: "Edit" }
        ]}
      />
      <ProcedureBuilder
        plantId={procedure.siteId}
        plantName={procedure.siteName}
        procedure={procedure}
      />
    </div>
  );
}
