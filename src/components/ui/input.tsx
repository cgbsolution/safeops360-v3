import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// `compact` is the dense field the Fire & Life Safety register dialogs use
// (ported from the Page Industries build). The default is exactly the
// pre-existing Input styling, so every current form renders unchanged.
const inputVariants = cva(
  "flex w-full rounded-md border border-slate-300 bg-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        default: "h-10 px-3 py-2 text-sm",
        compact: "h-9 px-2.5 py-1.5 text-[12.5px]",
      },
    },
    defaultVariants: { inputSize: "default" },
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, inputSize, ...props }, ref) => {
  return <input type={type} className={cn(inputVariants({ inputSize }), className)} ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input, inputVariants };
