"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { label, TONE } from "@/lib/csm/api";

// Form furniture is shared with the IMS registers rather than copied.
export { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam } from "@/components/ims/shared";

const NAV = [
  { href: "/csm", label: "CSM Hub", exact: true },
  { href: "/csm/contractors", label: "Contractors" },
  { href: "/csm/prequalifications", label: "Prequalification" },
  { href: "/csm/work-orders", label: "Work Orders" },
  { href: "/csm/evaluations", label: "Evaluations" },
  { href: "/csm/templates", label: "Questionnaires" },
];

export function CsmNav() {
  const path = usePathname() ?? "";
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        return (
          <Button key={n.href} asChild size="sm" variant={active ? "default" : "ghost"}>
            <Link href={n.href}>{n.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}

export function Pill({ value, text, className }: { value: string | null | undefined; text?: string; className?: string }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <Badge className={cn("border text-[11px] font-medium", TONE[value] ?? "bg-slate-100 text-slate-700 border-slate-200", className)}>
      {text ?? label(value)}
    </Badge>
  );
}

type Tone = "good" | "warn" | "bad" | undefined;

export function Tile({ title, value, sub, tone, href }: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; href?: string }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  const body = (
    <div className={cn("h-full w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition", href && "hover:border-primary-400 hover:shadow-sm")}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
  return href ? (
    <Button asChild variant="bare" className="block h-full w-full">
      <Link href={href}>{body}</Link>
    </Button>
  ) : (
    body
  );
}

export function LinkButton({ href, children, variant = "link", size = "sm", className }: {
  href: string; children: React.ReactNode; variant?: "link" | "outline" | "ghost" | "default"; size?: "sm" | "default"; className?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={cn(variant === "link" && "h-auto p-0", className)}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function ScoreText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const tone = value >= 70 ? "text-emerald-700" : value >= 55 ? "text-amber-700" : "text-rose-700";
  return <span className={cn("font-semibold tabular-nums", tone)}>{value.toFixed(1)}</span>;
}

export function KeyVal({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</div>
      <div className="text-sm text-slate-800">{v ?? "—"}</div>
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
