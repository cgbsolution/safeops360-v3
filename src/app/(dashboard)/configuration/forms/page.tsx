// Form Designer — register of form definitions (Part B §2).
//
// Server component reading through the FastAPI backend, never Prisma directly:
// the engine owns which definitions a caller may see (each definition names its
// own permission prefix, so visibility is per-form, not per-table) and that
// logic lives in one place — app/routers/form_engine.py's list endpoint.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { requirePermission } from "@/lib/auth/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, humanize } from "@/lib/utils";
import { ChevronRight, FileStack, Layers, Workflow } from "lucide-react";
import { NewFormButton } from "./new-button";

export const dynamic = "force-dynamic";

type DefinitionSummary = {
  id: string;
  key: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  module: string;
  workflowModule: string | null;
  recordCount: number;
  updatedAt: string;
};

const STATUS_CHIP: Record<string, string> = {
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  ARCHIVED: "border-slate-200 bg-slate-50 text-slate-500"
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Live",
  DRAFT: "Draft",
  ARCHIVED: "Superseded"
};

export default async function FormsListPage() {
  // FORMS.PUBLISH is the authoring gate — the same code the Builder's write
  // endpoints check. Reading the register is not the sensitive act; changing
  // what every future record on a form means is.
  await requirePermission("FORMS.PUBLISH");

  let definitions: DefinitionSummary[] = [];
  let unavailable: string | null = null;
  try {
    definitions = (await backendFetch<DefinitionSummary[]>("/api/forms/definitions")) ?? [];
  } catch (e) {
    unavailable = e instanceof Error ? e.message : "The form engine is not reachable.";
  }

  const grouped = definitions.reduce<Record<string, DefinitionSummary[]>>((acc, d) => {
    (acc[d.module] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Build and publish forms without writing code. Every form published here is the same configuration an engineer would author by hand — the Builder is a UI over it, not a second system."
        breadcrumbs={[{ label: "Configuration" }, { label: "Forms" }]}
        action={<NewFormButton />}
      />

      {unavailable ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4 text-sm text-rose-800">{unavailable}</CardContent>
        </Card>
      ) : definitions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FileStack size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No forms yet</p>
            <p className="max-w-md text-xs text-slate-500">
              A form is a set of fields plus an optional approval workflow. Create one to see it in
              the register — records filed against it appear in the same inbox as every other
              module.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([module, defs]) => (
            <div key={module}>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                  <Layers size={16} />
                </div>
                <h2 className="text-base font-semibold text-slate-900">{humanize(module)}</h2>
                <span className="text-xs text-slate-500">
                  ({defs.length} form{defs.length === 1 ? "" : "s"})
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {defs.map((d) => (
                  <Link key={d.id} href={`/configuration/forms/${d.key}`} className="group block">
                    <Card className="h-full transition-all hover:border-primary-300 hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{d.title}</p>
                            <code className="font-mono text-[11px] text-slate-400">{d.key}</code>
                          </div>
                          <ChevronRight
                            size={16}
                            className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary-500"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={cn("text-[10px]", STATUS_CHIP[d.status])}>
                            {STATUS_LABEL[d.status]} · v{d.version}
                          </Badge>
                          {d.workflowModule ? (
                            <Badge className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                              <Workflow size={10} className="mr-1" />
                              {d.workflowModule}
                            </Badge>
                          ) : (
                            <Badge className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                              No approval
                            </Badge>
                          )}
                          <span className="ml-auto text-[11px] text-slate-400">
                            {d.recordCount} record{d.recordCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
