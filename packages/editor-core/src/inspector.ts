import type {
  SiteDocument,
  Element,
  StyleRule,
  StyleValue,
} from "@builder/document";
import { resolveMergedCSSDeclarations } from "@builder/document";
import type { BreakpointId } from "./types.js";

export interface ResolvedElementStyles {
  element: Element;
  rule: StyleRule | null;
  declarations: Record<string, StyleValue>;
}

/**
 * Returns the effective style declarations for an element at a given breakpoint and state.
 */
export function getElementEffectiveStyle(
  doc: SiteDocument,
  elementId: string,
  breakpoint: BreakpointId = "desktop",
  state: import("@builder/document").StyleState = "default"
): ResolvedElementStyles | null {
  const element = doc.elements[elementId];
  if (!element) return null;

  const styleId = element.styleIds[0];
  const rule = styleId ? doc.styles[styleId] ?? null : null;

  if (!rule) {
    return {
      element,
      rule: null,
      declarations: {},
    };
  }

  // Resolve breakpoint and state cascade
  const declarations = resolveMergedCSSDeclarations(rule, breakpoint, state);

  return {
    element,
    rule,
    declarations,
  };
}

/**
 * Common style options for inspector controls.
 */
export const DISPLAY_OPTIONS = ["block", "flex", "inline-block", "inline", "grid", "none"] as const;
export const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
export const JUSTIFY_CONTENT_OPTIONS = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;
export const ALIGN_ITEMS_OPTIONS = [
  "stretch",
  "flex-start",
  "center",
  "flex-end",
  "baseline",
] as const;
export const TEXT_ALIGN_OPTIONS = ["left", "center", "right", "justify"] as const;
export const BORDER_STYLE_OPTIONS = ["none", "solid", "dashed", "dotted", "double"] as const;
export const OVERFLOW_OPTIONS = ["visible", "hidden", "scroll", "auto"] as const;

export interface StyleCategoryDefinition {
  id: string;
  label: string;
  properties: string[];
}

export const STYLE_CATEGORIES: StyleCategoryDefinition[] = [
  {
    id: "layout",
    label: "Layout",
    properties: ["display", "flexDirection", "justifyContent", "alignItems", "gap"],
  },
  {
    id: "spacing",
    label: "Spacing",
    properties: [
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
    ],
  },
  {
    id: "size",
    label: "Size",
    properties: ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
  },
  {
    id: "typography",
    label: "Typography",
    properties: [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "color",
    ],
  },
  {
    id: "background",
    label: "Color & Background",
    properties: ["backgroundColor", "opacity"],
  },
  {
    id: "border",
    label: "Border & Radius",
    properties: ["borderWidth", "borderStyle", "borderColor", "borderRadius"],
  },
  {
    id: "shadow",
    label: "Shadow",
    properties: ["boxShadow"],
  },
];
