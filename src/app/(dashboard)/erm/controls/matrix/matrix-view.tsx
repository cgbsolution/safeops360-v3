"use client";

import { Select, SelectItem } from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import { CONTROL_CATEGORIES, CONTROL_CATEGORY_LABEL } from "@/app/(dashboard)/erm/lib-t3";
import type { PlantOption } from "@/lib/plant-context";

// Client filter bar — pushes ?category to the server page which re-fetches the matrix.
export function MatrixFilters({ plants }: { plants: PlantOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const siteId = params.get("siteId") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/erm/controls/matrix${next.toString() ? `?${next.toString()}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Category</span>
        <Select
          value={category}
          onChange={(e) => setParam("category", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <SelectItem value="">All categories</SelectItem>
          {CONTROL_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>{CONTROL_CATEGORY_LABEL[c] ?? c}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Site</span>
        {/* Was a free-text "Filter by site id (Enter)" box — nobody knows their
            plant's cuid, so the filter was effectively unusable. */}
        <Select
          value={siteId}
          onChange={(e) => setParam("siteId", e.target.value)}
          className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <SelectItem value="">All sites</SelectItem>
          {plants.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}
