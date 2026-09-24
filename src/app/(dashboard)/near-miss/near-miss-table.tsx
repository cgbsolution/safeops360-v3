"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useLabels } from "@/components/labels/label-provider";
import { TERM, type LabelFn } from "@/lib/labels/core";
import { ArrowUpRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DeleteNearMissIconButton } from "@/components/near-miss/delete-icon-button";
import { SignalChip } from "@/components/ai/SignalChip";
import type { Signal } from "@/lib/insights";
import { formatDate, severityColor } from "@/lib/utils";

export interface NearMissRow {
  id: string;
  number: string;
  date: string;
  plantName: string;
  location: string;
  description: string;
  potentialSeverity: string;
  promotedToIncident: boolean;
  workflowStep: string;
  workflowColor: string;
  signal?: Signal | null;
}

const buildColumns = (L: LabelFn): ColumnDef<NearMissRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/near-miss/${row.original.id}`} className="text-primary-700 font-mono text-xs hover:underline">
          {row.original.number}
        </Link>
        {row.original.promotedToIncident && (
          <Badge className="border-rose-200 bg-rose-100 text-rose-700">
            <ArrowUpRight size={10} /> Promoted
          </Badge>
        )}
      </div>
    ),
    size: 180,
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
    accessorFn: (r) => `${r.plantName} ${r.location}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title={`${L(TERM.plant, "Plant")} / Location`} />,
    cell: ({ row }) => (
      <div className="text-sm">
        <div className="text-foreground font-medium">{row.original.plantName}</div>
        {row.original.location && <div className="text-muted-foreground text-xs">{row.original.location}</div>}
      </div>
    ),
    size: 180,
    meta: { label: `${L(TERM.plant, "Plant")} / Location` }
  },
  {
    accessorKey: "description",
    header: "Description",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="max-w-[30ch] truncate text-sm" title={row.original.description}>
        {row.original.description}
      </div>
    ),
    meta: { label: "Description" }
  },
  {
    accessorKey: "potentialSeverity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Potential" />,
    cell: ({ row }) => (
      <Badge className={severityColor(row.original.potentialSeverity)}>{row.original.potentialSeverity}</Badge>
    ),
    size: 110,
    meta: { label: "Potential severity" }
  },
  {
    accessorKey: "workflowStep",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow Step" />,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={row.original.workflowColor}>{row.original.workflowStep}</Badge>
        {row.original.signal && (
          <SignalChip signal={row.original.signal} href={`/near-miss/${row.original.id}`} />
        )}
      </div>
    ),
    size: 190,
    meta: { label: "Workflow Step" }
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        <Link href={`/near-miss/${row.original.id}`} className="text-primary-700 hover:text-primary-900" title="View">
          <Eye size={16} />
        </Link>
        <DeleteNearMissIconButton nearMissId={row.original.id} nearMissNumber={row.original.number} />
      </div>
    ),
    size: 80,
    meta: { alwaysVisible: true }
  }
];

export function NearMissTable({ data }: { data: NearMissRow[] }) {
  const L = useLabels();
  const columns = useMemo(() => buildColumns(L), [L]);
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      bulkExport={{
        filename: "near-miss-records",
        title: "Near Miss — selected records",
        columns: [
          { header: "Number", value: (r) => r.number },
          { header: "Date", value: (r) => formatDate(r.date) },
          { header: L(TERM.plant, "Plant"), value: (r) => r.plantName },
          { header: "Location", value: (r) => r.location },
          { header: "Description", value: (r) => r.description },
          { header: "Potential severity", value: (r) => r.potentialSeverity },
          { header: "Promoted to incident", value: (r) => (r.promotedToIncident ? "Yes" : "No") },
          { header: "Workflow step", value: (r) => r.workflowStep }
        ]
      }}
      bulkDelete={{
        permission: "NEAR_MISS.DELETE",
        endpoint: (r) => `/api/near-miss/${r.id}`,
        label: (r) => r.number,
        noun: "near-miss record"
      }}
      searchKey="number"
      searchPlaceholder="Search near-miss records…"
      pageSize={15}
      emptyMessage="No near-miss records match the current filter."
    />
  );
}
