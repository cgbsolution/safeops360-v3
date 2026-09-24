"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useLabels } from "@/components/labels/label-provider";
import { TERM, type LabelFn } from "@/lib/labels/core";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DeletePermitIconButton } from "@/components/ptw/delete-icon-button";
import { formatDate, humanize } from "@/lib/utils";

export interface PermitRow {
  id: string;
  number: string;
  type: string;
  typeColor: string;
  plantName: string;
  areaName: string | null;
  scopeOfWork: string;
  validFrom: string;
  validTo: string;
  workflowStep: string;
  workflowColor: string;
}

const buildColumns = (L: LabelFn): ColumnDef<PermitRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => (
      <Link href={`/ptw/${row.original.id}`} className="text-primary-700 font-mono text-xs hover:underline">
        {row.original.number}
      </Link>
    ),
    size: 140,
    meta: { label: "Number" }
  },
  {
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => <Badge className={row.original.typeColor}>{humanize(row.original.type)}</Badge>,
    size: 150,
    meta: { label: "Type" }
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
    accessorKey: "scopeOfWork",
    header: "Scope",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="max-w-[28ch] truncate text-sm" title={row.original.scopeOfWork}>
        {row.original.scopeOfWork}
      </div>
    ),
    meta: { label: "Scope" }
  },
  {
    accessorKey: "validFrom",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Validity" />,
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-xs">
        <div>{formatDate(row.original.validFrom)}</div>
        <div className="text-muted-foreground">to {formatDate(row.original.validTo)}</div>
      </div>
    ),
    sortingFn: "datetime",
    size: 130,
    meta: { label: "Validity" }
  },
  {
    accessorKey: "workflowStep",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow Step" />,
    cell: ({ row }) => <Badge className={row.original.workflowColor}>{row.original.workflowStep}</Badge>,
    size: 180,
    meta: { label: "Workflow Step" }
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        <Link href={`/ptw/${row.original.id}`} className="text-primary-700 hover:text-primary-900" title="View">
          <Eye size={16} />
        </Link>
        <DeletePermitIconButton permitId={row.original.id} permitNumber={row.original.number} />
      </div>
    ),
    size: 80,
    meta: { alwaysVisible: true }
  }
];

export function PtwTable({ data }: { data: PermitRow[] }) {
  const L = useLabels();
  const columns = useMemo(() => buildColumns(L), [L]);
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.id}
      bulkExport={{
        filename: "permits",
        title: "Permit to Work — selected permits",
        columns: [
          { header: "Number", value: (r) => r.number },
          { header: "Type", value: (r) => humanize(r.type) },
          { header: L(TERM.plant, "Plant"), value: (r) => r.plantName },
          { header: "Area", value: (r) => r.areaName },
          { header: "Scope of work", value: (r) => r.scopeOfWork },
          { header: "Valid from", value: (r) => formatDate(r.validFrom) },
          { header: "Valid to", value: (r) => formatDate(r.validTo) },
          { header: "Workflow step", value: (r) => r.workflowStep }
        ]
      }}
      bulkDelete={{
        permission: "PTW.DELETE",
        endpoint: (r) => `/api/ptw/${r.id}`,
        label: (r) => r.number,
        noun: "permit"
      }}
      searchKey="number"
      searchPlaceholder="Search permits…"
      pageSize={15}
      emptyMessage="No permits match the current filter."
    />
  );
}
