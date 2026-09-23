import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

/**
 * Safety net for every `notFound()` still left in the dashboard.
 *
 * Without a not-found boundary in this route group, Next renders its built-in
 * 404 inside the app shell — which shows up as an empty content area with no
 * heading, no message and no way back. Modules that have been converted use
 * `redirectMissingRecord()` instead (register + toast); this page catches the
 * rest so a bad deep link is never a blank screen.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <FileQuestion className="text-slate-500" size={28} />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">We couldn&apos;t find that record</h2>
      <p className="max-w-sm text-sm text-slate-500">
        The link may be out of date, or the record has been deleted. Pick it up again from its
        register, or go back to the dashboard.
      </p>
      <div className="flex items-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/inbox">Open my inbox</Link>
        </Button>
      </div>
    </div>
  );
}
