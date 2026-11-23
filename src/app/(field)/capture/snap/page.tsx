import { SnapReport } from "@/components/observations/snap-report";

// Snap & Report — the 3-tap observation path (open → take photo → Submit).
// Lives in the (field) group beside Field Capture: phone-first chrome, no
// sidebar, session checked client-side (DECISIONS.md D11). Also launched from
// the "Quick photo report" button on /observations.
export const metadata = { title: "Snap & Report · SafeOps360" };

export default function SnapReportPage() {
  return <SnapReport />;
}
