"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Checkbox (Radix). Takes the stock `checked` / `onCheckedChange`
 * API and, for screens written against a native checkbox, `onChange` with an
 * event whose `target.checked` is the new state. `indeterminate` renders the
 * mixed state.
 */

type CheckboxTarget = { checked: boolean; name?: string; value?: string; type: "checkbox" };
export type CheckboxChangeEvent = {
  target: CheckboxTarget;
  currentTarget: CheckboxTarget;
  stopPropagation: () => void;
  preventDefault: () => void;
};

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onChange" | "value"> {
  onChange?: (event: CheckboxChangeEvent) => void;
  indeterminate?: boolean;
  value?: string;
  readOnly?: boolean;
}

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, onChange, onCheckedChange, indeterminate, checked, name, value, readOnly, ...props }, ref) => {
    const state = indeterminate ? "indeterminate" : checked;
    return (
      <CheckboxPrimitive.Root
        ref={ref}
        name={name}
        value={value}
        checked={state}
        onCheckedChange={(next) => {
          if (readOnly) return;
          onCheckedChange?.(next);
          if (onChange) {
            const target: CheckboxTarget = { checked: next === true, name, value, type: "checkbox" };
            onChange({ target, currentTarget: target, stopPropagation: () => {}, preventDefault: () => {} });
          }
        }}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-slate-400 bg-white ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary-700 data-[state=checked]:bg-primary-700 data-[state=checked]:text-white data-[state=indeterminate]:border-primary-700 data-[state=indeterminate]:bg-primary-700 data-[state=indeterminate]:text-white",
          className
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          {state === "indeterminate" ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" strokeWidth={3} />}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  }
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
