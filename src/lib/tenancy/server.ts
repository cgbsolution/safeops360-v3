// Tenant boundary for server-rendered record pages.
//
// Several detail pages load their record straight from Prisma by id with no
// plant check, so any signed-in user who has (or guesses) an id can open it.
// This database hosts more than one demo tenant (Meridian Retail's sites carry
// a display-label profile; every pre-existing plant has none), so those pages
// now refuse a record whose site belongs to a different tenant than the
// viewer's home plant — exactly the partition the backend applies to EPC,
// fire templates and workflow assignment. Same tenant → unchanged behaviour.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function profileOf(plantId: string | null | undefined): Promise<string | null> {
  if (!plantId) return null;
  const rows = await prisma.$queryRaw<{ profileCode: string }[]>`
    select "profileCode" from "PlantDisplayProfile" where "plantId" = ${plantId}`;
  return rows[0]?.profileCode ?? null;
}

/** True when a record at `recordPlantId` is inside the viewer's tenant. */
export async function inViewerTenant(recordPlantId: string | null | undefined): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const viewerPlant = (session?.user as any)?.plantId as string | undefined;
  const [mine, theirs] = await Promise.all([profileOf(viewerPlant), profileOf(recordPlantId)]);
  return mine === theirs;
}
