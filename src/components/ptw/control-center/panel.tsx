"use client";

// Shared panel chrome for the ops-theme widgets: title row, and the three
// states every widget has (loading skeleton, empty, error). Flat — no shadows.

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PanelState = "ready" | "loading" | "error";

export function OpsPanel({
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
  labelledBy,
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
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? (id ? `${id}-title` : undefined);
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cn("ops-panel", className)}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 id={headingId} className="ops-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] ops-muted">{subtitle}</p>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </div>
      )}
      <div className={bodyClassName}>
        {state === "loading" ? (
          <OpsSkeleton />
        ) : state === "error" ? (
          <OpsError message={error} />
        ) : empty ? (
          <OpsEmpty>{empty}</OpsEmpty>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function OpsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 rounded-md" style={{ background: "var(--ops-surface-3)", width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function OpsEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="ops-inset px-4 py-6 text-center text-[13px] ops-muted">{children}</div>
  );
}

export function OpsError({ message }: { message?: string | null }) {
  return (
    <div role="alert" className="ops-inset ops-tint-crit flex items-center gap-2 px-4 py-3 text-[13px]" style={{ color: "var(--ops-crit-text)" }}>
      <AlertTriangle size={16} aria-hidden /> {message || "Could not load this panel."}
    </div>
  );
}

/** Severity colour tokens, used by bars / labels / rings. */
export const SEV_COLOR: Record<string, string> = {
  critical: "var(--ops-crit)",
  high: "var(--ops-warn)",
  medium: "var(--ops-info)",
  low: "var(--ops-muted)",
  warning: "var(--ops-warn)",
  info: "var(--ops-info)",
};
export const SEV_TEXT: Record<string, string> = {
  critical: "var(--ops-crit-text)",
  high: "var(--ops-warn-text)",
  medium: "var(--ops-text-2)",
  low: "var(--ops-muted)",
  warning: "var(--ops-warn-text)",
  info: "var(--ops-text-2)",
};
