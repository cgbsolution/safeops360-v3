"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";

export type PlantOption = {
  id: string;
  code: string;
  name: string;
};

export function PlantSwitcher({
  plants,
  currentPlantId
}: {
  plants: PlantOption[];
  currentPlantId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (plants.length === 0) return null;

  function onChange(plantId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (plantId) {
      params.set("plantId", plantId);
    } else {
      params.delete("plantId");
    }
    const url = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.push(url);
      router.refresh();
    });
  }

  return (
    <Label className="inline-flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:border-slate-300 transition font-normal leading-normal text-inherit">
      <Building2 size={14} className="text-slate-500" />
      <span className="text-slate-600 font-medium">Plant:</span>
      <Select
        value={currentPlantId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-auto w-auto gap-1 border-0 bg-transparent p-0 text-xs text-slate-800 outline-none cursor-pointer focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        {plants.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.code} — {p.name}
          </SelectItem>
        ))}
      </Select>
    </Label>
  );
}
