"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { BookOpenCheck, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions, kbFetch, type KbAnswer, type KbCitation, type KbMeta, type KbPassage } from "@/lib/knowledge-bank/api";
import { EmptyState, ErrorBox, Field } from "./shared";

const ANY = "";
const EXAMPLES = [
  "How long must the fire watcher stay after hot work?",
  "What PPE is required for work at height?",
  "Who can sign a confined space entry permit?",
  "What is the procedure after a molten metal splash?",
];

/** Render "text [P1] more [P2]" with the markers as small citation chips. */
function AnswerText({ text, citations }: { text: string; citations: KbCitation[] }) {
  const order = new Map(citations.map((c, i) => [c.ref, i + 1]));
  const parts = text.split(/(\[P\d+\])/g);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">
      {parts.map((part, i) => {
        const m = part.match(/^\[(P\d+)\]$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const n = order.get(m[1]);
        return n ? (
          <Button key={i} asChild variant="bare" size="bare" className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary-100 px-1 align-super text-[10px] font-semibold text-primary-800">
            <Link href={`#cite-${n}`} aria-label={`Source ${n}`}>{n}</Link>
          </Button>
        ) : null;
      })}
    </p>
  );
}

export function KbAsk({ meta, document }: { meta: KbMeta; document: { id: string; docNo: string; title: string } | null }) {
  const [question, setQuestion] = useState("");
  const [categoryId, setCategoryId] = useState(ANY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ans, setAns] = useState<KbAnswer | null>(null);

  async function ask(q?: string) {
    const text = (q ?? question).trim();
    if (text.length < 3) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    try {
      setAns(await kbFetch<KbAnswer>("/api/kb/ask", {
        method: "POST",
        json: { question: text, categoryId: categoryId || null, documentId: document?.id ?? null },
      }));
    } catch (e: any) {
      setError(e?.message ?? "Could not get an answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          {document && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
              Asking about <strong>{document.docNo}</strong> · {document.title} only.{" "}
              <Button asChild variant="link" className="h-auto p-0 text-xs"><Link href="/knowledge-bank/ask">Ask the whole bank instead</Link></Button>
            </div>
          )}
          <Field label="Your question">
            <Textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask();
              }}
              placeholder="Ask in plain words, e.g. What gas test is needed before entering a confined space?"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {!document && (
              <Select value={categoryId} onValueChange={setCategoryId} className="h-9 w-60" aria-label="Category">
                <SelectItem value={ANY}>Search all categories</SelectItem>
                {categoryOptions(meta.categories).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </Select>
            )}
            <Button disabled={busy || question.trim().length < 3} onClick={() => ask()}>
              <Sparkles size={15} /> {busy ? "Looking it up…" : "Ask"}
            </Button>
          </div>
          {!ans && !document && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((x) => (
                <Button key={x} size="sm" variant="secondary" className="h-7 text-xs" onClick={() => ask(x)} disabled={busy}>{x}</Button>
              ))}
            </div>
          )}
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info size={12} className="mt-0.5 shrink-0" />
            Answers are drawn only from published knowledge-bank documents, with the source of every point. Always read the cited document before acting on it.
          </p>
        </CardContent>
      </Card>
      <ErrorBox error={error} />
      {busy && <div className="h-32 animate-pulse rounded-xl bg-slate-100" />}
      {ans && !busy && <AnswerView ans={ans} />}
    </div>
  );
}

function AnswerView({ ans }: { ans: KbAnswer }) {
  if (ans.mode === "none") {
    return (
      <Card>
        <CardContent className="space-y-2 pt-4 text-sm text-slate-700">
          <div className="font-medium">{ans.answer}</div>
          <p className="text-xs text-slate-500">Try different words, or browse the categories. If a standard or procedure is missing, tell your HSE team so it can be added.</p>
        </CardContent>
      </Card>
    );
  }
  if (ans.mode === "passages") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{ans.message}</div>
        <Passages passages={ans.passages} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Card className={ans.covered ? "border-emerald-200" : "border-amber-200"}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpenCheck size={16} className={ans.covered ? "text-emerald-600" : "text-amber-600"} />
            {ans.covered ? "Answer from the knowledge bank" : "Not covered by the knowledge bank"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnswerText text={ans.answer ?? ""} citations={ans.citations} />
        </CardContent>
      </Card>
      {ans.citations.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sources</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ans.citations.map((c, i) => (
              <div key={`${c.ref}-${i}`} id={`cite-${i + 1}`} className="rounded-lg border border-slate-200 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border border-primary-200 bg-primary-50 text-[11px] text-primary-800">{i + 1}</Badge>
                  <Button asChild variant="link" className="h-auto p-0 text-sm font-medium">
                    <Link href={c.href}>{c.label} · {c.title}</Link>
                  </Button>
                </div>
                {c.quote && <blockquote className="mt-1 border-l-2 border-slate-300 pl-2 text-xs italic text-slate-700">“{c.quote}”</blockquote>}
                {!c.quoteVerified && <div className="mt-1 text-[11px] text-amber-700">Opening of the cited passage shown; check the wording in the document.</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Collapsible className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 text-xs">Passages searched ({ans.passages.length})</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2"><Passages passages={ans.passages} /></CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Passages({ passages }: { passages: KbPassage[] }) {
  if (!passages.length) return <EmptyState text="No matching passages." />;
  return (
    <div className="space-y-2">
      {passages.map((p) => (
        <Card key={p.ref}>
          <CardContent className="space-y-1 pt-3 text-sm">
            <Button asChild variant="link" className="h-auto p-0 text-sm font-medium">
              <Link href={p.href}>{p.docNo} v{p.versionNo}{p.page ? `, p. ${p.page}` : ""} · {p.title}</Link>
            </Button>
            <p className="line-clamp-6 whitespace-pre-line text-xs text-slate-700">{p.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
