"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * Reads the `?missing=<label>` marker that `redirectMissingRecord()` puts on a
 * register URL, says so in a toast, and then strips the param.
 *
 * Mounted once in the dashboard layout — every module gets the behaviour for
 * free, and no list page has to know about it.
 */
export function MissingRecordToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const missing = searchParams.get("missing");
  // Guards React 18 double-invoked effects in dev from firing two toasts.
  const announced = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!missing || announced.current === missing) return;
    announced.current = missing;

    toast({
      variant: "error",
      title: `${missing} not found`,
      description:
        "That record does not exist, or it has been deleted. Showing the register instead."
    });

    // Drop the marker so a refresh or a shared link does not replay the toast.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("missing");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [missing, pathname, router, searchParams, toast]);

  return null;
}
