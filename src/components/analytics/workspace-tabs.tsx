// The Tier-2 workspace tab strip.
//
// Deliberately NOT the FilterTab pill tray. That tray already means "narrow
// the rows below" on a dozen register screens, and a workspace tab means
// something categorically different — it swaps what the screen IS. Reusing
// the pills would put two controls that look identical one above the other,
// where the top one changes the page and the bottom one filters it. Underline
// tabs are the conventional signal for the outer level, so that is what this
// is.
//
// Server component by design: every tab is a plain <Link>, the active tab is
// resolved on the server from `?tab=`, and no client bundle is shipped for
// what is ultimately five anchors.

import Link from "next/link";
import { INK, NAVY } from "@/lib/design/midnight";
import type { WorkspaceTab } from "@/lib/registers";

export function WorkspaceTabs({
  tabs,
  active,
  className,
}: {
  tabs: WorkspaceTab[];
  /** `key` of the active tab. Cross-route tabs pass their own id. */
  active: string;
  className?: string;
}) {
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="Workspace sections"
      className={`mb-5 flex items-center gap-1 overflow-x-auto border-b ${className ?? ""}`}
      style={{ borderColor: NAVY[200] }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
            style={{
              borderColor: isActive ? NAVY[700] : "transparent",
              color: isActive ? NAVY[700] : INK.muted,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
