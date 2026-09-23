// Form Designer shell.
//
// Fetches the definition and the engine's own capability metadata server-side,
// then hands both to the client Designer. The meta fetch is deliberate: the
// palette is built from what the ENGINE reports it can execute, so the Builder
// can never offer a field type, operator or formula function the runtime does
// not implement (Part B §5).
//
// Loads the LATEST version — published if there is one, else the newest draft —
// which is what an author expects to open. Older versions stay reachable
// through the engine's ?version= parameter and render read-only.

import { notFound } from "next/navigation";
import { backendFetch } from "@/lib/backend/fetch";
import { requirePermission } from "@/lib/auth/server";
import { FormDesigner } from "@/components/forms/builder/designer";
import type { EngineMeta, FormDefinitionDTO } from "@/components/forms/types";

export const dynamic = "force-dynamic";

export default async function FormDesignerPage({
  params,
  searchParams
}: {
  // Next 15: both are promises. Reading them synchronously type-checks but
  // fails `next build`, which silently ships a stale page.
  params: Promise<{ key: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  await requirePermission("FORMS.PUBLISH");

  const { key } = await params;
  const { version } = await searchParams;

  let definition: FormDefinitionDTO | null = null;
  let meta: EngineMeta | null = null;

  try {
    [definition, meta] = await Promise.all([
      backendFetch<FormDefinitionDTO>(
        `/api/forms/definitions/${encodeURIComponent(key)}`,
        version ? { query: { version } } : {}
      ),
      backendFetch<EngineMeta>("/api/forms/meta")
    ]);
  } catch {
    notFound();
  }

  if (!definition || !meta) notFound();

  return <FormDesigner initial={definition} meta={meta} />;
}
