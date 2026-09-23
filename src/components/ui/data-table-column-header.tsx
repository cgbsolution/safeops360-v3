"use client";

import * as React from "react";
import { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

/**
 * shadcn data-table column header: sentence-case label, ghost affordance, and
 * a sort glyph that only appears once the column is sortable. Deliberately NOT
 * uppercase — the shadcn data table reads as a document table, not a grid.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={cn("text-foreground text-sm font-medium", className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring -ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <ArrowUp size={14} className="text-muted-foreground" />
      ) : sorted === "desc" ? (
        <ArrowDown size={14} className="text-muted-foreground" />
      ) : (
        <ChevronsUpDown size={14} className="text-muted-foreground opacity-50" />
      )}
    </Button>
  );
}
