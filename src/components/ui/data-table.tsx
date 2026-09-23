"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  RowData,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Search
} from "lucide-react";
import {
  DataTableBulkActions,
  type BulkDeleteConfig,
  type BulkExportConfig
} from "@/components/ui/data-table-bulk-actions";
import { cn } from "@/lib/utils";

// Per-column presentation hints. `label` is what the "Customize Columns" menu
// shows — without it the menu can only fall back to the raw column id, which is
// how you end up with a checkbox labelled "plant" next to one labelled
// "workflowStep".
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    /** Extra classes applied to both the th and every td of the column. */
    className?: string;
    /** Keep this column out of the Customize Columns menu (actions, select). */
    alwaysVisible?: boolean;
  }
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Presence of this enables the search box (filtering is global, not per-key). */
  searchKey?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  className?: string;
  /** Minimum width (px) the table needs to render comfortably. Triggers horizontal scroll when container is narrower. */
  minWidth?: number;
  /** shadcn parity: leading checkbox column + "N of M row(s) selected." */
  enableSelection?: boolean;
  /** shadcn parity: the "Customize Columns" dropdown. On by default. */
  enableColumnVisibility?: boolean;
  /** Left-hand toolbar slot — filter tabs, segmented controls, etc. */
  toolbar?: React.ReactNode;
  /** Right-hand toolbar slot, rendered after "Customize Columns". */
  toolbarActions?: React.ReactNode;
  /** Stable row identity — required if selection must survive re-sorting. */
  getRowId?: (row: TData, index: number) => string;
  /** Notified whenever the selected row set changes. */
  onSelectionChange?: (rows: TData[]) => void;
  /** Per-row emphasis (e.g. an overdue review tinted rose). */
  rowClassName?: (row: TData) => string | undefined;
  /**
   * What ticking rows is FOR. Passing either of these turns on the checkbox
   * column automatically — selection without an action is decoration.
   */
  bulkExport?: BulkExportConfig<TData>;
  bulkDelete?: BulkDeleteConfig<TData>;
}

const SELECT_COLUMN_ID = "__select";

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search…",
  pageSize = 10,
  pageSizeOptions = [10, 15, 25, 50, 100],
  emptyMessage = "No results.",
  className,
  minWidth = 1100,
  enableSelection = false,
  enableColumnVisibility = true,
  toolbar,
  toolbarActions,
  getRowId,
  onSelectionChange,
  rowClassName,
  bulkExport,
  bulkDelete
}: DataTableProps<TData, TValue>) {
  // A table that can export or delete a selection needs the checkboxes, whether
  // or not the caller also passed enableSelection.
  const selectable = enableSelection || Boolean(bulkExport || bulkDelete);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const resolvedColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!selectable) return columns;
    const selectColumn: ColumnDef<TData, TValue> = {
      id: SELECT_COLUMN_ID,
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      meta: { alwaysVisible: true }
    };
    return [selectColumn, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    getRowId,
    enableRowSelection: selectable,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }
  });

  // Fire the selection callback from an effect, not from inside the state
  // setter — otherwise a parent setState lands mid-render of this component.
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  React.useEffect(() => {
    onSelectionChange?.(table.getFilteredSelectedRowModel().rows.map((r) => r.original));
    // Selection identity is fully captured by the row-selection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  const totalRows = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const currentPageSize = table.getState().pagination.pageSize;

  const hideableColumns = table
    .getAllColumns()
    .filter((c) => c.getCanHide() && c.id !== SELECT_COLUMN_ID && !c.columnDef.meta?.alwaysVisible);

  const showToolbar = Boolean(
    searchKey || toolbar || toolbarActions || (enableColumnVisibility && hideableColumns.length)
  );

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-4", className)}>
      {showToolbar && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {searchKey && (
              <div className="relative w-full max-w-sm">
                <Search
                  size={14}
                  className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                />
                <Input
                  placeholder={searchPlaceholder}
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-8 pl-9 text-sm"
                />
              </div>
            )}
            {toolbar}
          </div>

          <div className="flex items-center gap-2">
            {enableColumnVisibility && hideableColumns.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Columns3 size={14} />
                    <span className="hidden lg:inline">Customize Columns</span>
                    <span className="lg:hidden">Columns</span>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {columnLabel(column.id, column.columnDef.meta?.label)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {toolbarActions}
          </div>
        </div>
      )}

      {(bulkExport || bulkDelete) && (
        <DataTableBulkActions
          selected={selectedRows.map((r) => r.original)}
          onClear={() => table.resetRowSelection()}
          bulkExport={bulkExport}
          bulkDelete={bulkDelete}
        />
      )}

      {/* The horizontal-scroll container — table never bleeds wider than this card */}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border">
        <Table style={{ minWidth: `${minWidth}px` }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    className={cn("px-3", header.column.columnDef.meta?.className)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={rowClassName?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("px-3 py-2.5", cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={resolvedColumns.length} className="text-muted-foreground h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* shadcn data-table footer: selection count · rows per page · page x of y */}
      <div className="flex flex-col items-start gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex-1 text-sm">
          {selectable ? (
            <>
              {selectedCount} of {totalRows} row(s) selected.
            </>
          ) : totalRows > 0 ? (
            <>
              Showing{" "}
              <span className="text-foreground font-medium">
                {pageIndex * currentPageSize + 1}–{Math.min((pageIndex + 1) * currentPageSize, totalRows)}
              </span>{" "}
              of <span className="text-foreground font-medium">{totalRows}</span> row(s)
            </>
          ) : (
            "0 row(s)"
          )}
        </div>

        <div className="flex w-full items-center gap-4 sm:w-auto lg:gap-8">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm font-medium">Rows per page</span>
            <Select
              value={currentPageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 w-[72px] px-2 py-0 text-sm"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="flex w-fit items-center justify-center whitespace-nowrap text-sm font-medium">
            Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="hidden h-8 w-8 p-0 lg:flex"
              aria-label="Go to first page"
            >
              <ChevronsLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 w-8 p-0"
              aria-label="Go to previous page"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 w-8 p-0"
              aria-label="Go to next page"
            >
              <ChevronRight size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              className="hidden h-8 w-8 p-0 lg:flex"
              aria-label="Go to last page"
            >
              <ChevronsRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "workflowStep" -> "Workflow step", unless the column declared meta.label. */
function columnLabel(id: string, label?: string) {
  if (label) return label;
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
