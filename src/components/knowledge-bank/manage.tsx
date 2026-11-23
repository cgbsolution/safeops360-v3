"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { categoryOptions, fmtDate, kbFetch, qs, type KbCategory, type KbDocument, type KbMeta } from "@/lib/knowledge-bank/api";
import { DocFormDialog } from "./doc-form";
import { DocRow, EmptyState, ErrorBox, Field, StatusBadge } from "./shared";

type Queue = { awaitingApproval: KbDocument[]; inDraft: KbDocument[] };
type ReviewDue = { items: KbDocument[]; total: number; overdue: number };

const WINDOWS = [
  { v: "0", l: "Overdue only" },
  { v: "30", l: "Due within 30 days" },
  { v: "90", l: "Due within 90 days" },
];

export function KbManage({ meta }: { meta: KbMeta }) {
  const router = useRouter();
  const { toast } = useToast();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [due, setDue] = useState<ReviewDue | null>(null);
  const [days, setDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [q, r] = await Promise.all([
        kbFetch<Queue>("/api/kb/manage/queue"),
        kbFetch<ReviewDue>(`/api/kb/review-due${qs({ days })}`),
      ]);
      setQueue(q);
      setDue(r);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the work queue");
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = meta.caps.manage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-slate-600">
          {meta.caps.manageAllPlants ? "You manage company-wide and every plant's documents." : "You manage your plant's documents. Company-wide documents are maintained by corporate HSE."}
          {meta.caps.approve ? " You can publish versions under review." : ""}
        </p>
        {canCreate && <Button onClick={() => setNewOpen(true)}><Plus size={16} /> New document</Button>}
      </div>
      <ErrorBox error={error} />

      <Tabs defaultValue="approval">
        <TabsList>
          <TabsTrigger value="approval">Awaiting approval {queue ? `(${queue.awaitingApproval.length})` : ""}</TabsTrigger>
          <TabsTrigger value="draft">In draft {queue ? `(${queue.inDraft.length})` : ""}</TabsTrigger>
          <TabsTrigger value="review">Review due {due ? `(${due.total})` : ""}</TabsTrigger>
          {meta.caps.manageAllPlants && <TabsTrigger value="categories">Categories</TabsTrigger>}
        </TabsList>

        <TabsContent value="approval">
          <Card>
            <CardContent className="p-0">
              {queue?.awaitingApproval.map((d) => (
                <DocRow key={d.id} doc={d} showStatus right={<OpenButton id={d.id} label={meta.caps.approve ? "Review" : "Open"} />} />
              ))}
              {queue && queue.awaitingApproval.length === 0 && <EmptyState text="Nothing is waiting for approval." />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="draft">
          <Card>
            <CardContent className="p-0">
              {queue?.inDraft.map((d) => <DocRow key={d.id} doc={d} showStatus right={<OpenButton id={d.id} label="Continue" />} />)}
              {queue && queue.inDraft.length === 0 && <EmptyState text="No drafts in progress." />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Periodic review {due ? `· ${due.overdue} overdue` : ""}</CardTitle>
              <Select value={days} onValueChange={setDays} className="h-9 w-48" aria-label="Window">
                {WINDOWS.map((w) => (
                  <SelectItem key={w.v} value={w.v}>{w.l}</SelectItem>
                ))}
              </Select>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table className="text-sm">
                  <TableHeader className="bg-slate-50">
                    <TableRow><TableHead>Document</TableHead><TableHead>Applies to</TableHead><TableHead>Owner</TableHead><TableHead>Review due</TableHead><TableHead /><TableHead /></TableRow>
                  </TableHeader>
                  <TableBody>
                    {due?.items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="font-mono text-[11px] text-slate-500">{d.docNo}</div>
                          <div>{d.title}</div>
                        </TableCell>
                        <TableCell className="text-xs">{d.companyWide ? "Company-wide" : d.plantName}</TableCell>
                        <TableCell className="text-xs">{d.ownerName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDate(d.reviewDueDate)}</TableCell>
                        <TableCell>{d.reviewState && <StatusBadge status={d.reviewState} />}</TableCell>
                        <TableCell className="text-right"><OpenButton id={d.id} label="Open" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {due && due.items.length === 0 && <EmptyState text="No document is due for review in this window." />}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Open a document to upload a revised version, or to mark it reviewed if it is still valid.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {meta.caps.manageAllPlants && (
          <TabsContent value="categories">
            <CategoryAdmin initial={meta.categories} onChanged={() => toast({ title: "Categories updated", variant: "success" })} />
          </TabsContent>
        )}
      </Tabs>

      <DocFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        meta={meta}
        onSaved={(d) => {
          toast({ title: `${d.docNo} created as a draft`, variant: "success" });
          router.push(`/knowledge-bank/${d.id}`);
        }}
      />
    </div>
  );
}

function OpenButton({ id, label }: { id: string; label: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/knowledge-bank/${id}`}>{label}</Link>
    </Button>
  );
}

const ROOT = "";

function CategoryAdmin({ initial, onChanged }: { initial: KbCategory[]; onChanged: () => void }) {
  const [cats, setCats] = useState<KbCategory[]>(initial);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(ROOT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await kbFetch<{ items: KbCategory[] }>("/api/kb/categories");
    setCats(r.items);
  }, []);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const options = useMemo(() => categoryOptions(cats), [cats]);
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="grid gap-2 md:grid-cols-[1fr_260px_auto] md:items-end">
          <Field label="New category"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gas Safety" /></Field>
          <Field label="Under">
            <Select value={parent} onValueChange={setParent}>
              <SelectItem value={ROOT}>Top level</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </Select>
          </Field>
          <Button disabled={busy || name.trim().length < 2} onClick={() => run(async () => {
            await kbFetch("/api/kb/categories", { method: "POST", json: { name: name.trim(), parentId: parent || null } });
            setName("");
          })}>Add</Button>
        </div>
        <ErrorBox error={error} />
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table className="text-sm">
            <TableHeader className="bg-slate-50">
              <TableRow><TableHead>Category</TableHead><TableHead>Published documents</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {options.map((o) => {
                const c = byId.get(o.id)!;
                return (
                  <TableRow key={c.id}>
                    <TableCell>{o.label}</TableCell>
                    <TableCell className="tabular-nums">{c.documentCount ?? 0}</TableCell>
                    <TableCell className="text-xs">{c.isActive ? "Active" : "Hidden"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => kbFetch(`/api/kb/categories/${c.id}`, { method: "PATCH", json: { isActive: !c.isActive } }))}>
                        {c.isActive ? "Hide" : "Show"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-slate-500">A hidden category keeps its documents; it is no longer offered for new documents or shown on the browse page.</p>
      </CardContent>
    </Card>
  );
}
