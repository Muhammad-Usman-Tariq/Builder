import type { CSSDeclarations, StyleRule, StyleState, StyleValue } from "../types/index.js";

/**
 * Breakpoint fallback order from smallest to base.
 * Section 5.2: Reading walks: mobile -> tablet -> desktop. First value found wins.
 */
export const CASCADE_HIERARCHY: Record<string, string[]> = {
  mobile: ["mobile", "tablet", "desktop"],
  tablet: ["tablet", "desktop"],
  desktop: ["desktop"],
};

/**
 * Resolves a single CSS property for a style rule at a given breakpoint and state,
 * cascading down to broader breakpoints if not explicitly defined.
 */
export function resolveCascadedProperty(
  rule: StyleRule,
  property: string,
  breakpointId: string,
  state: StyleState = "default"
): StyleValue | undefined {
  const cascadeOrder = CASCADE_HIERARCHY[breakpointId] || [breakpointId, "desktop"];

  for (const bp of cascadeOrder) {
    const bpValues = rule.values[bp];
    if (!bpValues) continue;

    const stateValues = bpValues[state];
    if (stateValues && property in stateValues) {
      return stateValues[property];
    }

    // If state is not default (e.g. 'hover'), and not found on state at this breakpoint,
    // fallback to default state at the SAME breakpoint before cascading down
    if (state !== "default" && bpValues.default && property in bpValues.default) {
      return bpValues.default[property];
    }
  }

  return undefined;
}

/**
 * Computes the full merged CSSDeclarations for a style rule at a given breakpoint and state,
 * applying cascade inheritance: desktop (base) -> tablet -> mobile.
 */
export function resolveMergedCSSDeclarations(
  rule: StyleRule,
  breakpointId: string,
  state: StyleState = "default"
): CSSDeclarations {
  const merged: CSSDeclarations = {};
  const cascadeOrder = (CASCADE_HIERARCHY[breakpointId] || ["desktop"]).slice().reverse();
  // Reverse order: ['desktop', 'tablet', 'mobile'] so more specific breakpoints override base

  for (const bp of cascadeOrder) {
    const bpValues = rule.values[bp];
    if (!bpValues) continue;

    // Apply default state first if state is not default
    if (state !== "default" && bpValues.default) {
      Object.assign(merged, bpValues.default);
    }

    // Apply target state
    const stateValues = bpValues[state];
    if (stateValues) {
      Object.assign(merged, stateValues);
    }
  }

  return merged;
}

/**
 * Merges declarations from multiple style rules in order (e.g. shared classes first, local style last).
 */
export function resolveElementStyles(
  rules: StyleRule[],
  breakpointId: string,
  state: StyleState = "default"
): CSSDeclarations {
  const result: CSSDeclarations = {};
  for (const rule of rules) {
    const decls = resolveMergedCSSDeclarations(rule, breakpointId, state);
    Object.assign(result, decls);
  }
  return result;
}
