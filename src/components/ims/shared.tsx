"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { label, STATUS_TONE, type PlantOption } from "@/lib/ims/api";

const NAV = [
  { href: "/ims", label: "MIS Dashboard", exact: true },
  { href: "/ims/toolbox-talks", label: "Toolbox Talks" },
  { href: "/ims/show-cause", label: "Show Cause Notices" },
  { href: "/ims/meetings", label: "Safety Meetings" },
  { href: "/ims/mom", label: "MOM Tracker" },
  { href: "/ims/mock-drills", label: "Mock Drills" },
];

export function ImsNav() {
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

export const ALL_PLANTS = "__all__";

export function PlantSelect({
  plants, value, onChange, allowAll = true, className,
}: {
  plants: PlantOption[];
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} className={cn("h-9 w-56", className)} aria-label="Plant">
      {allowAll && <SelectItem value={ALL_PLANTS}>All plants in my scope</SelectItem>}
      {plants.map((p) => (
        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
      ))}
    </Select>
  );
}

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge className={cn("border text-[11px] font-medium", STATUS_TONE[status] ?? "bg-slate-100 text-slate-700 border-slate-200")}>
        {label(status)}
      </Badge>
      {overdue && <Badge className={cn("border text-[11px] font-medium", STATUS_TONE.OVERDUE)}>Overdue</Badge>}
    </span>
  );
}

export function Field({ label: text, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">
        {text}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>;
}

export function EmptyRow({ text }: { text: string }) {
  return <div className="px-3 py-10 text-center text-sm text-slate-400">{text}</div>;
}

/** Plant id to send to the API: undefined for "all plants". */
export function plantParam(v: string): string | undefined {
  return v === ALL_PLANTS ? undefined : v;
}
