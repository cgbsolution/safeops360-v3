// Participation — how many people are actually contributing.
//
// A Kaizen programme's real failure mode is not "too few ideas", it is "the same
// three people every month". Idea count hides that; submitter count does not.
//
// Server component: it reads the backend's participation endpoint, which owns
// the headcount resolution and the null-not-zero rule.

import Link from "next/link";
import { Users, TrendingUp, Info } from "lucide-react";
import { backendFetch } from "@/lib/backend/fetch";
import { LoadError, PersonRef, StatBox } from "../ui";
import { fmtMoney, type KaizenParticipation } from "../_meta";

export async function ParticipationPanel({
  plantId,
  raisedFrom,
  raisedTo,
}: {
  plantId: string | null;
  raisedFrom?: string;
  raisedTo?: string;
}) {
  let data: KaizenParticipation | null = null;
  let loadError: string | null = null;
  try {
    data = await backendFetch<KaizenParticipation>("/api/be/kaizen/participation", {
      query: {
        plantId: plantId ?? undefined,
        raisedFrom: raisedFrom || undefined,
        raisedTo: raisedTo || undefined,
      },
    });
  } catch (e: any) {
    loadError = e?.message ?? "Could not load participation figures.";
  }

  if (loadError) return <LoadError what="Participation" message={loadError} />;
  if (!data) return null;

  const noHeadcount = data.headcount == null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatBox label="People contributing" value={data.submitters} icon={Users} />
        <StatBox
          label="Share of the workforce"
          // Null, not 0. "We do not know the headcount" and "nobody
          // participated" are different facts, and rendering the first as the
          // second reports a working programme as a dead one.
          value={data.participationRate != null ? `${data.participationRate}%` : "Not recorded"}
          tone={data.participationRate != null ? "success" : undefined}
          icon={TrendingUp}
          hint={
            noHeadcount
              ? "This plant has no recorded headcount"
              : `${data.submitters} of ${data.headcount?.toLocaleString()} people`
          }
        />
        <StatBox label="Ideas raised" value={data.ideas} />
        <StatBox
          label="Ideas per contributor"
          value={data.ideasPerSubmitter != null ? data.ideasPerSubmitter.toFixed(1) : "—"}
          hint="High with few contributors means a programme carried by a handful of people"
        />
      </div>

      {noHeadcount && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">
            {plantId
              ? "This plant has no recorded headcount, so the participation rate cannot be computed."
              : "Pick a single plant to see a participation rate."}
          </div>
          <p className="mt-1 text-amber-800">
            {plantId ? (
              <>
                The figure comes from the factory profile&apos;s total employees.
                Record it on the{" "}
                <Link
                  href="/facilities"
                  className="font-medium underline underline-offset-2"
                >
                  factory profile
                </Link>{" "}
                and the rate appears here. A denominator guessed from platform
                logins would read roughly fifteen times too high, so nothing is
                shown instead.
              </>
            ) : (
              <>
                Headcount is a per-plant figure. Summing profiles across several
                plants — some of which have no profile at all — would give a
                number that is not any plant&apos;s rate and not the group&apos;s
                either.
              </>
            )}
          </p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Who is contributing</h3>
        {data.topContributors.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nobody has submitted an idea in this period.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.topContributors.map((c, i) => (
              <li
                key={c.user?.id ?? i}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
                <PersonRef person={c.user} />
                <div className="flex items-center gap-4 text-right">
                  <span className="tabular-nums text-slate-700">
                    {c.ideas} idea{c.ideas === 1 ? "" : "s"}
                  </span>
                  <span className="w-28 tabular-nums text-emerald-700">
                    {c.verifiedSaving != null ? fmtMoney(c.verifiedSaving, "INR") : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.recognitionNote && (
          // Stated plainly rather than left for somebody to assume. The obvious
          // reading of a contributor table is "these people get points", and on
          // this platform they do not — Recognition does not know Kaizen exists.
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
            <Info size={12} className="mt-0.5 shrink-0" />
            {data.recognitionNote}
          </p>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        Headcount source: {data.headcountSource}. Drafts are excluded — an idea
        nobody has submitted is not yet a contribution.
      </p>
    </div>
  );
}
