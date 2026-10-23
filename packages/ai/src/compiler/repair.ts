import {
  type SiteDocument,
  type StyleValue,
  type StyleUnit,
  styleUnitSchema,
} from "@builder/document";

const PROPERTIES_NEEDING_PX = new Set([
  "width",
  "minwidth",
  "maxwidth",
  "height",
  "minheight",
  "maxheight",
  "padding",
  "paddingtop",
  "paddingright",
  "paddingbottom",
  "paddingleft",
  "margin",
  "margintop",
  "marginright",
  "marginbottom",
  "marginleft",
  "top",
  "right",
  "bottom",
  "left",
  "fontsize",
  "gap",
  "rowgap",
  "columngap",
  "borderradius",
  "borderwidth",
  "letterspacing",
  "wordspacing",
]);

const CSS_KEYWORDS = new Set([
  "auto",
  "inherit",
  "initial",
  "unset",
  "none",
  "flex",
  "grid",
  "block",
  "inline",
  "inline-block",
  "inline-flex",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
  "flex-start",
  "flex-end",
  "stretch",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "row",
  "column",
  "wrap",
  "nowrap",
  "pointer",
  "default",
  "hidden",
  "visible",
  "cover",
  "contain",
  "normal",
]);

/**
 * Normalizes and repairs a single CSS property and value into the Builder StyleValue format.
 * Returns null if the value is completely unrepairable (so only that single property is dropped).
 */
export function normalizeAndRepairStyleValue(
  prop: string,
  val: unknown
): StyleValue | null {
  if (val === null || val === undefined) return null;

  const normProp = prop.toLowerCase().replace(/[-_]/g, "");

  // 1. If already an object conforming to or attempting StyleValue
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, any>;
    if ("unit" in obj && "value" in obj) {
      const u = String(obj["unit"]).toLowerCase();
      const num = Number(obj["value"]);
      const parsedUnit = styleUnitSchema.safeParse(u);
      if (parsedUnit.success && !isNaN(num)) {
        return { unit: parsedUnit.data, value: num };
      }
      // If unit was combined like "px 24px", fall back to raw
      return { raw: `${obj["value"]}${obj["unit"]}` };
    }
    if ("keyword" in obj && typeof obj["keyword"] === "string" && obj["keyword"].trim()) {
      return { keyword: obj["keyword"].trim() };
    }
    if ("token" in obj && typeof obj["token"] === "string" && obj["token"].trim()) {
      return { token: obj["token"].trim() };
    }
    if ("raw" in obj && typeof obj["raw"] === "string" && obj["raw"].trim()) {
      return { raw: obj["raw"].trim() };
    }
  }

  // 2. Numeric values
  if (typeof val === "number") {
    if (isNaN(val)) return null;
    // Check if property requires pixel units
    if (
      PROPERTIES_NEEDING_PX.has(normProp) ||
      normProp.endsWith("width") ||
      normProp.endsWith("height") ||
      normProp.endsWith("top") ||
      normProp.endsWith("bottom") ||
      normProp.endsWith("left") ||
      normProp.endsWith("right") ||
      normProp.endsWith("gap") ||
      normProp.endsWith("size") ||
      normProp.endsWith("radius")
    ) {
      return { unit: "px", value: val };
    }
    // Unitless properties (flex: 1, zIndex: 10, opacity: 0.5, lineHeight: 1.5, fontWeight: 600, etc.)
    return { raw: String(val) };
  }

  // 3. String values
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Design tokens & CSS variables
    if (
      trimmed.startsWith("token(") ||
      trimmed.startsWith("var(") ||
      trimmed.startsWith("color.") ||
      trimmed.startsWith("space.") ||
      trimmed.startsWith("radius.") ||
      trimmed.startsWith("fonts.")
    ) {
      return { raw: trimmed };
    }

    // Shorthands or multi-value strings: e.g. "16px 24px", "1 1 0%", "0 auto", "1px solid #ccc"
    if (trimmed.includes(" ") || trimmed.includes("/") || trimmed.includes(",")) {
      return { raw: trimmed };
    }

    // Single value with explicit unit: e.g. "16px", "2rem", "100%", "50vh"
    const unitMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)(px|%|rem|em|vw|vh|fr)$/i);
    if (unitMatch && unitMatch[1] && unitMatch[2]) {
      const num = parseFloat(unitMatch[1]);
      const unit = unitMatch[2].toLowerCase() as StyleUnit;
      if (!isNaN(num)) {
        return { unit, value: num };
      }
    }

    // Pure number in string format: e.g. "1", "16", "600"
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        if (PROPERTIES_NEEDING_PX.has(normProp)) {
          return { unit: "px", value: num };
        }
        return { raw: trimmed };
      }
    }

    // CSS keyword values: e.g. "flex", "center", "none", "auto"
    const lower = trimmed.toLowerCase();
    if (CSS_KEYWORDS.has(lower)) {
      return { keyword: lower };
    }

    // Colors or other valid CSS strings (e.g. #fff, rgb(...), rgba(...))
    return { raw: trimmed };
  }

  // Unsupported type
  return null;
}

/**
 * Normalizes and repairs an entire SiteDocument structure before validation:
 * - Empty / missing slugs: "/" for first/home page, slugified page name for others, unique per site.
 * - Style values: converts numbers to px where needed, parses shorthands into { raw },
 *   parses keyword values into { keyword }, drops only single invalid properties (with a warning).
 */
export function normalizeAndRepairDocument(
  doc: SiteDocument,
  options?: { onWarning?: (warning: string) => void; warnings?: string[] }
): SiteDocument {
  const warningsList = options?.warnings;
  const onWarning = options?.onWarning;
  if (!doc) return doc;

  // 1. Pages slug repair & deduplication
  if (doc.pages && typeof doc.pages === "object") {
    const pageEntries = Object.entries(doc.pages);
    const usedSlugs = new Set<string>();
    const isPlaceholder = (s: string) => {
      const trimmed = (s || "").trim().toLowerCase();
      return (
        !trimmed ||
        trimmed === "/_root_" ||
        trimmed === "_root_" ||
        trimmed === "/root" ||
        trimmed === "root"
      );
    };

    let hasHome = pageEntries.some(
      ([, p]) => (p.slug || "").trim() === "/" || isPlaceholder(p.slug)
    );

    for (let i = 0; i < pageEntries.length; i++) {
      const [, page] = pageEntries[i]!;
      let rawSlug = (page.slug || "").trim();

      if (isPlaceholder(rawSlug)) {
        if (!hasHome || i === 0 || page.name?.toLowerCase() === "home") {
          rawSlug = "/";
          hasHome = true;
        } else {
          const nameSlug = (page.name || "page")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          rawSlug = `/${nameSlug || `page-${i + 1}`}`;
        }
      } else if (page.name?.toLowerCase() === "home" && !hasHome) {
        rawSlug = "/";
        hasHome = true;
      } else if (rawSlug !== "/" && !rawSlug.startsWith("/")) {
        rawSlug = `/${rawSlug}`;
      }

      // Ensure uniqueness
      if (usedSlugs.has(rawSlug)) {
        if (rawSlug === "/") {
          let candidate = "/home";
          let counter = 2;
          while (usedSlugs.has(candidate)) {
            candidate = `/home-${counter++}`;
          }
          rawSlug = candidate;
        } else {
          let candidate = `${rawSlug}-2`;
          let counter = 3;
          while (usedSlugs.has(candidate)) {
            candidate = `${rawSlug}-${counter++}`;
          }
          rawSlug = candidate;
        }
      }

      usedSlugs.add(rawSlug);
      page.slug = rawSlug;

      // Ensure valid page name and status
      if (!page.name || !page.name.trim()) {
        page.name = rawSlug === "/" ? "Home" : rawSlug.replace(/^\//, "").replace(/-/g, " ");
      }
      if (!page.status) {
        page.status = "draft";
      }
      if (!page.seo) {
        page.seo = { title: page.name };
      } else if (!page.seo.title) {
        page.seo.title = page.name;
      }
    }
  }

  // 2. Styles normalization & repair
  if (doc.styles && typeof doc.styles === "object") {
    for (const [styleId, styleRule] of Object.entries(doc.styles)) {
      if (!styleRule || typeof styleRule !== "object") continue;
      styleRule.id = styleId;
      if (!styleRule.kind) styleRule.kind = "local";

      if (styleRule.values && typeof styleRule.values === "object") {
        for (const [bpKey, bpValues] of Object.entries(styleRule.values)) {
          if (!bpValues || typeof bpValues !== "object") continue;

          for (const stateKey of ["default", "hover", "focus", "active"] as const) {
            const decls = bpValues[stateKey];
            if (decls && typeof decls === "object") {
              const repairedDecls: Record<string, StyleValue> = {};
              for (const [prop, val] of Object.entries(decls)) {
                const repaired = normalizeAndRepairStyleValue(prop, val);
                if (repaired !== null) {
                  repairedDecls[prop] = repaired;
                } else {
                  const warnMsg = `Dropped invalid property "${prop}" in style "${styleId}" (${bpKey}.${stateKey}): ${JSON.stringify(val)}`;
                  warningsList?.push(warnMsg);
                  onWarning?.(warnMsg);
                  console.warn(
                    `[AI Repair] Dropped invalid property "${prop}" in style "${styleId}" (${bpKey}.${stateKey}):`,
                    val
                  );
                }
              }
              bpValues[stateKey] = repairedDecls;
            }
          }
        }
      }
    }
  }

  (doc as any).repairWarningsCount = warningsList ? warningsList.length : 0;
  return doc;
}
