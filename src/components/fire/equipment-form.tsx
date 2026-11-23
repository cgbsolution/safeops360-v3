"use client";

// Register / edit one fire equipment asset (POST / PATCH /api/fire/equipment).

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GpsCaptureStatus } from "@/components/ui/gps-capture";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useGeolocation } from "@/hooks/use-geolocation";
import { ErrorBox, Field, PlantSelect } from "@/components/ims/shared";
import { fireFetch, fireLabel, type FireEquipment, type FireMeta, type PlantOption } from "@/lib/fire/api";

type Form = {
  plantId: string; type: string; location: string; buildingId: string; make: string; model: string;
  serialNo: string; capacitySpec: string; inspectionFrequencyDays: string; floorLevel: string;
  maintenanceContractor: string; installationDate: string; lastInspectionDate: string;
  latitude: string; longitude: string;
};

const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const txt = (v: string) => (v.trim() === "" ? null : v.trim());

function fromEquipment(e: FireEquipment | null, plantId: string, meta: FireMeta | null): Form {
  const type = e?.type ?? meta?.equipmentTypes[0] ?? "FIRE_EXTINGUISHER";
  return {
    plantId: e?.plantId ?? plantId, type, location: e?.location ?? "", buildingId: e?.buildingId ?? "",
    make: e?.make ?? "", model: e?.model ?? "", serialNo: e?.serialNo ?? "", capacitySpec: e?.capacitySpec ?? "",
    inspectionFrequencyDays: String(e?.inspectionFrequencyDays ?? meta?.defaultFrequencyDays[type] ?? 30),
    floorLevel: e?.floorLevel != null ? String(e.floorLevel) : "", maintenanceContractor: e?.maintenanceContractor ?? "",
    installationDate: dateOnly(e?.installationDate), lastInspectionDate: "",
    latitude: e?.latitude != null ? String(e.latitude) : "", longitude: e?.longitude != null ? String(e.longitude) : "",
  };
}

export function EquipmentFormDialog({
  open, onOpenChange, equipment, plants, meta, defaultPlantId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipment: FireEquipment | null; // null = register new
  plants: PlantOption[];
  meta: FireMeta | null;
  defaultPlantId: string | null;
  onSaved: (e: FireEquipment) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Form>(() => fromEquipment(equipment, defaultPlantId ?? plants[0]?.id ?? "", meta));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantGps, setWantGps] = useState(false);
  const geo = useGeolocation({ auto: false });

  useEffect(() => {
    if (open) {
      setF(fromEquipment(equipment, defaultPlantId ?? plants[0]?.id ?? "", meta));
      setError(null);
      setWantGps(false);
    }
  }, [open, equipment, defaultPlantId, plants, meta]);

  useEffect(() => {
    if (wantGps && geo.coords) {
      setF((p) => ({ ...p, latitude: geo.coords!.lat.toFixed(6), longitude: geo.coords!.lng.toFixed(6) }));
    }
  }, [wantGps, geo.coords]);

  const set = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const types = meta?.equipmentTypes ?? [f.type];

  async function save() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      type: f.type, location: f.location.trim(), buildingId: txt(f.buildingId), make: txt(f.make), model: txt(f.model),
      serialNo: txt(f.serialNo), capacitySpec: txt(f.capacitySpec),
      inspectionFrequencyDays: num(f.inspectionFrequencyDays), floorLevel: num(f.floorLevel),
      maintenanceContractor: txt(f.maintenanceContractor),
      installationDate: f.installationDate ? new Date(f.installationDate).toISOString() : null,
      latitude: num(f.latitude), longitude: num(f.longitude),
    };
    try {
      let saved: FireEquipment;
      if (equipment) {
        saved = await fireFetch<FireEquipment>(`/api/fire/equipment/${equipment.id}`, { method: "PATCH", json: body });
        toast({ title: `${saved.equipmentCode} updated`, variant: "success" });
      } else {
        saved = await fireFetch<FireEquipment>("/api/fire/equipment", {
          method: "POST",
          json: {
            ...body, plantId: f.plantId,
            lastInspectionDate: f.lastInspectionDate ? new Date(f.lastInspectionDate).toISOString() : null,
          },
        });
        toast({ title: `${saved.equipmentCode} registered`, variant: "success" });
      }
      onOpenChange(false);
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipment ? `Edit ${equipment.equipmentCode}` : "Register fire equipment"}</DialogTitle>
          <DialogDescription>
            {equipment
              ? "Changing the inspection interval re-dates the next inspection from the last one."
              : "The equipment code is assigned on save; print its QR label from the QR Labels page."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!equipment && (
            <Field label="Plant" required>
              <PlantSelect plants={plants} value={f.plantId} onChange={set("plantId")} allowAll={false} className="w-full" />
            </Field>
          )}
          <Field label="Equipment type" required>
            <Select
              value={f.type}
              onValueChange={(v) => setF((p) => ({
                ...p, type: v,
                inspectionFrequencyDays: equipment ? p.inspectionFrequencyDays : String(meta?.defaultFrequencyDays[v] ?? p.inspectionFrequencyDays),
              }))}
              className="w-full"
            >
              {types.map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Location" required hint="Where an inspector will find it, e.g. 'CRM-2, bay 4, column C7'">
            <Input value={f.location} onChange={(e) => set("location")(e.target.value)} />
          </Field>
          <Field label="Building / area"><Input value={f.buildingId} onChange={(e) => set("buildingId")(e.target.value)} /></Field>
          <Field label="Capacity / spec" hint="e.g. 9 kg ABC, 4.5 kg CO2, 63 mm landing valve">
            <Input value={f.capacitySpec} onChange={(e) => set("capacitySpec")(e.target.value)} />
          </Field>
          <Field label="Inspection interval (days)" required>
            <Input type="number" min={1} max={730} value={f.inspectionFrequencyDays} onChange={(e) => set("inspectionFrequencyDays")(e.target.value)} />
          </Field>
          <Field label="Make"><Input value={f.make} onChange={(e) => set("make")(e.target.value)} /></Field>
          <Field label="Model"><Input value={f.model} onChange={(e) => set("model")(e.target.value)} /></Field>
          <Field label="Serial no."><Input value={f.serialNo} onChange={(e) => set("serialNo")(e.target.value)} /></Field>
          <Field label="Floor level"><Input type="number" value={f.floorLevel} onChange={(e) => set("floorLevel")(e.target.value)} /></Field>
          <Field label="Maintenance contractor"><Input value={f.maintenanceContractor} onChange={(e) => set("maintenanceContractor")(e.target.value)} /></Field>
          <Field label="Installation date"><Input type="date" value={f.installationDate} onChange={(e) => set("installationDate")(e.target.value)} /></Field>
          {!equipment && (
            <Field label="Last inspected on" hint="For assets already on a paper register; sets the first due date.">
              <Input type="date" value={f.lastInspectionDate} onChange={(e) => set("lastInspectionDate")(e.target.value)} />
            </Field>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude"><Input type="number" step="any" value={f.latitude} onChange={(e) => set("latitude")(e.target.value)} /></Field>
              <Field label="Longitude"><Input type="number" step="any" value={f.longitude} onChange={(e) => set("longitude")(e.target.value)} /></Field>
            </div>
            {wantGps ? (
              <GpsCaptureStatus status={geo.status} coords={geo.coords} error={geo.error} onRetry={geo.request} />
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setWantGps(true); geo.request(); }}>
                <MapPin size={14} /> Use my current location
              </Button>
            )}
          </div>
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || f.location.trim().length < 2 || !f.type || (!equipment && !f.plantId)}>
            {busy ? "Saving…" : equipment ? "Save changes" : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
