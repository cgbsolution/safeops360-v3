"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DeleteIncidentIconButton } from "@/components/incidents/delete-icon-button";
import { SignalChip } from "@/components/ai/SignalChip";
import type { Signal } from "@/lib/insights";
import { formatDate, formatINR, humanize } from "@/lib/utils";

export interface IncidentRow {
  id: string;
  number: string;
  date: string;
  type: string;
  typeColor: string;
  plantName: string;
  location: string;
  description: string;
  lostDays: number;
  propertyDamageCost: string | null;
  workflowStep: string;
  workflowColor: string;
  signal?: Signal | null;
}

const columns: ColumnDef<IncidentRow>[] = [
  {
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => (
      <Link href={`/incidents/${row.original.id}`} className="text-primary-700 font-mono text-xs hover:underline">
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
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => <Badge className={row.original.typeColor}>{humanize(row.original.type)}</Badge>,
    size: 140,
    meta: { label: "Type" }
  },
  {
    id: "plant",
    accessorFn: (r) => `${r.plantName} ${r.location}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Plant / Location" />,
    cell: ({ row }) => (
      <div className="text-sm">
        <div className="text-foreground font-medium">{row.original.plantName}</div>
        {row.original.location && <div className="text-muted-foreground text-xs">{row.original.location}</div>}
      </div>
    ),
    size: 180,
    meta: { label: "Plant / Location" }
  },
  {
    accessorKey: "description",
    header: "Description",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="max-w-[28ch] truncate text-sm" title={row.original.description}>
        {row.original.description}
      </div>
    ),
    meta: { label: "Description" }
  },
  {
    accessorKey: "lostDays",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Lost Days" />,
    cell: ({ row }) => (
      <div className="text-sm">
        {row.original.lostDays > 0 ? (
          <span className="font-semibold text-rose-700">{row.original.lostDays} days</span>
        ) : (
          "—"
        )}
        {row.original.propertyDamageCost && (
          <div className="text-muted-foreground text-xs">{formatINR(Number(row.original.propertyDamageCost))}</div>
        )}
      </div>
    ),
    size: 110,
    meta: { label: "Lost Days" }
  },
  {
    accessorKey: "workflowStep",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow Step" />,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={row.original.workflowColor}>{row.original.workflowStep}</Badge>
        {row.original.signal && (
          <SignalChip signal={row.original.signal} href={`/incidents/${row.original.id}`} />
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
        <Link href={`/incidents/${row.original.id}`} className="text-primary-700 hover:text-primary-900" title="View">
          <Eye size={16} />
        </Link>
        <DeleteIncidentIconButton incidentId={row.original.id} incidentNumber={row.original.number} />
      </div>
    ),
    size: 80,
    meta: { alwaysVisible: true }
  }
];

export function IncidentsTable({ data }: { data: IncidentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      bulkExport={{
        filename: "incidents",
        title: "Incident Investigation — selected records",
        columns: [
          { header: "Number", value: (r) => r.number },
          { header: "Date", value: (r) => formatDate(r.date) },
          { header: "Type", value: (r) => humanize(r.type) },
          { header: "Plant", value: (r) => r.plantName },
          { header: "Location", value: (r) => r.location },
          { header: "Description", value: (r) => r.description },
          { header: "Lost days", value: (r) => r.lostDays },
          {
            header: "Property damage cost",
            value: (r) => (r.propertyDamageCost ? Number(r.propertyDamageCost) : null)
          },
          { header: "Workflow step", value: (r) => r.workflowStep }
        ]
      }}
      bulkDelete={{
        permission: "INCIDENT.DELETE",
        endpoint: (r) => `/api/incidents/${r.id}`,
        label: (r) => r.number,
        noun: "incident"
      }}
      searchKey="number"
      searchPlaceholder="Search incidents…"
      pageSize={15}
      emptyMessage="No incidents match the current filter."
    />
  );
}
