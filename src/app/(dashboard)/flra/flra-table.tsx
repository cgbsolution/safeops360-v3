"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DeleteFlraIconButton } from "@/components/flra/delete-icon-button";
import { formatDate } from "@/lib/utils";
import { useLabels } from "@/components/labels/label-provider";
import { TERM, type LabelFn } from "@/lib/labels/core";

export interface FlraRow {
  id: string;
  number: string;
  date: string;
  plantName: string;
  jobDescription: string;
  leaderName: string;
  permitId: string | null;
  permitNumber: string | null;
}

const buildColumns = (L: LabelFn): ColumnDef<FlraRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => (
      <Link href={`/flra/${row.original.id}`} className="text-primary-700 font-mono text-xs hover:underline">
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
    accessorKey: "plantName",
    header: ({ column }) => <DataTableColumnHeader column={column} title={L(TERM.plant, "Plant")} />,
    cell: ({ row }) => <span className="text-sm">{row.original.plantName}</span>,
    size: 160,
    meta: { label: L(TERM.plant, "Plant") }
  },
  {
    accessorKey: "jobDescription",
    header: "Job",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="max-w-[36ch] truncate text-sm" title={row.original.jobDescription}>
        {row.original.jobDescription}
      </div>
    ),
    meta: { label: "Job" }
  },
  {
    accessorKey: "leaderName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Leader" />,
    cell: ({ row }) => <span className="text-sm">{row.original.leaderName}</span>,
    size: 160,
    meta: { label: "Leader" }
  },
  {
    id: "permit",
    header: "Permit",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.permitId && row.original.permitNumber ? (
        <Link href={`/ptw/${row.original.permitId}`} className="text-primary-700 font-mono text-xs hover:underline">
          {row.original.permitNumber}
        </Link>
      ) : (
        <span className="text-muted-foreground text-xs">Standalone</span>
      ),
    size: 130,
    meta: { label: "Permit" }
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        <Link href={`/flra/${row.original.id}`} className="text-primary-700 hover:text-primary-900" title="View Site Safety Check">
          <Eye size={16} />
        </Link>
        <DeleteFlraIconButton flraId={row.original.id} flraNumber={row.original.number} />
      </div>
    ),
    size: 80,
    meta: { alwaysVisible: true }
  }
];

export function FlraTable({ data }: { data: FlraRow[] }) {
  const L = useLabels();
  const columns = useMemo(() => buildColumns(L), [L]);
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      bulkExport={{
        filename: "flras",
        title: "FLRA (Site Safety Check) — selected records",
        columns: [
          { header: "Number", value: (r) => r.number },
          { header: "Date", value: (r) => formatDate(r.date) },
          { header: L(TERM.plant, "Plant"), value: (r) => r.plantName },
          { header: "Job", value: (r) => r.jobDescription },
          { header: "Leader", value: (r) => r.leaderName },
          { header: "Permit", value: (r) => r.permitNumber ?? "Standalone" }
        ]
      }}
      bulkDelete={{
        permission: "FLRA.DELETE",
        endpoint: (r) => `/api/flra/${r.id}`,
        label: (r) => r.number,
        noun: "Site Safety Check"
      }}
      searchKey="number"
      searchPlaceholder="Search site safety checks…"
      pageSize={15}
      emptyMessage="No site safety checks found."
    />
  );
}
