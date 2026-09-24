"use client";

// A workflow step's caption: the FLRA plain-language rename (stepDisplayName),
// then the tenant's display-label override for that caption. Step names are
// stored on the workflow definition ("Plant Head Final Close"), so this is the
// one place they are turned into what a user reads. Renders a bare text node,
// identical to the old inline call when no override exists.

import { useLabels } from "@/components/labels/label-provider";
import { stepDisplayName } from "@/lib/flra/terminology";

export function StepName({ name }: { name: string | null | undefined }) {
  const L = useLabels();
  const shown = stepDisplayName(name);
  return <>{shown ? L(`workflow.step.${shown}`, shown) : shown}</>;
}
