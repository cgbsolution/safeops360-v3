"use client";

// /ptw?tab=impairments — the impairment register (raise / approve / activate /
// restore / cancel / extend), zone setup (layout, polygons, guidance) and the
// wall-display tokens. Every write is re-checked server-side.

import { useState } from "react";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImpairmentsRegister } from "./impairments-register";
import { ZoneSetup } from "./zone-setup";
import { KioskTokens } from "./kiosk-tokens";

export function PtwImpairmentsWorkspace({ plants, defaultPlantId }: { plants: { id: string; name: string }[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState<string>(defaultPlantId ?? plants[0]?.id ?? "");
  return (
    <div className="space-y-4">
      {plants.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Plant</span>
          <Select aria-label="Plant" className="w-64" value={plant} onValueChange={setPlant}>
            {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </Select>
        </div>
      )}
      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">Impairment register</TabsTrigger>
          <TabsTrigger value="zones">Zone setup &amp; guidance</TabsTrigger>
          <TabsTrigger value="kiosk">Wall displays</TabsTrigger>
        </TabsList>
        <TabsContent value="register" className="mt-4">
          <ImpairmentsRegister plantId={plant || null} />
        </TabsContent>
        <TabsContent value="zones" className="mt-4">
          <ZoneSetup plantId={plant || null} />
        </TabsContent>
        <TabsContent value="kiosk" className="mt-4">
          <KioskTokens plantId={plant || null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
