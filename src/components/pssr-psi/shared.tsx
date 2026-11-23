"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { label, TONE } from "@/lib/pssr-psi/api";

// Generic form / layout helpers shared with the IMS screens.
export { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam } from "@/components/ims/shared";

const PSSR_NAV = [
  { href: "/process-safety/pssr", label: "PSSR register", exact: true },
  { href: "/process-safety/pssr/new", label: "New PSSR", exact: true },
  { href: "/process-safety/pssr/templates", label: "Checklist templates" },
];

const PSI_NAV = [
  { href: "/process-safety/chemicals", label: "Chemical register" },
  { href: "/process-safety/psi-documents", label: "PSI documents" },
  { href: "/process-safety/chem-advisor", label: "Chem advisor" },
];

function Nav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname() ?? "";
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 print:hidden">
      {items.map((n) => {
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

export function PssrNav() {
  return <Nav items={PSSR_NAV} />;
}

export function PsiNav() {
  return <Nav items={PSI_NAV} />;
}

/** A coloured chip for any status / category / verdict code. */
export function Tag({ code, text, className }: { code: string | null | undefined; text?: string; className?: string }) {
  if (!code) return <span className="text-xs text-slate-400">—</span>;
  return (
    <Badge className={cn("border text-[11px] font-medium", TONE[code] ?? "border-slate-200 bg-slate-100 text-slate-700", className)}>
      {text ?? label(code)}
    </Badge>
  );
}

export function Stat({ label: text, value, tone }: { label: string; value: number | string; tone?: "bad" | "warn" | "ok" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{text}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-slate-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}
