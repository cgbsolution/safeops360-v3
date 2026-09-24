"use client";

import Link from "next/link";
import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DeleteObservationIconButton } from "@/components/observations/delete-icon-button";
import { EditRecordIconButton } from "@/components/common/edit-icon-button";
import { SignalChipGroup } from "@/components/ai/SignalChipGroup";
import type { Signal } from "@/lib/insights";
import { formatDate, statusColor, severityColor, humanize } from "@/lib/utils";
import { useLabels } from "@/components/labels/label-provider";
import { TERM, type LabelFn } from "@/lib/labels/core";

export interface ObservationRow {
  id: string;
  number: string;
  date: string; // ISO
  plantName: string;
  areaName: string | null;
  areaId: string | null;
  type: string;
  category: string;
  description: string;
  severity: string;
  status: string;
  workflowStep: string;
  workflowColor: string;
  signals?: Signal[];
}

const buildColumns = (L: LabelFn): ColumnDef<ObservationRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => (
      <Link
        href={`/observations/${row.original.id}`}
        className="text-primary-700 font-mono text-xs hover:underline"
      >
        {row.original.number}
      </Link>
    ),
    size: 140,
    meta: { label: "Number" }
  },
  {
    accessorKey: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDate(row.original.date)}</span>,
    sortingFn: "datetime",
    size: 110,
    meta: { label: "Date" }
  },
  {
    id: "plant",
    accessorFn: (r) => `${r.plantName} ${r.areaName ?? ""}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title={`${L(TERM.plant, "Plant")} / Area`} />,
    cell: ({ row }) => (
      <div className="text-sm">
        <div className="text-foreground font-medium">{row.original.plantName}</div>
        {row.original.areaName && <div className="text-muted-foreground text-xs">{row.original.areaName}</div>}
      </div>
    ),
    size: 180,
    meta: { label: `${L(TERM.plant, "Plant")} / Area` }
  },
  {
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => {
      const isUnsafe = row.original.type.startsWith("UNSAFE");
      return (
        <Badge className={isUnsafe ? severityColor("HIGH") : severityColor("LOW")}>
          {humanize(row.original.type)}
        </Badge>
      );
    },
    size: 120,
    meta: { label: "Type" }
  },
  {
    accessorKey: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ row }) => <span className="text-sm">{humanize(row.original.category)}</span>,
    size: 140,
    meta: { label: "Category" }
  },
  {
    accessorKey: "description",
    header: "Description",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-foreground max-w-[26ch] truncate text-sm" title={row.original.description}>
        {row.original.description}
      </div>
    ),
    meta: { label: "Description" }
  },
  {
    accessorKey: "severity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Severity" />,
    cell: ({ row }) => <Badge className={severityColor(row.original.severity)}>{row.original.severity}</Badge>,
    size: 110,
    meta: { label: "Severity" }
  },
  {
    accessorKey: "workflowStep",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow Step" />,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={row.original.workflowColor}>{row.original.workflowStep}</Badge>
        <SignalChipGroup
          signals={row.original.signals ?? []}
          href={`/observations/${row.original.id}`}
        />
      </div>
    ),
    size: 220,
    meta: { label: "Workflow Step" }
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/observations/${row.original.id}`}
          className="text-primary-700 hover:text-primary-900"
          title="View"
        >
          <Eye size={16} />
        </Link>
        {row.original.status !== "CLOSED" && (
          <EditRecordIconButton
            href={`/observations/${row.original.id}/edit`}
            permission="OBSERVATION.UPDATE"
            label={`Edit ${row.original.number}`}
          />
        )}
        <DeleteObservationIconButton
          observationId={row.original.id}
          observationNumber={row.original.number}
        />
      </div>
    ),
    size: 80,
    meta: { alwaysVisible: true }
  }
];

export function ObservationsTable({ data }: { data: ObservationRow[] }) {
  const L = useLabels();
  const columns = React.useMemo(() => buildColumns(L), [L]);
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      bulkExport={{
        filename: "safety-observations",
        title: "Safety Observations — selected records",
        columns: [
          { header: "Number", value: (r) => r.number },
          { header: "Date", value: (r) => formatDate(r.date) },
          { header: L(TERM.plant, "Plant"), value: (r) => r.plantName },
          { header: "Area", value: (r) => r.areaName },
          { header: "Type", value: (r) => humanize(r.type) },
          { header: "Category", value: (r) => humanize(r.category) },
          { header: "Description", value: (r) => r.description },
          { header: "Severity", value: (r) => r.severity },
          { header: "Status", value: (r) => humanize(r.status) },
          { header: "Workflow step", value: (r) => r.workflowStep }
        ]
      }}
      bulkDelete={{
        permission: "OBSERVATION.DELETE",
        endpoint: (r) => `/api/observations/${r.id}`,
        label: (r) => r.number,
        noun: "observation"
      }}
      searchKey="number"
      searchPlaceholder="Search observations…"
      pageSize={15}
      emptyMessage="No observations match the current filter."
    />
  );
}
