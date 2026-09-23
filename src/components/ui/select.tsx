"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Select (Radix). The primitive parts below are the stock shadcn
 * API. `Select` itself keeps the value/onChange/name/required contract every
 * form in the app was written against, so a screen reads:
 *
 *   <Select value={v} onChange={(e) => setV(e.target.value)}>
 *     <SelectItem value="">All plants</SelectItem>
 *     <SelectItem value="a">Plant A</SelectItem>
 *   </Select>
 *
 * and renders a Radix listbox. Radix forbids an empty-string item value, so ""
 * is encoded to a sentinel on the way in and decoded on the way out; callers
 * never see it. A disabled "" item becomes the trigger placeholder.
 */

const EMPTY = "__select_empty__";
const enc = (v: string) => (v === "" ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? "" : v);

const SelectRoot = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm ring-offset-background data-[placeholder]:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-[60] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-xs font-semibold text-slate-500", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

/* ------------------------------------------------------------------------ */
/* Form-contract Select                                                      */
/* ------------------------------------------------------------------------ */

type ParsedItem = { kind: "item"; value: string; label: React.ReactNode; disabled?: boolean; key: React.Key };
type ParsedGroup = { kind: "group"; label: React.ReactNode; items: ParsedItem[]; key: React.Key };
type Parsed = ParsedItem | ParsedGroup;

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

function parseChildren(children: React.ReactNode, prefix = ""): Parsed[] {
  const out: Parsed[] = [];
  React.Children.forEach(children, (child, i) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
      hidden?: boolean;
      label?: React.ReactNode;
    };
    const key = `${prefix}${child.key ?? i}`;
    if (child.type === React.Fragment) {
      out.push(...parseChildren(props.children, `${key}/`));
    } else if (child.type === SelectItem || child.type === "option") {
      if (props.hidden && props.value !== "" && props.value !== undefined) return;
      const value = props.value !== undefined ? String(props.value) : textOf(props.children);
      out.push({ kind: "item", value, label: props.children, disabled: props.disabled || props.hidden, key });
    } else if (child.type === SelectGroup || child.type === "optgroup") {
      // <SelectGroup><SelectLabel>Heading</SelectLabel>…items…</SelectGroup>
      let label: React.ReactNode = props.label;
      React.Children.forEach(props.children, (c) => {
        if (React.isValidElement(c) && c.type === SelectLabel) label = (c.props as { children?: React.ReactNode }).children;
      });
      const items = parseChildren(props.children, `${key}/`).flatMap((p) => (p.kind === "item" ? [p] : p.items));
      out.push({ kind: "group", label, items, key });
    }
  });
  return out;
}

/** Minimal event shape handed to `onChange` — mirrors what callers read off a native change event. */
export type SelectChangeEvent = {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
};

export interface SelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  onValueChange?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  title?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  children?: React.ReactNode;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onValueChange,
      name,
      id,
      required,
      disabled,
      placeholder,
      className,
      contentClassName,
      children,
      ...triggerProps
    },
    ref
  ) => {
    const parsed = React.useMemo(() => parseChildren(children), [children]);
    const flat = React.useMemo(
      () => parsed.flatMap((p) => (p.kind === "item" ? [p] : p.items)),
      [parsed]
    );

    // A disabled/hidden "" option is the classic "-- Select --" prompt: show it
    // as the placeholder, not as a pickable row.
    const promptItem = flat.find((it) => it.value === "" && it.disabled);
    const resolvedPlaceholder = placeholder ?? (promptItem ? textOf(promptItem.label) : undefined);

    const isControlled = value !== undefined && value !== null;
    // Native <select> with no value selects its first option.
    const firstValue = flat.find((it) => !it.disabled)?.value ?? "";
    const [inner, setInner] = React.useState<string>(
      defaultValue !== undefined ? String(defaultValue) : promptItem ? "" : firstValue
    );
    const current = isControlled ? String(value) : inner;

    const hasEnabledEmpty = flat.some((it) => it.value === "" && !it.disabled);
    const radixValue = current === "" ? (hasEnabledEmpty ? EMPTY : "") : current;

    const handleChange = (raw: string) => {
      const next = dec(raw);
      const target = { value: next, name };
      if (!isControlled) setInner(next);
      onValueChange?.(next);
      if (onChange) {
        onChange({ target, currentTarget: target });
        // Callers occasionally reset an uncontrolled picker with `e.target.value = ""`.
        if (!isControlled && target.value !== next) setInner(target.value);
      }
    };

    const renderItem = (it: ParsedItem) =>
      it.value === "" && it.disabled ? null : (
        <SelectItem key={it.key} value={enc(it.value)} disabled={it.disabled}>
          {it.label}
        </SelectItem>
      );

    return (
      <>
        <SelectRoot value={radixValue} onValueChange={handleChange} disabled={disabled}>
          <SelectTrigger ref={ref} id={id} className={className} {...triggerProps}>
            <SelectValue placeholder={resolvedPlaceholder} />
          </SelectTrigger>
          <SelectContent className={contentClassName}>
            {parsed.map((p) =>
              p.kind === "item" ? (
                renderItem(p)
              ) : (
                <SelectGroup key={p.key}>
                  <SelectLabel>{p.label}</SelectLabel>
                  {p.items.map(renderItem)}
                </SelectGroup>
              )
            )}
          </SelectContent>
        </SelectRoot>
        {name !== undefined || required ? (
          // Carries the decoded value into FormData and native `required`
          // validation, which a Radix trigger button cannot take part in.
          <input
            tabIndex={-1}
            aria-hidden
            name={name}
            required={required}
            disabled={disabled}
            value={current}
            onChange={() => {}}
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          />
        ) : null}
      </>
    );
  }
);
Select.displayName = "Select";

export {
  Select,
  SelectRoot,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
