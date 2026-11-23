import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { resolvePlantContext } from "@/lib/plant-context";
import { IntegrationsAdmin } from "@/components/integrations/integrations-admin";
import type { IntegrationEndpoint, IntegrationMeta } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

// External-system connectors (JSL SAS portal first). Admins only: an endpoint
// decides what plant data leaves the platform and where it goes.
export default async function IntegrationsPage() {
  await requirePermission("INTEGRATION.READ");
  const [meta, endpoints, ctx] = await Promise.all([
    backendFetch<IntegrationMeta>("/api/integrations/meta").catch(() => null),
    backendFetch<{ items: IntegrationEndpoint[] }>("/api/integrations/endpoints").catch(() => ({ items: [] as IntegrationEndpoint[] })),
    resolvePlantContext(null),
  ]);
  return (
    <div>
      <PageHeader
        title="Integrations"
        breadcrumbs={[{ label: "Configuration", href: "/configuration" }, { label: "Integrations" }]}
        description="Connect observation reporting to external systems such as the JSL SAS portal: endpoint, authentication by server environment variable, field mapping, connection test and the sync log."
      />
      {meta ? (
        <IntegrationsAdmin meta={meta} initialEndpoints={endpoints.items} plants={ctx.plants.map((p) => ({ id: p.id, name: p.name }))} />
      ) : (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          The integrations service did not respond. If this is a fresh deployment, run prisma/apply-integrations-ddl.ts and restart the backend.
        </div>
      )}
    </div>
  );
}
