"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FlaskConical, Info, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { psFetch, qs, type AdvisorAnswer, type Chemical, type ChemicalList, type PlantOption } from "@/lib/pssr-psi/api";
import { CompatMatrixView } from "./compat-matrix";
import { ALL_PLANTS, ErrorBox, PlantSelect, plantParam, Tag } from "./shared";

type Turn = { id: string; question: string; answer?: AdvisorAnswer; error?: string };

const SUGGESTIONS = [
  "Can these be stored together?",
  "What PPE is needed to handle these?",
  "What is the spill response?",
  "Which fire-fighting media should be used?",
  "First aid for skin or eye contact?",
  "What are the exposure limits?",
];

export function ChemAdvisor({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [chems, setChems] = useState<Chemical[]>([]);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    psFetch<ChemicalList>(`/api/psi/chemicals${qs({ plantId: plantParam(plant) })}`)
      .then((r) => { setChems(r.items); setError(null); })
      .catch((e) => setError(e?.message ?? "Could not load the chemical register"));
    setPicked([]);
  }, [plant]);

  useEffect(() => {
    psFetch<{ aiAvailable: boolean }>("/api/psi/advisor/status").then((r) => setAiAvailable(r.aiAvailable)).catch(() => setAiAvailable(null));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? chems.filter((c) => c.chemicalName.toLowerCase().includes(f) || (c.casNumber ?? "").includes(f)) : chems;
  }, [chems, filter]);

  async function ask(text?: string) {
    const qText = (text ?? question).trim();
    if (qText.length < 3 || busy) return;
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id, question: qText }]);
    setQuestion("");
    setBusy(true);
    try {
      const a = await psFetch<AdvisorAnswer>("/api/psi/advisor/ask", {
        method: "POST",
        json: { question: qText, plantId: plantParam(plant) ?? null, chemicalIds: picked },
      });
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer: a } : x)));
    } catch (e: any) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: e?.message ?? "The advisor could not answer" } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FlaskConical size={16} /> Chemicals</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <PlantSelect plants={plants} value={plant} onChange={setPlant} className="w-full" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or CAS" className="h-9" />
          <p className="text-[11px] text-slate-500">Tick the chemicals your question is about, or just name them in the question.</p>
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {visible.map((c) => (
              <Label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm font-normal hover:bg-slate-50">
                <Checkbox className="mt-0.5" checked={picked.includes(c.id)}
                  onCheckedChange={(v) => setPicked((p) => (v === true ? (p.length >= 8 ? p : [...p, c.id]) : p.filter((x) => x !== c.id)))} />
                <span>
                  {c.chemicalName}
                  <span className="block text-[11px] text-slate-500">{c.storage ?? "Storage not recorded"}</span>
                </span>
              </Label>
            ))}
            {visible.length === 0 && <p className="text-xs text-slate-400">No chemicals in the register for this plant.</p>}
          </div>
          {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear selection ({picked.length})</Button>}
        </CardContent>
      </Card>

      <div className="flex min-h-[560px] flex-col rounded-xl border border-slate-200 bg-white">
        {aiAvailable === false && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <Info size={14} /> The AI advisor is not available on this server. Answers come straight from the chemical register and the compatibility rules.
          </div>
        )}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              Ask about storage, segregation, PPE, first aid, spill response, fire-fighting media, exposure limits or compatibility of chemicals held at the plant.
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="outline" onClick={() => setQuestion(s)}>{s}</Button>)}
              </div>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="flex max-w-[80%] items-start gap-2 rounded-xl bg-primary-700 px-3 py-2 text-sm text-white">
                  <span className="whitespace-pre-line">{t.question}</span><User size={14} className="mt-0.5 shrink-0 opacity-80" />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Bot size={18} className="mt-1 shrink-0 text-slate-500" />
                <div className="max-w-[92%] flex-1 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {!t.answer && !t.error && <span className="text-slate-500">Checking the register…</span>}
                  {t.error && <span className="text-rose-700">{t.error}</span>}
                  {t.answer && <AnswerBlock a={t.answer} onFollowUp={(f) => ask(f)} />}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <ErrorBox error={error} />
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-end gap-2">
            <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Can nitric acid and HF be stored in the same bund at CAPL-2?"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} className="flex-1" />
            <Button onClick={() => ask()} disabled={busy || question.trim().length < 3}><Send size={14} className="mr-1" /> Ask</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnswerBlock({ a, onFollowUp }: { a: AdvisorAnswer; onFollowUp: (q: string) => void }) {
  return (
    <>
      <div className="whitespace-pre-line text-slate-900">{a.answer}</div>
      {a.generalGuidance && (
        <div className="text-[11px] text-amber-800">Parts of this answer are general guidance, not taken from the plant register.</div>
      )}
      {a.compatibility && a.compatibility.chemicals.length > 1 && (
        <div className="pt-1">
          <div className="mb-1 text-xs font-semibold text-slate-700">Compatibility (rule tables): <Tag code={a.compatibility.worst ?? "COMPATIBLE"} /></div>
          <CompatMatrixView m={a.compatibility} compact />
        </div>
      )}
      {a.citations.length > 0 && (
        <div className="pt-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Register records used</div>
          <div className="flex flex-wrap gap-1.5">
            {a.citations.map((c) => (
              <span key={c.id} className={cn("rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700")}>
                {c.chemicalName}{c.casNumber ? ` (CAS ${c.casNumber})` : ""}{c.storage ? ` · ${c.storage}` : ""}
                {c.sds ? ` · SDS ${c.sds.docNo} rev ${c.sds.revision}` : " · no SDS on file"}
              </span>
            ))}
          </div>
        </div>
      )}
      {a.followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {a.followUps.map((f) => <Button key={f} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onFollowUp(f)}>{f}</Button>)}
        </div>
      )}
      <div className="border-t border-slate-200 pt-1 text-[11px] text-slate-500">{a.disclaimer}</div>
    </>
  );
}
