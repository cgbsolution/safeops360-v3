import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Can } from "@/components/auth/can";
import { FlraTable, type FlraRow } from "./flra-table";
import { SITE_SAFETY_CHECK, FLRA_TOOLTIP } from "@/lib/flra/terminology";

export const dynamic = "force-dynamic";

export default async function FLRAPage() {
  const items = await prisma.fLRA.findMany({
    select: {
      id: true,
      number: true,
      date: true,
      jobDescription: true,
      plant: { select: { name: true } },
      leader: { select: { name: true } },
      permit: { select: { id: true, number: true } }
    },
    // Newest-created first (platform-wide list convention).
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100
  });

  const rows: FlraRow[] = items.map((f) => ({
    id: f.id,
    number: f.number,
    date: f.date.toISOString(),
    plantName: f.plant.name.replace(" Integrated Unit", "").replace(" Grinding Unit", ""),
    jobDescription: f.jobDescription,
    leaderName: f.leader.name,
    permitId: f.permit?.id ?? null,
    permitNumber: f.permit?.number ?? null
  }));

  return (
    <div>
      <PageHeader
        title={SITE_SAFETY_CHECK}
        titleTooltip={FLRA_TOOLTIP}
        description="Confirm on-site conditions, hazards and PPE with the crew before work starts"
        action={
          <Can permission="FLRA.CREATE">
            <Button asChild>
              <Link href="/flra/new">
                <Plus size={16} /> New Site Safety Check
              </Link>
            </Button>
          </Can>
        }
      />

      <FlraTable data={rows} />
    </div>
  );
}
