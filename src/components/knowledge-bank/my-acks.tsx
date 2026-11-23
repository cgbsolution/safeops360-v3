"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, kbFetch, type MyAcks } from "@/lib/knowledge-bank/api";
import { DocRow, EmptyState, ErrorBox, StatusBadge } from "./shared";

export function KbMyAcks() {
  const [data, setData] = useState<MyAcks | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kbFetch<MyAcks>("/api/kb/my-acknowledgements").then(setData).catch((e) => setError(e?.message ?? "Could not load"));
  }, []);

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">To read and acknowledge {data ? `(${data.pending.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!data ? (
            <div className="m-3 h-20 animate-pulse rounded bg-slate-100" />
          ) : data.pending.length === 0 ? (
            <EmptyState text="You are up to date. Nothing waiting for your acknowledgement." />
          ) : (
            data.pending.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                right={
                  <Button asChild size="sm">
                    <Link href={`/knowledge-bank/${d.id}`}>Read and acknowledge</Link>
                  </Button>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">My acknowledgement history</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table className="text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow><TableHead>Document</TableHead><TableHead>Version</TableHead><TableHead>Acknowledged</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data?.acknowledged.map((a) => (
                  <TableRow key={`${a.documentId}-${a.versionId}`}>
                    <TableCell>
                      <Button asChild variant="link" className="h-auto p-0 text-left text-sm">
                        <Link href={`/knowledge-bank/${a.documentId}`}>{a.docNo} · {a.title}</Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-xs">
                      v{a.versionNo}
                      {!a.isCurrentVersion && <span className="ml-1 text-amber-700">(a newer version exists)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(a.acknowledgedAt, true)}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data && data.acknowledged.length === 0 && <EmptyState text="No acknowledgements yet." />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
