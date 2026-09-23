"use client";

// The Kaizen register's search + filter row.
//
// Client component over a server-rendered list: every control writes to the URL
// and lets the server component re-fetch. That is deliberate — a filtered
// register is a link somebody pastes into a message ("here are the four ideas
// past target at Tirupur"), and client-only state cannot be pasted.
//
// Status is MULTI-select here and single-select on the tab row above. Both are
// kept: the tabs are how somebody moves between the six states they look at
// every day, and this is how they build the one combination the tabs cannot
// express — "awaiting screening AND implementing" was the case that forced it.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { KAIZEN_CATEGORY_LABEL, KAIZEN_STATUS_LABEL } from "../_meta";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";

const STATUSES = [
  "SUBMITTED",
  "SCREENED",
  "APPROVED",
  "IN_IMPLEMENTATION",
  "IMPLEMENTED",
  "VERIFIED",
  "CLOSED",
  "REJECTED",
  "PARKED",
  "DRAFT"
];

const CATEGORIES = [
  "SAFETY",
  "QUALITY",
  "COST",
  "DELIVERY",
  "MORALE",
  "PRODUCTIVITY",
  "ENVIRONMENT"
];

const SORTS: { value: string; label: string }[] = [
  { value: "createdAt", label: "Raised" },
  { value: "targetDate", label: "Target date" },
  { value: "verifiedAnnualSaving", label: "Verified saving" },
  { value: "estimatedAnnualSaving", label: "Estimated saving" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" }
];

export function KaizenFilterBar({ exportHref }: { exportHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const firstRender = useRef(true);

  const push = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.push(`${pathname}${next.toString() ? `?${next}` : ""}`);
    },
    [params, pathname, router]
  );

  // Debounced so a search box does not fire a server round-trip per keystroke.
  // Skipped on first render: without the guard, mounting the component pushes
  // the URL it was already on and the browser's Back button stops working.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) push({ q: q || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [q, params, push]);

  const selectedStatuses = (params.get("status") ?? "").split(",").filter(Boolean);
  const toggleStatus = (code: string) => {
    const next = selectedStatuses.includes(code)
      ? selectedStatuses.filter((s) => s !== code)
      : [...selectedStatuses, code];
    push({ status: next.join(",") || undefined });
  };

  const activeCount = [
    params.get("category"),
    params.get("lane"),
    params.get("raisedFrom"),
    params.get("raisedTo"),
    params.get("savingMin"),
    params.get("savingMax"),
    selectedStatuses.length > 1 ? "multi" : null
  ].filter(Boolean).length;

  const clearAll = () => {
    // plantId survives a clear. It is the page's context, not a filter — losing
    // it would silently widen the register to every plant the user can read.
    const plantId = params.get("plantId");
    setQ("");
    router.push(`${pathname}${plantId ? `?plantId=${plantId}` : ""}`);
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, number, problem or countermeasure…"
            aria-label="Search the Kaizen register"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-8 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          {q && (
            <Button variant="bare"
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear the search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={14} />
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary-100 px-1.5 text-[11px] font-semibold text-primary-700">
              {activeCount}
            </span>
          )}
        </Button>

        <Select
          value={params.get("sort") ?? "createdAt"}
          onChange={(e) => push({ sort: e.target.value })}
          aria-label="Sort by"
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-primary-400 w-auto"
        >
          {SORTS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              Sort: {s.label}
            </SelectItem>
          ))}
        </Select>
        <Select
          value={params.get("direction") ?? "desc"}
          onChange={(e) => push({ direction: e.target.value })}
          aria-label="Sort direction"
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-primary-400 w-auto"
        >
          <SelectItem value="desc">Newest / highest first</SelectItem>
          <SelectItem value="asc">Oldest / lowest first</SelectItem>
        </Select>

        {/* A plain link, not a fetch-and-blob. The catch-all API proxy corrupts
            binary bodies it reads as text, and a normal navigation to the
            backend route sidesteps that path entirely. */}
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <Download size={15} /> Export
          </a>
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Status — pick as many as you need
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((code) => {
                const active = selectedStatuses.includes(code);
                return (
                  <Button variant="bare"
                    key={code}
                    type="button"
                    onClick={() => toggleStatus(code)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      active
                        ? "border-primary-300 bg-primary-50 font-medium text-primary-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {KAIZEN_STATUS_LABEL[code] ?? code}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Category">
              <Select
                value={params.get("category") ?? ""}
                onChange={(e) => push({ category: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <SelectItem value="">Any</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {KAIZEN_CATEGORY_LABEL[c] ?? c}
                  </SelectItem>
                ))}
              </Select>
            </Field>

            <Field label="Approval route">
              <Select
                value={params.get("lane") ?? ""}
                onChange={(e) => push({ lane: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="STANDARD">Committee screening</SelectItem>
                <SelectItem value="FAST_TRACK">Supervisor fast lane</SelectItem>
              </Select>
            </Field>

            <Field label="Raised from">
              <Input
                type="date"
                value={(params.get("raisedFrom") ?? "").slice(0, 10)}
                onChange={(e) => push({ raisedFrom: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Raised to">
              <Input
                type="date"
                value={(params.get("raisedTo") ?? "").slice(0, 10)}
                onChange={(e) => push({ raisedTo: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </Field>

            <Field label="Saving / yr at least">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="e.g. 50000"
                defaultValue={params.get("savingMin") ?? ""}
                onBlur={(e) => push({ savingMin: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Saving / yr at most">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={params.get("savingMax") ?? ""}
                onBlur={(e) => push({ savingMax: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <p className="text-xs text-slate-500">
            Saving filters read the verified figure where one has been recorded
            and the estimate otherwise.
          </p>

          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={clearAll}>
              Clear all filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block font-normal leading-normal text-inherit text-[length:inherit]">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </Label>
  );
}
