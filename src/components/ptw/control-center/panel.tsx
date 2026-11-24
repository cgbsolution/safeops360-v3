"use client";

// Shared card chrome for the Control Center widgets, in the portal's standard
// look (shadcn Card, slate text, rose / amber / emerald status colours). Every
// widget has the same three states: loading skeleton, empty, error.

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PanelState = "ready" | "loading" | "error";

export function CcPanel({
  title,
  subtitle,
  right,
  state = "ready",
  empty,
  error,
  className,
  bodyClassName,
  children,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  state?: PanelState;
  /** Shown instead of children when set (and state is ready). */
  empty?: ReactNode;
  error?: string | null;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className={cn("min-w-0", className)}>
      {(title || right) && (
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            {title && <CardTitle className="text-sm">{title}</CardTitle>}
            {subtitle && <CardDescription className="mt-1 text-xs">{subtitle}</CardDescription>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </CardHeader>
      )}
      <CardContent className={bodyClassName}>
        {state === "loading" ? (
          <CcSkeleton />
        ) : state === "error" ? (
          <CcError message={error} />
        ) : empty ? (
          <CcEmpty>{empty}</CcEmpty>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function CcSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function CcEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{children}</div>;
}

export function CcError({ message }: { message?: string | null }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle size={16} aria-hidden /> {message || "Could not load this panel."}
    </div>
  );
}

/** Severity → portal colour classes. Text label always accompanies the colour. */
export const SEV = {
  critical: { bar: "bg-rose-500", text: "text-rose-700", chip: "border-rose-200 bg-rose-50 text-rose-700" },
  high: { bar: "bg-amber-500", text: "text-amber-700", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  medium: { bar: "bg-blue-500", text: "text-blue-700", chip: "border-blue-200 bg-blue-50 text-blue-700" },
  low: { bar: "bg-slate-400", text: "text-slate-600", chip: "border-slate-200 bg-slate-50 text-slate-600" },
  warning: { bar: "bg-amber-500", text: "text-amber-700", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  info: { bar: "bg-slate-400", text: "text-slate-600", chip: "border-slate-200 bg-slate-50 text-slate-600" },
} as const;
export const sev = (k: string | null | undefined) => SEV[(k ?? "low") as keyof typeof SEV] ?? SEV.low;
