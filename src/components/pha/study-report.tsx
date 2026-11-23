// Printable PHA study report: cover, team, sessions, nodes, worksheet per node,
// recommendation register. Server-rendered from GET /api/pha/studies/{id}/report;
// the browser's print (landscape) produces the PDF.

import { fmtDate, label, type StudyReport } from "@/lib/pha/api";
import { RiskChip } from "./shared";
import { MatrixLegend } from "./worksheet";

const th = "border border-slate-300 bg-slate-100 px-1.5 py-1 text-left align-top font-semibold";
const td = "border border-slate-300 px-1.5 py-1 align-top whitespace-pre-line";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 border-b border-slate-300 pb-1 text-base font-bold text-slate-900">{children}</h2>;
}

export function StudyReportView({ report }: { report: StudyReport }) {
  const s = report.study;
  return (
    <div className="mx-auto max-w-[1400px] bg-white p-6 text-[12px] text-slate-900 print:max-w-none print:p-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 12mm; } }"}</style>

      {/* cover */}
      <section className="break-after-page">
        <div className="text-xs uppercase tracking-widest text-slate-500">{s.methodLabel} study report</div>
        <h1 className="mt-1 text-2xl font-bold">{s.title}</h1>
        <div className="mt-1 text-sm text-slate-600">{s.studyNo} · {s.plantName ?? ""}{s.unit ? ` · ${s.unit}` : ""}{s.area ? ` · ${s.area}` : ""}</div>
        <table className="mt-4 w-full max-w-3xl border-collapse">
          <tbody>
            {[
              ["Status", label(s.status)], ["Method", s.methodLabel], ["Scope", s.scope], ["Design intent", s.designIntentSummary],
              ["Drawings (P&ID / PFD)", s.drawingRefs.join(", ")], ["Risk matrix", report.matrix.name],
              ["Facilitator", s.facilitatorName], ["Scribe", s.scribeName], ["Approver", s.approverName],
              ["Approved", s.approvedAt ? `${fmtDate(s.approvedAt)} by ${s.approvedByName ?? "—"}` : "Not approved"],
              ["Revalidation due", fmtDate(s.revalidationDueDate)], ["MOC reference", s.mocId],
              ["Nodes / rows", `${report.nodes.length} nodes · ${report.nodes.reduce((a, n) => a + n.deviations.length, 0)} worksheet rows`],
              ["Recommendations", `${report.recommendations.length} raised · ${report.recommendations.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length} open`],
            ].map(([k, v]) => (
              <tr key={k as string}><th className={`${th} w-48`}>{k}</th><td className={td}>{v || "—"}</td></tr>
            ))}
          </tbody>
        </table>
        {s.reviewComments && <p className="mt-3 text-xs"><span className="font-semibold">Review comments:</span> {s.reviewComments}</p>}
        <div className="mt-4"><MatrixLegend matrix={report.matrix} /></div>
        <p className="mt-4 text-[10px] text-slate-400">Generated {fmtDate(report.generatedAt, true)}</p>
      </section>

      <H>Study team</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Discipline</th><th className={th}>Organisation</th></tr></thead>
        <tbody>
          {report.team.map((m) => (
            <tr key={m.id}><td className={td}>{m.name}{m.isExternal ? " (external)" : ""}</td><td className={td}>{m.roleLabel ?? label(m.role)}</td><td className={td}>{label(m.discipline)}</td><td className={td}>{m.organisation ?? "—"}</td></tr>
          ))}
        </tbody>
      </table>

      <H>Sessions</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>#</th><th className={th}>Date</th><th className={th}>Duration</th><th className={th}>Attendees</th><th className={th}>Nodes covered</th><th className={th}>Notes</th></tr></thead>
        <tbody>
          {report.sessions.map((x) => (
            <tr key={x.id}>
              <td className={td}>{x.sessionNo}</td><td className={td}>{fmtDate(x.sessionDate, true)}</td>
              <td className={td}>{x.durationMinutes ? `${x.durationMinutes} min` : "—"}</td>
              <td className={td}>{[...x.attendees.map((a) => a.name), ...x.attendeeNames].join(", ")}</td>
              <td className={td}>{x.nodeLabels.join(", ")}</td><td className={td}>{x.notes ?? ""}</td>
            </tr>
          ))}
          {report.sessions.length === 0 && <tr><td className={td} colSpan={6}>No sessions recorded.</td></tr>}
        </tbody>
      </table>

      <H>Nodes</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>Node</th><th className={th}>Design intent</th><th className={th}>Boundaries</th><th className={th}>Drawing</th><th className={th}>Operating parameters</th></tr></thead>
        <tbody>
          {report.nodes.map((n) => (
            <tr key={n.id}>
              <td className={td}><span className="font-semibold">{n.nodeNo}.</span> {n.title}</td><td className={td}>{n.designIntent ?? ""}</td>
              <td className={td}>{n.boundaries ?? ""}</td><td className={td}>{n.drawingRef ?? ""}</td>
              <td className={td}>{n.operatingParameters.map((p) => `${p.name}: ${p.value ?? "—"} ${p.unit ?? ""}`.trim()).join("\n")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.nodes.map((n) => (
        <section key={n.id} className="break-before-page">
          <H>Worksheet · Node {n.nodeNo}: {n.title}</H>
          <p className="mb-2 text-xs"><span className="font-semibold">Design intent:</span> {n.designIntent ?? "—"}{n.drawingRef ? ` · Drawing ${n.drawingRef}` : ""}</p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {["Ref", "Guideword", "Parameter", "Deviation", "Causes", "Consequences", "Existing safeguards", "S", "L", "Risk", "Recommendations", "Res. S", "Res. L", "Residual risk", "Remarks"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {n.deviations.map((d, i) => (
                <tr key={d.id} className="break-inside-avoid">
                  <td className={td}>{n.nodeNo}.{i + 1}</td><td className={td}>{d.guideword ? d.guidewordLabel : ""}</td>
                  <td className={td}>{d.parameter ? d.parameterLabel : ""}</td><td className={`${td} font-medium`}>{d.deviation}</td>
                  <td className={td}>{d.causes ?? ""}</td><td className={td}>{d.consequences ?? ""}</td><td className={td}>{d.safeguards ?? ""}</td>
                  <td className={td}>{d.severity ?? ""}</td><td className={td}>{d.likelihood ?? ""}</td>
                  <td className={td}><RiskChip level={d.riskLevel} score={d.riskScore} color={d.riskColor} compact /></td>
                  <td className={td}>{d.recommendations.map((r) => `${r.recLabel}: ${r.text}`).join("\n")}</td>
                  <td className={td}>{d.residualSeverity ?? ""}</td><td className={td}>{d.residualLikelihood ?? ""}</td>
                  <td className={td}><RiskChip level={d.residualLevel} score={d.residualScore} color={d.residualColor} compact /></td>
                  <td className={td}>{d.remarks ?? ""}</td>
                </tr>
              ))}
              {n.deviations.length === 0 && <tr><td className={td} colSpan={15}>No worksheet rows.</td></tr>}
            </tbody>
          </table>
        </section>
      ))}

      <section className="break-before-page">
        <H>Recommendation register</H>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>{["No.", "Row", "Recommendation", "Risk", "Priority", "Owner", "Target", "Status", "CAPA", "Justification / closure"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {report.recommendations.map((r) => (
              <tr key={r.id} className="break-inside-avoid">
                <td className={td}>{r.recLabel}</td><td className={td}>{r.deviationRef ?? ""} {r.deviationText ?? ""}</td><td className={td}>{r.text}</td>
                <td className={td}><RiskChip level={r.riskLevel ?? null} color={r.riskColor} compact /></td>
                <td className={td}>{label(r.priority)}</td><td className={td}>{r.ownerName ?? "Unassigned"}</td><td className={td}>{fmtDate(r.dueDate)}</td>
                <td className={td}>{label(r.status)}{r.overdue ? " (overdue)" : ""}</td>
                <td className={td}>{r.capaNumber ? `${r.capaNumber} (${label(r.capaState)})` : ""}</td>
                <td className={td}>{r.status === "REJECTED" ? r.justification ?? "" : r.closureNote ?? ""}</td>
              </tr>
            ))}
            {report.recommendations.length === 0 && <tr><td className={td} colSpan={10}>No recommendations.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="mt-10 grid grid-cols-3 gap-8 text-xs break-inside-avoid">
        {[["Facilitator", s.facilitatorName], ["Scribe", s.scribeName], ["Approver", s.approvedByName ?? s.approverName]].map(([r, n]) => (
          <div key={r as string}><div className="h-10 border-b border-slate-400" /><div className="mt-1 font-semibold">{r}</div><div className="text-slate-600">{n ?? ""}</div></div>
        ))}
      </section>
    </div>
  );
}
