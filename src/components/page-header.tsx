// Midnight Executive ink. PageHeader is on every screen in the product, so the
// slate ramp it used was the single largest source of off-brand colour left
// after the Build 1 token change — and it defeated the analytics colour audit
// on all eleven screens identically. Retinted to the design system's own
// cooled-navy ink scale (src/lib/design/midnight.ts).
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { INK } from "@/lib/design/midnight";

export function PageHeader({
  title,
  titleTooltip,
  description,
  breadcrumbs,
  action
}: {
  title: string;
  /** Secondary gloss on hover — e.g. the technical term behind a plain-language
   *  title ("Also known as FLRA…"). Never a substitute for `description`. */
  titleTooltip?: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <div className="mb-2 flex items-center text-xs" style={{ color: INK.muted }}>
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center">
              {b.href ? (
                <Link href={b.href} className="hover:text-primary-700">{b.label}</Link>
              ) : (
                <span>{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight size={12} className="mx-1" />}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: INK.strong }} title={titleTooltip}>{title}</h1>
          {description && (
            <p className="mt-1 text-sm" style={{ color: INK.muted }}>{description}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
