"use client";

// Hazard picker for HIRA entries: a shadcn combobox (Popover + Command) over the
// hazard master library, so a hazard is chosen from the list instead of typed.
// Search matches name, code, category and description; results are grouped by
// category. Hazards already on the activity show a tick and can't be picked
// twice (an entry holds each library hazard once).

import * as React from "react";
import { Check, ChevronsUpDown, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";

export type LibraryHazard = {
  id: string;
  code: string;
  category: string;
  name: string;
  description?: string | null;
  requiresPermit?: boolean;
  permitTypes?: string[] | null;
  factoriesActSection?: string | null;
};

export function hazardCategoryLabel(category: string) {
  const s = (category ?? "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Props = {
  hazards: LibraryHazard[];
  /** Hazards already on the activity: ticked, not selectable again. */
  selectedIds?: string[];
  /** The hazard this picker currently shows (when it changes an existing row). */
  value?: string | null;
  onSelect: (hazard: LibraryHazard) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** "row" renders the current hazard as the trigger; "add" renders an add button. */
  mode?: "row" | "add";
};

export function HazardCombobox({
  hazards,
  selectedIds = [],
  value = null,
  onSelect,
  placeholder = "Select a hazard from the library",
  disabled = false,
  className,
  mode = "add"
}: Props) {
  const [open, setOpen] = React.useState(false);
  const taken = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const current = value ? hazards.find((h) => h.id === value) ?? null : null;

  const groups = React.useMemo(() => {
    const byCat = new Map<string, LibraryHazard[]>();
    for (const h of hazards) {
      const list = byCat.get(h.category) ?? [];
      list.push(h);
      byCat.set(h.category, list);
    }
    return Array.from(byCat.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, list]) => [cat, list.sort((x, y) => x.name.localeCompare(y.name))] as const);
  }, [hazards]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || hazards.length === 0}
          className={cn("h-auto min-h-10 w-full justify-between gap-2 text-left font-normal", className)}
        >
          {mode === "row" && current ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-slate-900">{current.name}</span>
              <span className="truncate text-xs text-slate-500">
                {hazardCategoryLabel(current.category)} · {current.code}
              </span>
            </span>
          ) : (
            <span className="truncate text-slate-500">
              {hazards.length === 0 ? "Hazard library is not available" : placeholder}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[22rem] p-0">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-500">
          <CommandInput placeholder="Search by name, code, category or description" />
          <CommandList>
            <CommandEmpty>No hazard in the library matches.</CommandEmpty>
            {groups.map(([cat, list]) => (
              <CommandGroup key={cat} heading={hazardCategoryLabel(cat)}>
                {list.map((h) => {
                  const isCurrent = h.id === value;
                  const isTaken = taken.has(h.id) && !isCurrent;
                  return (
                    <CommandItem
                      key={h.id}
                      value={h.id}
                      keywords={[h.name, h.code, hazardCategoryLabel(h.category), h.description ?? ""]}
                      disabled={isTaken}
                      onSelect={() => {
                        if (!isCurrent) onSelect(h);
                        setOpen(false);
                      }}
                      className="items-start"
                    >
                      <Check
                        className={cn("mt-0.5 h-4 w-4 shrink-0", isCurrent || isTaken ? "opacity-100" : "opacity-0")}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{h.name}</span>
                          {h.requiresPermit && (
                            <Badge className="border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                              <ShieldAlert className="h-3 w-3" /> Permit
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-xs text-slate-500">
                          {h.code}
                          {h.description ? ` · ${h.description}` : ""}
                        </span>
                      </span>
                      {isTaken && <span className="shrink-0 text-[11px] text-slate-400">Added</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
