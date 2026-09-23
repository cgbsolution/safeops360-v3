"use client";

// "Has this already been solved somewhere else?"
//
// Fires while the title is being typed, against the trigram search across every
// plant the user may read. The point is not to block a duplicate — two plants
// hitting the same problem independently is useful information, and a hard block
// on a fuzzy match would be maddening. The point is that the person raising the
// idea gets to READ what somebody else already did about it before writing
// their own version of it from scratch.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lightbulb, Loader2 } from "lucide-react";
import { KAIZEN_STATUS_LABEL } from "../../_meta";
import type { KaizenSearchHit } from "../../_meta";
import { Button } from "@/components/ui/button";

// Below three characters every idea matches every other idea. Above it the
// trigram floor does the work.
const MIN_QUERY = 4;
const DEBOUNCE_MS = 400;

export function SimilarIdeas({ query, excludeId }: { query: string; excludeId?: string }) {
  const [hits, setHits] = useState<KaizenSearchHit[]>([]);
  const [plantsSearched, setPlantsSearched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_QUERY) {
      setHits([]);
      return;
    }
    // A monotonic sequence number, not an AbortController alone: two in-flight
    // requests can resolve out of order and paint results for a title the user
    // has already typed past. Only the newest response is allowed to win.
    const mine = ++seq.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: text, limit: "5" });
        if (excludeId) params.set("excludeId", excludeId);
        const res = await fetch(`/api/be/kaizen/search?${params}`, {
          signal: controller.signal
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mine !== seq.current) return;
        setHits(data.items ?? []);
        setPlantsSearched(data.plantsSearched ?? 0);
      } catch {
        // A failed duplicate check must never stop somebody raising an idea.
        // Silence is the correct behaviour: this is an assist, not a gate.
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, excludeId]);

  if (dismissed || (!loading && hits.length === 0)) return null;

  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
          {loading && hits.length === 0
            ? "Checking whether this has come up before…"
            : `Similar ideas already raised (${hits.length})`}
        </div>
        {hits.length > 0 && (
          <Button variant="bare"
            type="button"
            onClick={() => setDismissed(true)}
            className="text-[11px] text-sky-700 underline underline-offset-2 hover:text-sky-900"
          >
            Not the same — dismiss
          </Button>
        )}
      </div>

      {hits.length > 0 && (
        <>
          <ul className="mt-2 space-y-1.5">
            {hits.map((h) => (
              <li key={h.id} className="text-sm">
                <Link
                  href={`/business-excellence/kaizen/${h.id}`}
                  target="_blank"
                  className="font-medium text-sky-900 underline-offset-2 hover:underline"
                >
                  {h.title}
                </Link>
                <div className="text-[11px] text-sky-800/80">
                  {[h.kaizenNo, h.siteName, KAIZEN_STATUS_LABEL[h.status] ?? h.status]
                    .filter(Boolean)
                    .join(" · ")}
                  {/* The score is shown because "82% match" and "31% match" are
                      very different pieces of advice, and a list that presents
                      both with equal weight trains people to ignore it. */}
                  <span className="ml-1 opacity-70">
                    {Math.round(h.similarity * 100)}% match
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-sky-800/70">
            Searched {plantsSearched} plant{plantsSearched === 1 ? "" : "s"} you can
            see. Raising it anyway is fine — read theirs first and you may save
            yourself the trial and error.
          </p>
        </>
      )}
    </div>
  );
}
