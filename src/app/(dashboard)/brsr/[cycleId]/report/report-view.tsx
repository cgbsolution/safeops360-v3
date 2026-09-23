"use client";

import { useState } from "react";
import { FileDown, FileText, Printer, Lock, ShieldCheck, Info } from "lucide-react";
import { MX, PROVENANCE_CHIP, PROVENANCE_LABEL, fmtNum, type Provenance } from "../../lib-brsr";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

type Block = {
  code: string;
  label: string;
  groupLabel?: string | null;
  indicatorClass?: string | null;
  valueType: string;
  unit?: string | null;
  isMandatory: boolean;
  value: unknown;
  answered: boolean;
  provenance?: Provenance | null;
  notApplicableReason?: string | null;
  sourceModule?: string | null;
  derivationNote?: string | null;
  sourceRecordCount?: number | null;
  isVerified: boolean;
};

type PrincipleBlock = {
  principle: string;
  title: string;
  status: string;
  narrative?: string | null;
  completionPct: number;
  autoPopulatedPct: number;
  isPlatformSourced: boolean;
  essentialIndicators: Block[];
  leadershipIndicators: Block[];
};

export type BrsrReport = {
  meta: {
    financialYear: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    completionPct: number;
    autoPopulatedPct: number;
    generatedAt?: string;
    filingNote: string;
    frozen?: boolean;
    snapshotHash?: string | null;
  };
  entity: Record<string, unknown>;
  sectionA: Block[];
  sectionB: Block[];
  sectionC: PrincipleBlock[];
  environmentalSummary: Record<string, number | null>;
  approval: Record<string, unknown>;
};

function renderValue(b: Block): string {
  if (b.provenance === "NOT_APPLICABLE") return "Not applicable";
  if (b.value === null || b.value === undefined) return "—";
  if (typeof b.value === "number") return `${fmtNum(b.value)}${b.unit ? ` ${b.unit}` : ""}`;
  if (typeof b.value === "boolean") return b.value ? "Yes" : "No";
  if (Array.isArray(b.value)) return `${b.value.length} row(s)`;
  if (typeof b.value === "object") return "Entered";
  return String(b.value);
}

export function ReportView({ cycleId, report }: { cycleId: string; report: BrsrReport }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const frozen = !!report.meta.frozen;

  // Both downloads go through the catch-all proxy, which streams the body as an
  // arrayBuffer — a text() round-trip here would corrupt a binary PDF.
  async function download(path: string, filename: string, key: string) {
    setDownloading(key);
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const exportCsv = () =>
    download(
      `/api/brsr/cycles/${cycleId}/report/export.csv`,
      `BRSR_${report.meta.financialYear}.csv`,
      "csv"
    );

  const exportPdf = () =>
    download(
      `/api/brsr/cycles/${cycleId}/report.pdf`,
      `BRSR_${report.meta.financialYear}${frozen ? "" : "_DRAFT"}.pdf`,
      "pdf"
    );

  const IndicatorRows = ({ blocks }: { blocks: Block[] }) => (
    <Table className="w-full text-xs">
      <TableBody>
        {blocks.map((b) => (
          <TableRow key={b.code} className="border-b border-slate-50 last:border-0 align-top hover:bg-transparent">
            <TableCell className="align-top w-24 px-3 py-2 font-mono text-[10px] text-slate-400">{b.code}</TableCell>
            <TableCell className="align-top px-3 py-2 text-slate-700">
              {b.label}
              {b.derivationNote && (
                <div className="mt-0.5 flex items-start gap-1 text-[10px] text-slate-400">
                  <Info size={9} className="mt-0.5 shrink-0" />
                  <span>{b.derivationNote}</span>
                </div>
              )}
              {b.notApplicableReason && (
                <div className="mt-0.5 text-[10px] italic text-slate-500">
                  {b.notApplicableReason}
                </div>
              )}
            </TableCell>
            <TableCell className="align-top w-44 px-3 py-2">
              <span className="font-semibold tabular-nums" style={{ color: MX.navy }}>
                {renderValue(b)}
              </span>
            </TableCell>
            <TableCell className="align-top w-40 px-3 py-2">
              {b.provenance ? (
                <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${PROVENANCE_CHIP[b.provenance]}`}>
                  {PROVENANCE_LABEL[b.provenance]}
                  {b.sourceRecordCount ? ` · ${b.sourceRecordCount} rec` : ""}
                </span>
              ) : (
                <span className="text-[10px] text-slate-300">unanswered</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4" style={{ fontFamily: MX.body }}>
      {/* ── header ── */}
      <div className="rounded-xl border p-5 print:border-0" style={{ background: MX.navy, borderColor: MX.navy }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold" style={{ fontFamily: MX.display, color: "#fff" }}>
              Business Responsibility &amp; Sustainability Report
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: MX.goldSoft }}>
              {(report.entity.name as string) ?? "Listed entity"} · {report.meta.financialYear}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#9DB2D4" }}>
              {frozen ? (
                <>
                  <Lock size={11} />
                  Immutable filed snapshot
                  {report.meta.snapshotHash && ` · integrity ${report.meta.snapshotHash.slice(0, 16)}…`}
                </>
              ) : (
                <>
                  <ShieldCheck size={11} />
                  Live draft — assembled from current data. Freezes when the cycle is marked filed.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="bare"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: MX.navySoft, color: "#fff" }}
            >
              <Printer size={14} /> Print
            </Button>
            <Button variant="bare"
              onClick={exportCsv}
              disabled={!!downloading}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={{ borderColor: MX.navySoft, color: "#fff" }}
            >
              <FileDown size={14} /> {downloading === "csv" ? "Preparing…" : "Structured export"}
            </Button>
            <Button variant="bare"
              onClick={exportPdf}
              disabled={!!downloading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ background: MX.gold, color: MX.navy }}
            >
              <FileText size={14} />
              {downloading === "pdf" ? "Rendering…" : frozen ? "Download PDF" : "Download draft PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        {report.meta.filingNote}
      </div>

      {/* ── Section A ── */}
      <Section title="Section A — Details of the listed entity">
        <IndicatorRows blocks={report.sectionA} />
      </Section>

      {/* ── Section B ── */}
      <Section title="Section B — Management and process disclosures">
        <IndicatorRows blocks={report.sectionB} />
      </Section>

      {/* ── Section C ── */}
      {report.sectionC.map((p) => (
        <Section
          key={p.principle}
          title={`Principle ${p.principle.slice(1)} — ${p.title}`}
          badge={
            <div className="flex items-center gap-2">
              {!p.isPlatformSourced && (
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                  manual entry only
                </span>
              )}
              <span className="text-[11px] text-slate-400">{p.completionPct.toFixed(0)}% complete</span>
            </div>
          }
        >
          {p.narrative && (
            <div className="border-b border-slate-100 px-4 py-2.5 text-xs italic text-slate-600">
              {p.narrative}
            </div>
          )}
          {p.essentialIndicators.length > 0 && (
            <>
              <SubHead>Essential indicators</SubHead>
              <IndicatorRows blocks={p.essentialIndicators} />
            </>
          )}
          {p.leadershipIndicators.length > 0 && (
            <>
              <SubHead>Leadership indicators (voluntary)</SubHead>
              <IndicatorRows blocks={p.leadershipIndicators} />
            </>
          )}
        </Section>
      ))}

      {/* ── environmental annex ── */}
      <Section title="Environmental summary — Principle 6">
        <div className="grid grid-cols-2 gap-px bg-slate-100 p-px sm:grid-cols-4">
          {Object.entries(report.environmentalSummary).map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: MX.navy }}>
                {typeof v === "number" ? fmtNum(v) : "—"}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title, badge, children,
}: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold leading-snug" style={{ fontFamily: MX.display, color: MX.navy }}>
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-b border-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ background: MX.ice, color: MX.navy }}
    >
      {children}
    </div>
  );
}
