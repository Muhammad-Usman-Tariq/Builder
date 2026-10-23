import type {
  Breakpoint,
  CSSDeclarations,
  DesignTokens,
  SiteDocument,
  StyleRule,
  StyleValue,
} from "@builder/document";

/**
 * Converts camelCase CSS property names to kebab-case.
 */
export function camelToKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/**
 * Compiles a single StyleValue into a valid CSS value string.
 */
export function compileStyleValue(val: StyleValue): string {
  if ("unit" in val) {
    return `${val.value}${val.unit}`;
  }
  if ("keyword" in val) {
    return val.keyword;
  }
  if ("token" in val) {
    const varName = val.token.replace(/\./g, "-");
    return `var(--${varName})`;
  }
  if ("raw" in val) {
    return val.raw;
  }
  return "";
}

/**
 * Compiles a map of CSSDeclarations to a CSS declaration block string.
 */
export function compileCSSDeclarations(decls: CSSDeclarations): string {
  const lines: string[] = [];
  for (const [prop, val] of Object.entries(decls)) {
    const cssValue = compileStyleValue(val);
    if (cssValue) {
      lines.push(`  ${camelToKebab(prop)}: ${cssValue};`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "-apple-system",
  "blinkmacsystemfont",
  "arial",
  "helvetica",
  "times",
  "times new roman",
  "georgia",
  "courier",
  "courier new",
  "inherit",
  "initial",
]);

/**
 * Generates Google Fonts stylesheet URL for non-system token fonts.
 */
export function getGoogleFontsUrl(fonts?: DesignTokens["fonts"]): string | null {
  if (!fonts) return null;
  const families = new Set<string>();

  const addFont = (name?: string) => {
    if (!name) return;
    const clean = name.split(",")[0]!.trim().replace(/['"]/g, "");
    if (clean && !SYSTEM_FONTS.has(clean.toLowerCase())) {
      families.add(clean);
    }
  };

  addFont(fonts.heading);
  addFont(fonts.body);
  if (fonts.mono) addFont(fonts.mono);

  if (families.size === 0) return null;

  const familyParams = Array.from(families)
    .sort()
    .map((fam) => `family=${fam.replace(/ /g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}

export function formatFontFamily(val: string, fallback: string): string {
  if (!val) return fallback;
  if (val.includes(",")) return val;
  return `"${val}", ${fallback}`;
}

/**
 * Compiles DesignTokens into CSS custom properties on :root.
 */
export function compileTokensToCSSVariables(tokens: DesignTokens): string {
  const vars: string[] = [];

  // Colors
  for (const [key, val] of Object.entries(tokens.colors)) {
    const varName = key.replace(/\./g, "-");
    vars.push(`  --${varName}: ${val};`);
  }

  // Fonts with fallback inheritance
  vars.push(`  --fonts-heading: ${formatFontFamily(tokens.fonts.heading, "serif")};`);
  vars.push(`  --fonts-body: ${formatFontFamily(tokens.fonts.body, "sans-serif")};`);
  if (tokens.fonts.mono) {
    vars.push(`  --fonts-mono: ${formatFontFamily(tokens.fonts.mono, "monospace")};`);
  }

  // Spacing
  for (const [key, val] of Object.entries(tokens.spacing)) {
    const varName = key.replace(/\./g, "-");
    const formatted = typeof val === "number" ? `${val}px` : val;
    vars.push(`  --${varName}: ${formatted};`);
  }

  // Radius
  for (const [key, val] of Object.entries(tokens.radius)) {
    const varName = key.replace(/\./g, "-");
    const formatted = typeof val === "number" ? `${val}px` : val;
    vars.push(`  --${varName}: ${formatted};`);
  }

  // Shadows
  for (const [key, val] of Object.entries(tokens.shadows)) {
    const varName = key.replace(/\./g, "-");
    vars.push(`  --${varName}: ${val};`);
  }

  return `:root {\n${vars.join("\n")}\n}`;
}

/**
 * Compiles a StyleRule across all breakpoints and pseudo-states.
 */
export function compileStyleRule(rule: StyleRule, breakpoints: Breakpoint[]): string {
  const className = `s_${rule.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const baseBp = breakpoints.find((b) => b.isBase) || breakpoints[0] || { id: "desktop" };

  const baseBlocks: string[] = [];
  const scopedBlocks: string[] = [];
  const mediaBlocks: string[] = [];

  // 1. Compile base breakpoint (unconstrained)
  const baseValues = rule.values[baseBp.id];
  if (baseValues) {
    for (const [state, decls] of Object.entries(baseValues)) {
      if (!decls || Object.keys(decls).length === 0) continue;
      const selector = state === "default" ? `.${className}` : `.${className}:${state}`;
      const scopedSelector =
        state === "default"
          ? `[data-breakpoint="${baseBp.id}"] .${className}, [data-breakpoint="${baseBp.id}"].${className}`
          : `[data-breakpoint="${baseBp.id}"] .${className}:${state}, [data-breakpoint="${baseBp.id}"].${className}:${state}`;
      const cssBody = compileCSSDeclarations(decls);
      if (cssBody) {
        baseBlocks.push(`${selector} {\n${cssBody}\n}`);
        scopedBlocks.push(`${scopedSelector} {\n${cssBody}\n}`);
      }
    }
  }

  // 2. Compile responsive overrides under media queries and scoped breakpoint selectors
  for (const bp of breakpoints) {
    if (bp.id === baseBp.id) continue;
    const bpValues = rule.values[bp.id];
    if (!bpValues) continue;

    const queryRules: string[] = [];
    const bpScopedRules: string[] = [];
    for (const [state, decls] of Object.entries(bpValues)) {
      if (!decls || Object.keys(decls).length === 0) continue;
      const selector = state === "default" ? `.${className}` : `.${className}:${state}`;
      const scopedSelector =
        state === "default"
          ? `[data-breakpoint="${bp.id}"] .${className}, [data-breakpoint="${bp.id}"].${className}`
          : `[data-breakpoint="${bp.id}"] .${className}:${state}, [data-breakpoint="${bp.id}"].${className}:${state}`;
      const cssBody = compileCSSDeclarations(decls);
      if (cssBody) {
        queryRules.push(`${selector} {\n${cssBody}\n}`);
        bpScopedRules.push(`${scopedSelector} {\n${cssBody}\n}`);
      }
    }

    if (queryRules.length > 0) {
      let mediaQuery = "";
      if (bp.maxWidth && bp.minWidth) {
        mediaQuery = `@media (min-width: ${bp.minWidth}px) and (max-width: ${bp.maxWidth}px)`;
      } else if (bp.maxWidth) {
        mediaQuery = `@media (max-width: ${bp.maxWidth}px)`;
      } else if (bp.minWidth) {
        mediaQuery = `@media (min-width: ${bp.minWidth}px)`;
      }

      if (mediaQuery) {
        mediaBlocks.push(`${mediaQuery} {\n${queryRules.join("\n")}\n}`);
      }
    }

    if (bpScopedRules.length > 0) {
      scopedBlocks.push(bpScopedRules.join("\n\n"));
    }
  }

  return [...baseBlocks, ...mediaBlocks, ...scopedBlocks].join("\n\n");
}

/**
 * Compiles all styles and tokens for a document into a single complete CSS string.
 */
export function compileFullCSS(doc: SiteDocument): string {
  const googleFontsUrl = getGoogleFontsUrl(doc.tokens.fonts);
  const fontImport = googleFontsUrl ? `@import url("${googleFontsUrl}");` : "";
  const tokensCSS = compileTokensToCSSVariables(doc.tokens);
  const baseTypography = [
    `html, body {`,
    `  font-family: var(--fonts-body);`,
    `}`,
    ``,
    `:where(h1, h2, h3, h4, h5, h6),`,
    `:where([data-element-type="Heading"]) {`,
    `  font-family: var(--fonts-heading);`,
    `}`,
    ``,
    `:where(p, span, li, blockquote),`,
    `:where([data-element-type="Text"], [data-element-type="RichText"]) {`,
    `  font-family: var(--fonts-body);`,
    `}`,
    ``,
    `:where(a, button, input, textarea, select),`,
    `:where([data-element-type="Button"], [data-element-type="Link"], [data-element-type="Input"], [data-element-type="Textarea"]) {`,
    `  font-family: inherit;`,
    `}`,
  ].join("\n");
  const baseResets = `:where(a[data-element-type="Button"], button[data-element-type="Button"]) {\n  text-decoration: none;\n}`;
  const rulesCSS: string[] = [];

  for (const rule of Object.values(doc.styles)) {
    const compiled = compileStyleRule(rule, doc.breakpoints);
    if (compiled) {
      rulesCSS.push(compiled);
    }
  }

  const parts = [fontImport, tokensCSS, baseTypography, baseResets, ...rulesCSS].filter(Boolean);
  return parts.join("\n\n");
}
