"use client";

// Filter bar for the Cross-Module Analytics Dashboard.
//
// Same contract as the Analytics Screen Contract's SegmentBar (Build 1): the
// URL is the state, selection re-queries in place via router.replace +
// refresh, and a filtered view is therefore a shareable link. Kept as its own
// component rather than reusing SegmentBar because the axes are different —
// that one filters a single module's records by site/severity/window, this one
// filters findings by severity, module, class and status.

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { INK, NAVY } from "@/lib/design/midnight";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

function FilterSelect({
  label,
  param,
  value,
  options,
  allLabel,
  pending,
  onChange,
}: {
  label: string;
  param: string;
  value: string | null;
  options: FilterOption[];
  allLabel: string;
  pending: boolean;
  onChange: (param: string, v: string | null) => void;
}) {
  return (
    <Label
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] font-normal leading-normal focus-within:border-primary-500"
      style={{ borderColor: NAVY[200], color: INK.strong }}
    >
      <span className="font-medium" style={{ color: INK.muted }}>
        {label}
      </span>
      <Select
        className="h-auto w-auto cursor-pointer gap-1 rounded-none border-0 bg-transparent p-0 text-[12px] outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-wait"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => onChange(param, e.target.value || null)}
        aria-label={label}
      >
        <SelectItem value="">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined ? ` · ${o.count}` : ""}
          </SelectItem>
        ))}
      </Select>
    </Label>
  );
}

export function SignalFilterBar({
  severity,
  module,
  ruleClass,
  status,
  severityOptions,
  moduleOptions,
  classOptions,
  total,
}: {
  severity: string | null;
  module: string | null;
  ruleClass: string | null;
  status: string | null;
  severityOptions: FilterOption[];
  moduleOptions: FilterOption[];
  classOptions: FilterOption[];
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (key: string, v: string | null) => {
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      if (v) p.set(key, v);
      else p.delete(key);
      const qs = p.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        router.refresh();
      });
    },
    [pathname, router, searchParams]
  );

  const filtered = Boolean(severity || module || ruleClass || status);

  return (
    <div
      className="sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 backdrop-blur"
      style={{ borderColor: NAVY[200], backgroundColor: "rgba(232,238,247,0.92)" }}
      role="search"
      aria-label="Signal filters"
    >
      <FilterSelect label="Severity" param="severity" value={severity} options={severityOptions}
              allLabel="All severities" pending={pending} onChange={set} />
      <FilterSelect label="Module" param="module" value={module} options={moduleOptions}
              allLabel="All modules" pending={pending} onChange={set} />
      <FilterSelect label="Type" param="class" value={ruleClass} options={classOptions}
              allLabel="All types" pending={pending} onChange={set} />
      <FilterSelect
        label="Status"
        param="status"
        value={status}
        options={[
          { value: "OPEN", label: "Open" },
          { value: "ACKNOWLEDGED", label: "Acknowledged" },
          { value: "ACTIONED", label: "Actioned" },
          { value: "DISMISSED", label: "Dismissed" },
          { value: "EXPIRED", label: "Expired" },
        ]}
        allLabel="Live (open + acknowledged)"
        pending={pending}
        onChange={set}
      />

      {filtered && (
        <Button variant="bare"
          type="button"
          onClick={() =>
            startTransition(() => {
              router.replace(pathname, { scroll: false });
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium hover:underline"
          style={{ color: NAVY[700] }}
        >
          <RotateCcw size={12} aria-hidden />
          Reset
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: INK.muted }}>
        {pending ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Filtering…
          </span>
        ) : (
          <span className="tabular-nums">
            {total} signal{total === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}
