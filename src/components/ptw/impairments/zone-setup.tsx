"use client";

// Zone setup: the plant layout (image + real-world size, which scales SIMOPS
// distance), each zone's polygon (click on the layout to add corners), and the
// zone guidance shown on the Control Center. Polygons are stored in % of the
// layout image, 0–100.

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/client-errors";
import { PERMIT_TYPES, type ZoneGuidance } from "@/lib/ptw/ops";

type Pt = { x: number; y: number };
type Layout = {
  plantId: string;
  imageUrl: string | null;
  widthM: number | null;
  heightM: number | null;
  ready: boolean;
  canEdit: boolean;
  zones: { id: string; name: string; polygon: Pt[]; sortOrder: number | null }[];
};
type TypeRule = { permitType: string; state: "allowed" | "conditional" | "blocked"; conditionText: string };

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(await readApiError(res, "Request failed"));
  return res.status === 204 ? null : res.json();
}

export function ZoneSetup({ plantId }: { plantId: string | null }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [sortOrder, setSortOrder] = useState<string>("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!plantId) return;
    try {
      const l: Layout = await call(`/api/ptw/layout?plant=${plantId}`);
      setLayout(l);
      setW(l.widthM ? String(l.widthM) : "");
      setH(l.heightM ? String(l.heightM) : "");
      setZoneId((z) => (z && l.zones.some((x) => x.id === z) ? z : l.zones[0]?.id ?? ""));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  }, [plantId]);
  useEffect(() => { load(); }, [load]);

  const zone = layout?.zones.find((z) => z.id === zoneId) ?? null;
  useEffect(() => {
    setDraft(zone?.polygon ?? []);
    setSortOrder(zone?.sortOrder != null ? String(zone.sortOrder) : "");
  }, [zone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function addPoint(e: React.MouseEvent<HTMLDivElement>) {
    if (!layout?.canEdit || !canvas.current) return;
    const r = canvas.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    setDraft((d) => [...d, { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) }]);
  }

  async function saveGeometry() {
    if (!zone) return;
    try {
      await call(`/api/ptw/zones/${zone.id}/geometry`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ polygon: draft, sortOrder: sortOrder === "" ? null : Number(sortOrder) }),
      });
      setMsg({ ok: true, text: `${zone.name} saved.` });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  }

  async function saveScale() {
    try {
      await call(`/api/ptw/layout?plant=${plantId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ widthM: w ? Number(w) : null, heightM: h ? Number(h) : null }),
      });
      setMsg({ ok: true, text: "Layout scale saved — SIMOPS distances now use it." });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await call(`/api/ptw/layout/image?plant=${plantId}`, { method: "POST", body: fd });
      setMsg({ ok: true, text: "Layout image uploaded." });
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    }
  }

  if (!plantId) return <p className="text-sm text-slate-500">Choose a plant.</p>;
  if (layout && !layout.ready) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Zone setup needs the Control Center tables. An administrator runs <code>npx tsx prisma/apply-ptw-control-center-ddl.ts</code> once.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </p>
      )}
      <Card>
        <CardHeader><CardTitle>Plant layout</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="lay-w">Image width (m)</Label>
              <Input id="lay-w" type="number" min={1} value={w} onChange={(e) => setW(e.target.value)} disabled={!layout?.canEdit} />
            </div>
            <div>
              <Label htmlFor="lay-h">Image height (m)</Label>
              <Input id="lay-h" type="number" min={1} value={h} onChange={(e) => setH(e.target.value)} disabled={!layout?.canEdit} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={saveScale} disabled={!layout?.canEdit}>Save scale</Button>
            </div>
            <div>
              <Label htmlFor="lay-img">Layout image (PNG / JPEG / SVG, ≤ 8 MB)</Label>
              <Input id="lay-img" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!layout?.canEdit}
                     onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The real-world size of the image turns polygon positions into metres for the SIMOPS distance check. Without it, only same-zone SIMOPS rules apply.
          </p>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div>
              <div
                ref={canvas}
                onClick={addPoint}
                role="presentation"
                className={`relative w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-800 ${layout?.canEdit ? "cursor-crosshair" : ""}`}
                style={{ aspectRatio: "2 / 1" }}
              >
                {layout?.imageUrl && (
                  <Image src={layout.imageUrl} alt="Plant layout" fill unoptimized className="object-fill opacity-70" />
                )}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  {layout?.zones.filter((z) => z.id !== zoneId && z.polygon.length >= 3).map((z) => (
                    <polygon key={z.id} points={z.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(96,165,250,0.15)" stroke="#60A5FA" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  ))}
                  {draft.length > 0 && (
                    <polygon points={draft.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(212,168,75,0.25)" stroke="#D4A84B" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
                {draft.map((p, i) => (
                  <span key={i} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-amber-500" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Click on the layout to add the selected zone&apos;s corners in order. Other zones are shown in blue.</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="zone-pick">Zone</Label>
                <Select id="zone-pick" value={zoneId} onValueChange={setZoneId}>
                  {(layout?.zones ?? []).map((z) => <SelectItem key={z.id} value={z.id}>{z.name}{z.polygon.length ? "" : " (not drawn)"}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="zone-order">Display order</Label>
                <Input id="zone-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={!layout?.canEdit} />
              </div>
              <p className="text-sm text-slate-600">{draft.length} corner{draft.length === 1 ? "" : "s"}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length || !layout?.canEdit}><Undo2 size={14} /> Undo</Button>
                <Button variant="outline" size="sm" onClick={() => setDraft([])} disabled={!draft.length || !layout?.canEdit}><Trash2 size={14} /> Clear</Button>
                <Button size="sm" onClick={saveGeometry} disabled={!layout?.canEdit || (draft.length > 0 && draft.length < 3)}>Save zone</Button>
              </div>
              {!layout?.canEdit && <p className="text-xs text-slate-500">Editing the layout needs the zone-management permission.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {zone && <GuidanceEditor areaId={zone.id} areaName={zone.name} onSaved={(t) => setMsg({ ok: true, text: t })} onError={(t) => setMsg({ ok: false, text: t })} />}
    </div>
  );
}

function GuidanceEditor({ areaId, areaName, onSaved, onError }: { areaId: string; areaName: string; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [g, setG] = useState<ZoneGuidance | null>(null);
  const [restricted, setRestricted] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ppe, setPpe] = useState("");
  const [assembly, setAssembly] = useState("");
  const [ext, setExt] = useState("");
  const [rules, setRules] = useState<TypeRule[]>([]);

  useEffect(() => {
    call(`/api/ptw/zones/${areaId}/guidance`)
      .then((x: ZoneGuidance) => {
        setG(x);
        setRestricted(x.restrictedHours ?? "");
        setInstructions(x.instructions.join("\n"));
        setPpe(x.mandatoryPpe.join("\n"));
        setAssembly(x.assemblyPoint ?? "");
        setExt(x.extinguisherLocations ?? "");
        // Only the zone's own standing rules are editable; live impairment overlays are not saved.
        setRules(x.permitTypeRules.filter((r) => !r.live).map((r) => ({ permitType: r.permitType, state: r.state, conditionText: r.conditionText ?? "" })));
      })
      .catch((e) => onError(e.message));
  }, [areaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    try {
      await call(`/api/ptw/zones/${areaId}/guidance`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restrictedHours: restricted,
          instructions: instructions.split("\n"),
          mandatoryPpe: ppe.split("\n"),
          assemblyPoint: assembly,
          extinguisherLocations: ext,
          permitTypeRules: rules.filter((r) => r.permitType),
        }),
      });
      onSaved(`Guidance for ${areaName} saved.`);
    } catch (e: any) {
      onError(e.message);
    }
  }

  const editable = !!g?.canEdit;
  return (
    <Card>
      <CardHeader><CardTitle>Zone guidance · {areaName}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!editable && g && <p className="text-xs text-slate-500">Only the area owner{g.areaOwner ? ` (${g.areaOwner})` : ""} or an EHS admin can edit this guidance.</p>}
        <div>
          <Label>Permit types in this zone</Label>
          <div className="mt-1 space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[200px_160px_1fr_auto]">
                <Select aria-label="Permit type" value={r.permitType} disabled={!editable}
                        onValueChange={(v) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, permitType: v } : x)))}>
                  {Object.entries(PERMIT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </Select>
                <Select aria-label="State" value={r.state} disabled={!editable}
                        onValueChange={(v) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, state: v as TypeRule["state"] } : x)))}>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </Select>
                <Input aria-label="Condition" placeholder="Condition (e.g. spotter required)" value={r.conditionText} disabled={!editable}
                       onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, conditionText: e.target.value } : x)))} />
                <Button variant="ghost" size="sm" aria-label="Remove rule" disabled={!editable} onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={!editable || rules.length >= 10}
                    onClick={() => setRules((rs) => [...rs, { permitType: "HOT_WORK", state: "conditional", conditionText: "" }])}>
              <Plus size={14} /> Add permit type
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label htmlFor="g-restr">Restricted hours</Label><Input id="g-restr" value={restricted} onChange={(e) => setRestricted(e.target.value)} disabled={!editable} /></div>
          <div><Label htmlFor="g-asm">Assembly point</Label><Input id="g-asm" value={assembly} onChange={(e) => setAssembly(e.target.value)} disabled={!editable} /></div>
          <div><Label htmlFor="g-ins">Standing instructions (one per line)</Label><Textarea id="g-ins" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={!editable} /></div>
          <div><Label htmlFor="g-ppe">Mandatory PPE (one per line)</Label><Textarea id="g-ppe" rows={4} value={ppe} onChange={(e) => setPpe(e.target.value)} disabled={!editable} /></div>
          <div className="md:col-span-2"><Label htmlFor="g-ext">Extinguisher locations</Label><Input id="g-ext" value={ext} onChange={(e) => setExt(e.target.value)} disabled={!editable} /></div>
        </div>
        <Button onClick={save} disabled={!editable}>Save guidance</Button>
      </CardContent>
    </Card>
  );
}
