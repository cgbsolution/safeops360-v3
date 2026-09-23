"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Promise-based replacements for window.confirm / alert / prompt, rendered as
 * shadcn AlertDialogs by the single <DialogHost /> mounted in <Providers>.
 *
 *   if (!(await confirmDialog("Delete this record?"))) return;
 *   await alertDialog("Saved.");
 *   const reason = await promptDialog("Reason for rejection?");   // null on cancel
 */

type Base = { title?: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type PromptExtra = { defaultValue?: string; placeholder?: string };
type Request =
  | ({ kind: "confirm"; resolve: (ok: boolean) => void } & Base)
  | ({ kind: "alert"; resolve: () => void } & Base)
  | ({ kind: "prompt"; resolve: (v: string | null) => void } & Base & PromptExtra);

const norm = <T extends object>(o: string | T): T | { description: string } =>
  typeof o === "string" ? { description: o } : o;

let enqueue: ((r: Request) => void) | null = null;

export function confirmDialog(opts: string | Base): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve(false);
    enqueue({ kind: "confirm", resolve, ...norm(opts) });
  });
}

export function alertDialog(opts: string | Base): Promise<void> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve();
    enqueue({ kind: "alert", resolve, ...norm(opts) });
  });
}

export function promptDialog(opts: string | (Base & PromptExtra)): Promise<string | null> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve(null);
    enqueue({ kind: "prompt", resolve, ...norm(opts) });
  });
}

export function DialogHost() {
  const [queue, setQueue] = React.useState<Request[]>([]);
  const [text, setText] = React.useState("");
  const current = queue[0];

  React.useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    return () => {
      enqueue = null;
    };
  }, []);

  React.useEffect(() => {
    if (current?.kind === "prompt") setText(current.defaultValue ?? "");
  }, [current]);

  const finish = (ok: boolean) => {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(ok);
    else if (current.kind === "alert") current.resolve();
    else current.resolve(ok ? text : null);
    setQueue((q) => q.slice(1));
  };

  const title =
    current?.title ??
    (current?.kind === "alert" ? "Notice" : current?.kind === "prompt" ? "Input required" : "Are you sure?");

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => !open && finish(false)}>
      {current ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {current.description ? <AlertDialogDescription>{current.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          {current.kind === "prompt" ? (
            <Input
              autoFocus
              value={text}
              placeholder={current.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finish(true);
                }
              }}
            />
          ) : null}
          <AlertDialogFooter>
            {current.kind !== "alert" ? (
              <AlertDialogCancel onClick={() => finish(false)}>{current.cancelLabel ?? "Cancel"}</AlertDialogCancel>
            ) : null}
            <AlertDialogAction
              className={current.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              onClick={() => finish(true)}
            >
              {current.confirmLabel ??
                (current.kind === "alert" ? "OK" : current.kind === "prompt" ? "Submit" : "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
