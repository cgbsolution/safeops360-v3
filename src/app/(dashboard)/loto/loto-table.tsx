"use client";

// The LOTO procedure library register, on the shared shadcn <DataTable> rather
// than a hand-rolled <table>. Same object as PTW / Observations / Incidents:
// one search box, one Customize Columns menu, one pagination footer.

import Link from "next/link";
import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useLabels } from "@/components/labels/label-provider";
import type { LabelFn } from "@/lib/labels/core";
import { AlertTriangle, Eye, Lock, QrCode } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { cn } from "@/lib/utils";
import {
  PROCEDURE_STATUS_CHIP,
  PROCEDURE_STATUS_LABEL,
  type ProcedureListItem
} from "./_meta";

function formatDue(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

const buildColumns = (L: LabelFn): ColumnDef<ProcedureListItem>[] => [
  {
    accessorKey: "procedureCode",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div>
          <Link href={`/loto/${p.id}`} className="text-primary-700 font-medium hover:underline">
            {p.procedureCode}
          </Link>
          <div className="text-muted-foreground mt-0.5 max-w-xs truncate text-xs">{p.title}</div>
          {p.qrCodeToken && (
            <div className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-[11px]">
              <QrCode size={11} /> QR published
            </div>
          )}
        </div>
      );
    },
    size: 220,
    meta: { label: "Code" }
  },
  {
    id: "equipment",
    accessorFn: (p) => `${p.equipmentName ?? ""} ${p.equipmentTag ?? ""}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipment" />,
    cell: ({ row }) => (
      <div className="text-sm">
        <div className="text-foreground">{row.original.equipmentName ?? "—"}</div>
        {row.original.equipmentTag && (
          <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.original.equipmentTag}</div>
        )}
      </div>
    ),
    size: 200,
    meta: { label: "Equipment" }
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div>
          <span
            className={cn(
              "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
              PROCEDURE_STATUS_CHIP[p.status] ?? PROCEDURE_STATUS_CHIP.draft
            )}
          >
            {PROCEDURE_STATUS_LABEL[p.status] ?? p.status}
          </span>
          <div className="text-muted-foreground mt-1 text-xs">
            v{p.version}
            {/* The version the FIELD sees can legitimately trail the live one
                while a material edit awaits re-approval. Saying so here stops a
                supervisor assuming the QR label already shows their edit. */}
            {p.publishedVersion != null && p.publishedVersion !== p.version && (
              <span className="ml-1 text-amber-700">(field: v{p.publishedVersion})</span>
            )}
          </div>
          {p.openExecutionCount > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-700">
              <Lock size={11} /> {p.openExecutionCount} lockout
              {p.openExecutionCount === 1 ? "" : "s"} open
            </div>
          )}
        </div>
      );
    },
    size: 170,
    meta: { label: "Status" }
  },
  {
    id: "body",
    accessorFn: (p) => p.isolationPointCount,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Body" />,
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div className="text-muted-foreground text-xs">
          <div>
            {p.isolationPointCount} isolation point{p.isolationPointCount === 1 ? "" : "s"}
          </div>
          <div>
            {p.verificationStepCount} verification step{p.verificationStepCount === 1 ? "" : "s"}
          </div>
          <div>
            {p.energySourceCount} energy source{p.energySourceCount === 1 ? "" : "s"}
          </div>
        </div>
      );
    },
    size: 170,
    meta: { label: "Body" }
  },
  {
    id: "nextReview",
    accessorFn: (p) => p.review.nextReviewDueAt ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Next review" />,
    cell: ({ row }) => {
      const { review } = row.original;
      if (!review.nextReviewDueAt) {
        return <span className="text-muted-foreground text-xs">Not scheduled</span>;
      }
      return (
        <div
          className={cn(
            "text-xs",
            review.isOverdue
              ? "font-semibold text-rose-700"
              : review.isDueSoon
                ? "font-medium text-amber-700"
                : "text-muted-foreground"
          )}
        >
          {review.isOverdue && (
            <span className="mr-1 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> Overdue
            </span>
          )}
          {formatDue(review.nextReviewDueAt)}
          {review.daysUntilDue != null && (
            <div className="text-muted-foreground mt-0.5 font-normal">
              {review.isOverdue
                ? `${Math.abs(review.daysUntilDue)} day${Math.abs(review.daysUntilDue) === 1 ? "" : "s"} late`
                : `in ${review.daysUntilDue} day${review.daysUntilDue === 1 ? "" : "s"}`}
            </div>
          )}
        </div>
      );
    },
    sortingFn: "datetime",
    size: 160,
    meta: { label: "Next review" }
  },
  {
    id: "site",
    // siteName is resolved server-side and is never a raw cuid.
    accessorFn: (p) => `${p.siteName ?? ""} ${p.area ?? ""}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title={L("term.site", "Site")} />,
    cell: ({ row }) => (
      <div className="text-muted-foreground text-xs">
        {row.original.siteName ?? "—"}
        {row.original.area && <div>{row.original.area}</div>}
      </div>
    ),
    size: 160,
    meta: { label: L("term.site", "Site") }
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        <Link href={`/loto/${row.original.id}`} className="text-primary-700 hover:text-primary-900" title="View">
          <Eye size={16} />
        </Link>
      </div>
    ),
    size: 60,
    meta: { alwaysVisible: true }
  }
];

export function LotoProceduresTable({
  data,
  emptyMessage
}: {
  data: ProcedureListItem[];
  emptyMessage?: string;
}) {
  const L = useLabels();
  const columns = useMemo(() => buildColumns(L), [L]);
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      // Export only: LOTO exposes no per-procedure DELETE endpoint, and a
      // procedure is retired through its lifecycle rather than removed.
      bulkExport={{
        filename: "loto-procedures",
        title: "LOTO Procedure Library — selected procedures",
        columns: [
          { header: "Code", value: (r) => r.procedureCode },
          { header: "Title", value: (r) => r.title },
          { header: "Equipment", value: (r) => r.equipmentName },
          { header: "Equipment tag", value: (r) => r.equipmentTag },
          { header: "Status", value: (r) => PROCEDURE_STATUS_LABEL[r.status] ?? r.status },
          { header: "Version", value: (r) => r.version },
          { header: "Published version", value: (r) => r.publishedVersion },
          { header: "Isolation points", value: (r) => r.isolationPointCount },
          { header: "Verification steps", value: (r) => r.verificationStepCount },
          { header: "Energy sources", value: (r) => r.energySourceCount },
          { header: "Open lockouts", value: (r) => r.openExecutionCount },
          {
            header: "Next review due",
            value: (r) =>
              r.review.nextReviewDueAt ? formatDue(r.review.nextReviewDueAt) : "Not scheduled"
          },
          { header: "Review overdue", value: (r) => (r.review.isOverdue ? "Yes" : "No") },
          { header: L("term.site", "Site"), value: (r) => r.siteName },
          { header: "Area", value: (r) => r.area }
        ]
      }}
      searchKey="procedureCode"
      searchPlaceholder="Search procedures…"
      pageSize={15}
      minWidth={1000}
      emptyMessage={emptyMessage ?? "No LOTO procedures here yet."}
      // An overdue review is the one row state a reader must not scroll past.
      rowClassName={(p) => (p.review.isOverdue ? "bg-rose-50/60 hover:bg-rose-50" : undefined)}
    />
  );
}
