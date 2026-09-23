// Shared presentational pieces for the three Business Excellence registers.
//
// Kept here rather than duplicated per register so the Kaizen, OPL and Poka
// Yoke screens read as one module — the same stat tiles, the same chips, the
// same empty states.

import Link from "next/link";
import type { ReactNode } from "react";

export function StatBox({
  label,
  value,
  tone = "default",
  icon: Icon,
  hint,
  href
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
  icon?: any;
  hint?: string;
  /**
   * Optional destination — usually the filtered list this number counts.
   *
   * A tile that states a problem and cannot be clicked is a number people learn
   * to scroll past: it tells somebody four devices are switched off and leaves
   * them to work out which four. When `href` is set the tile becomes a link and
   * picks up a hover state, so it reads as actionable rather than decorative.
   */
  href?: string;
}) {
  const colors: Record<string, string> = {
    default: "bg-primary-50 text-primary-800 border-primary-100",
    success: "bg-emerald-50 text-emerald-800 border-emerald-100",
    warning: "bg-amber-50 text-amber-800 border-amber-100",
    danger: "bg-rose-50 text-rose-800 border-rose-100"
  };
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-70">
        {Icon ? <Icon size={12} /> : null} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs opacity-70">{hint}</div> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-xl border p-4 transition hover:brightness-95 ${colors[tone]}`}
      >
        {body}
      </Link>
    );
  }
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}>{body}</div>;
}

export function Chip({
  label,
  className,
  title
}: {
  label: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        className ?? "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon?: any;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      {Icon ? <Icon size={28} className="mx-auto text-slate-400" /> : null}
      <div className="mt-3 font-semibold text-slate-700">{title}</div>
      {description ? (
        <div className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Surfaces the REAL reason a register could not load.
 *
 * Rendering an empty table on a failed fetch reads as "no records exist", which
 * is the opposite of the truth and in these registers is actively misleading —
 * an empty Poka Yoke list says the line has no mistake-proofing at all.
 */
export function LoadError({ what, message }: { what: string; message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <div className="font-semibold">{what} could not be loaded.</div>
      <div className="mt-1 text-rose-700">{message}</div>
      <div className="mt-2 text-xs text-rose-600">
        This is a load failure, not an empty register — do not read it as “nothing
        is recorded here”.
      </div>
    </div>
  );
}

/** A record reference rendered as name · site, never a raw cuid. */
export function RecordRef({
  href,
  code,
  title
}: {
  href: string;
  code: string | null;
  title: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className="font-medium text-slate-900 group-hover:text-primary-700">{title}</div>
      {code ? (
        <div className="mt-0.5 font-mono text-[11px] text-slate-500">{code}</div>
      ) : (
        <div className="mt-0.5 text-[11px] italic text-slate-400">Not yet numbered</div>
      )}
    </Link>
  );
}

/** Person as name · role, per the platform rule against rendering user ids. */
export function PersonRef({
  person,
  fallback = "Unassigned"
}: {
  person: { name: string; role?: string | null } | null | undefined;
  fallback?: string;
}) {
  if (!person) return <span className="text-slate-400">{fallback}</span>;
  return (
    <span className="text-slate-700">
      {person.name}
      {person.role ? (
        <span className="ml-1 text-[11px] text-slate-400">
          {person.role.replace(/_/g, " ").toLowerCase()}
        </span>
      ) : null}
    </span>
  );
}
