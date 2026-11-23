"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, ClipboardList, FileSpreadsheet, FolderOpen, GraduationCap, Landmark, Lightbulb, ListChecks, ListOrdered,
  Scale, Search, ShieldCheck, Siren, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import {
  categoryOptions, kbFetch, label, qs,
  type KbCategory, type KbDocument, type KbHome as HomeData, type KbMeta, type KbSearchResult,
} from "@/lib/knowledge-bank/api";
import { DocRow, EmptyState, ErrorBox } from "./shared";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "shield-check": ShieldCheck, landmark: Landmark, "list-ordered": ListOrdered, "list-checks": ListChecks,
  "book-open": BookOpen, scale: Scale, siren: Siren, "graduation-cap": GraduationCap,
  "file-spreadsheet": FileSpreadsheet, lightbulb: Lightbulb,
};

const ANY = "";
const COMPANY = "COMPANY";
const PAGE = 25;

export type KbFilters = {
  q: string; categoryId: string; docType: string; standardRef: string; department: string; plant: string;
  includeObsolete: boolean; sort: string;
};

const EMPTY: KbFilters = { q: "", categoryId: ANY, docType: ANY, standardRef: "", department: ANY, plant: ANY, includeObsolete: false, sort: "relevance" };

export function KbHome({ meta, initial }: { meta: KbMeta; initial: Partial<KbFilters> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<KbFilters>({ ...EMPTY, ...initial });
  const [qInput, setQInput] = useState(f.q);
  const [home, setHome] = useState<HomeData | null>(null);
  const [cats, setCats] = useState<KbCategory[]>(meta.categories);
  const [res, setRes] = useState<KbSearchResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searching = !!(f.q || f.categoryId || f.docType || f.standardRef || f.department || f.plant || f.includeObsolete);

  useEffect(() => {
    kbFetch<HomeData>("/api/kb/home").then(setHome).catch(() => setHome(null));
    kbFetch<{ items: KbCategory[] }>("/api/kb/categories").then((r) => setCats(r.items.filter((c) => c.isActive))).catch(() => undefined);
  }, []);

  // Keep the URL in step so Back returns to the same results.
  useEffect(() => {
    const params = qs({
      q: f.q, categoryId: f.categoryId, docType: f.docType, standardRef: f.standardRef, department: f.department,
      plant: f.plant, includeObsolete: f.includeObsolete, sort: f.sort !== "relevance" ? f.sort : undefined,
    });
    router.replace(`${pathname}${params}`, { scroll: false });
  }, [f, pathname, router]);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await kbFetch<KbSearchResult>(`/api/kb/documents${qs({
        q: f.q, categoryId: f.categoryId, docType: f.docType, standardRef: f.standardRef, department: f.department,
        plant: f.plant, includeObsolete: f.includeObsolete, sort: f.q ? f.sort : f.sort === "relevance" ? "recent" : f.sort,
        limit: PAGE, offset: nextOffset,
      })}`);
      setRes((prev) => (nextOffset && prev ? { ...r, items: [...prev.items, ...r.items] } : r));
      setOffset(nextOffset);
    } catch (e: any) {
      setError(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }, [f]);

  useEffect(() => {
    if (searching) void load(0);
    else setRes(null);
  }, [searching, load]);

  const set = (patch: Partial<KbFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const catOptions = useMemo(() => categoryOptions(meta.categories), [meta.categories]);
  const topCats = cats.filter((c) => !c.parentId || !cats.some((x) => x.id === c.parentId));

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 md:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: qInput.trim() });
        }}
      >
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search standards, SOPs, checklists, policies… (title, number, tags or text inside the file)"
            className="h-11 pl-9"
            aria-label="Search the knowledge bank"
          />
        </div>
        <Button type="submit" className="h-11">Search</Button>
      </form>

      <div className="flex flex-wrap items-end gap-2">
        <Select value={f.categoryId} onValueChange={(v) => set({ categoryId: v })} className="h-9 w-56" aria-label="Category">
          <SelectItem value={ANY}>All categories</SelectItem>
          {catOptions.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
          ))}
        </Select>
        <Select value={f.docType} onValueChange={(v) => set({ docType: v })} className="h-9 w-48" aria-label="Document type">
          <SelectItem value={ANY}>All types</SelectItem>
          {meta.docTypes.map((t) => (
            <SelectItem key={t} value={t}>{label(t)}</SelectItem>
          ))}
        </Select>
        <Select value={f.department} onValueChange={(v) => set({ department: v })} className="h-9 w-44" aria-label="Department">
          <SelectItem value={ANY}>All departments</SelectItem>
          {meta.departments.map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </Select>
        <Select value={f.plant} onValueChange={(v) => set({ plant: v })} className="h-9 w-52" aria-label="Applies to">
          <SelectItem value={ANY}>Any plant / company-wide</SelectItem>
          <SelectItem value={COMPANY}>Company-wide only</SelectItem>
          {meta.plants.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name} (incl. company-wide)</SelectItem>
          ))}
        </Select>
        <Input
          value={f.standardRef}
          onChange={(e) => set({ standardRef: e.target.value })}
          placeholder="Standard, e.g. IS 3786"
          className="h-9 w-44"
          aria-label="Standard reference"
        />
        <Select value={f.sort} onValueChange={(v) => set({ sort: v })} className="h-9 w-40" aria-label="Sort">
          <SelectItem value="relevance">{f.q ? "Best match" : "Newest first"}</SelectItem>
          <SelectItem value="recent">Newest first</SelectItem>
          <SelectItem value="views">Most read</SelectItem>
          <SelectItem value="title">Title A–Z</SelectItem>
          <SelectItem value="docNo">Document no.</SelectItem>
        </Select>
        <Label className="flex h-9 items-center gap-2 text-xs text-slate-700">
          <Checkbox checked={f.includeObsolete} onCheckedChange={(v) => set({ includeObsolete: v === true })} />
          Include obsolete
        </Label>
        {searching && (
          <Button size="sm" variant="ghost" onClick={() => { setQInput(""); setF(EMPTY); }}>
            <X size={14} /> Clear
          </Button>
        )}
      </div>

      {home && home.myPendingAcks > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <ClipboardList size={18} />
          <span className="flex-1">You have {home.myPendingAcks} document{home.myPendingAcks === 1 ? "" : "s"} to read and acknowledge.</span>
          <Button asChild size="sm"><Link href="/knowledge-bank/my-acknowledgements">Open my list</Link></Button>
        </div>
      )}
      {home && (home.reviewDueCount ?? 0) + (home.awaitingReviewCount ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex-1">
            {home.awaitingReviewCount ?? 0} version(s) awaiting approval · {home.reviewDueCount ?? 0} document(s) due for periodic review in 30 days.
          </span>
          <Button asChild size="sm" variant="outline"><Link href="/knowledge-bank/manage">Manage</Link></Button>
        </div>
      )}
      <ErrorBox error={error} />

      {searching ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {res ? `${res.total} document${res.total === 1 ? "" : "s"}` : "Searching…"}
              {res?.matchMode === "keyword" && f.q && <span className="ml-2 text-[11px] font-normal text-slate-500">(partial-word match)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {res?.items.map((d) => <DocRow key={d.id} doc={d} />)}
            {res && res.items.length === 0 && <EmptyState text="Nothing matches. Try fewer words, another category, or include obsolete documents." />}
            {res && res.items.length < res.total && (
              <div className="p-3 text-center">
                <Button variant="outline" size="sm" disabled={loading} onClick={() => load(offset + PAGE)}>{loading ? "Loading…" : "Show more"}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {topCats.map((c) => {
              const Icon = ICONS[c.icon ?? ""] ?? FolderOpen;
              return (
                <Button
                  key={c.id}
                  variant="bare"
                  size="bare"
                  onClick={() => set({ categoryId: c.id })}
                  className="flex h-auto flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <Icon size={20} className="text-primary-700" />
                  <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                  <span className="text-[11px] text-slate-500">{c.documentCount ?? 0} document{c.documentCount === 1 ? "" : "s"}</span>
                </Button>
              );
            })}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DocList title="Recently published" docs={home?.recent} empty="Nothing published yet." />
            <DocList title="Most read" docs={home?.mostViewed} empty="No reads recorded yet." />
          </div>
          {home && <p className="text-xs text-slate-500">{home.publishedCount} published document{home.publishedCount === 1 ? "" : "s"} in the knowledge bank. Every published document is readable by everyone in the company.</p>}
        </>
      )}
    </div>
  );
}

function DocList({ title, docs, empty }: { title: string; docs: KbDocument[] | undefined; empty: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {!docs ? <div className="m-3 h-24 animate-pulse rounded bg-slate-100" /> : docs.length === 0 ? <EmptyState text={empty} /> : docs.map((d) => <DocRow key={d.id} doc={d} />)}
      </CardContent>
    </Card>
  );
}
