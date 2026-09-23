"use client";

// The bar that appears above a <DataTable> once rows are ticked.
//
// Row selection only earns its place if selecting does something. This is that
// something: export the ticked rows to Excel, and delete them — the delete
// gated by the same RBAC code as the per-row trash icon, and executed through
// the same per-record DELETE endpoint, so the server authorises every single
// removal exactly as it does today. Nothing here is a new privilege path.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { usePermission } from "@/components/auth/can";

export interface BulkExportConfig<TData> {
  /** Base filename, no extension — a date stamp is appended. */
  filename: string;
  /** Title written into the first row of the sheet. */
  title: string;
  /** The sheet's grid. Keep the order the reader sees on screen. */
  columns: { header: string; value: (row: TData) => string | number | null }[];
}

export interface BulkDeleteConfig<TData> {
  /** RBAC code — the same one the per-row trash icon uses, e.g. "PTW.DELETE". */
  permission: string;
  /** Per-record DELETE endpoint. */
  endpoint: (row: TData) => string;
  /** How a row is named in the confirm dialog and the failure list. */
  label: (row: TData) => string;
  /** Singular noun for the copy: "permit", "observation". */
  noun: string;
}

interface DataTableBulkActionsProps<TData> {
  selected: TData[];
  onClear: () => void;
  bulkExport?: BulkExportConfig<TData>;
  bulkDelete?: BulkDeleteConfig<TData>;
}

// Deletes run a few at a time rather than all at once: a 200-row selection
// firing 200 simultaneous requests would exhaust the connection pool that the
// rest of the app is sharing.
const DELETE_CONCURRENCY = 4;

export function DataTableBulkActions<TData>({
  selected,
  onClear,
  bulkExport,
  bulkDelete
}: DataTableBulkActionsProps<TData>) {
  const router = useRouter();
  const { toast } = useToast();
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Hooks cannot be conditional, so the permission is always read; the button
  // below is what is conditional.
  const canDelete = usePermission(bulkDelete?.permission ?? "__none__");

  const count = selected.length;
  if (count === 0) return null;

  async function handleExport() {
    if (!bulkExport || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `${bulkExport.filename}-${new Date().toISOString().slice(0, 10)}`,
          sheetName: bulkExport.title,
          title: bulkExport.title,
          columns: bulkExport.columns.map((c) => c.header),
          rows: selected.map((row) => bulkExport.columns.map((c) => c.value(row)))
        })
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          variant: "error",
          title: "Export failed",
          description: j.error ?? `The server returned status ${res.status}.`
        });
        return;
      }

      // Read the whole body before creating the object URL — a streamed blob
      // that is revoked too early downloads as a zero-byte file.
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? `${bulkExport.filename}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        variant: "success",
        title: "Export ready",
        description: `${count} row${count === 1 ? "" : "s"} written to ${filename}.`
      });
    } catch (err: any) {
      toast({
        variant: "error",
        title: "Export failed",
        description: err?.message ?? "Could not reach the server."
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!bulkDelete || deleting) return;

    const names = selected.slice(0, 8).map(bulkDelete.label);
    const more = count - names.length;
    const ok = await confirmDialog({
      title: `Delete ${count} ${bulkDelete.noun}${count === 1 ? "" : "s"}?`,
      description:
        `Permanently delete ${count} ${bulkDelete.noun}${count === 1 ? "" : "s"}?\n\n` +
        names.join("\n") +
        (more > 0 ? `\n…and ${more} more` : "") +
        `\n\nThis cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;

    setDeleting(true);
    const failures: string[] = [];
    try {
      const queue = [...selected];
      async function worker() {
        while (queue.length) {
          const row = queue.shift();
          if (!row) return;
          try {
            const res = await fetch(bulkDelete!.endpoint(row), { method: "DELETE" });
            // A record someone else already removed is not a failure worth
            // reporting — the caller's intent is satisfied either way.
            if (!res.ok && res.status !== 204 && res.status !== 404) {
              failures.push(bulkDelete!.label(row));
            }
          } catch {
            failures.push(bulkDelete!.label(row));
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(DELETE_CONCURRENCY, selected.length) }, worker)
      );

      const removed = count - failures.length;
      if (failures.length === 0) {
        toast({
          variant: "success",
          title: `Deleted ${removed} ${bulkDelete.noun}${removed === 1 ? "" : "s"}`,
          description: "The register has been refreshed."
        });
      } else {
        // Naming what did NOT go is the whole point — a silent partial delete
        // leaves someone believing a record is gone when it is not.
        toast({
          variant: "error",
          title: `${removed} deleted, ${failures.length} could not be`,
          description: `Not removed: ${failures.slice(0, 5).join(", ")}${
            failures.length > 5 ? `, +${failures.length - 5} more` : ""
          }. You may not hold delete rights on those records.`
        });
      }
      onClear();
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-accent/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-foreground text-sm font-medium">
        {count} row{count === 1 ? "" : "s"} selected
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {bulkExport && (
          <Button variant="outline" size="sm" className="h-8" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "Preparing…" : "Export to Excel"}
          </Button>
        )}

        {bulkDelete && canDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? "Deleting…" : "Delete selected"}
          </Button>
        )}

        <Button variant="ghost" size="sm" className="h-8" onClick={onClear} disabled={deleting}>
          <X size={14} /> Clear
        </Button>
      </div>
    </div>
  );
}
