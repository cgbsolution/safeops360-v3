// Pure normalisation for `visible_if`, extracted from the rule-builder
// component so it can be asserted directly by the parity test.
//
// The round-trip these two functions define is what keeps Builder-authored and
// hand-authored config byte-identical: a single condition is emitted as a bare
// clause, exactly as a human would write it, and only becomes a
// {combinator, rules} group once there is more than one. If `fromEditable`
// always wrapped, every Builder form would differ from its hand-authored twin
// by one redundant layer — behaviourally identical, but no longer the same
// configuration, which is precisely the drift §0 forbids.

import type { Condition } from "../types";

export type Clause = Extract<Condition, { field: string }>;
export type Group = Extract<Condition, { rules: Condition[] }>;

export function isGroup(c: Condition | undefined): c is Group {
  return !!c && "rules" in c;
}

export function toEditable(cond: Condition | undefined): {
  combinator: "AND" | "OR";
  rules: Clause[];
} {
  if (!cond) return { combinator: "AND", rules: [] };
  if (isGroup(cond)) {
    return {
      combinator: cond.combinator ?? "AND",
      // A nested group is dropped rather than flattened: flattening
      // `A AND (B OR C)` into `A AND B OR C` would change what the rule means.
      rules: (cond.rules ?? []).filter((r): r is Clause => !isGroup(r))
    };
  }
  return { combinator: "AND", rules: [cond] };
}

export function fromEditable(
  combinator: "AND" | "OR",
  rules: Clause[]
): Condition | undefined {
  const usable = rules.filter((r) => r.field && r.operator);
  if (usable.length === 0) return undefined;
  if (usable.length === 1 && combinator === "AND") return usable[0];
  return { combinator, rules: usable };
}
