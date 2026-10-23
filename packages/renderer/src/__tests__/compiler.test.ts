import { describe, it, expect } from "vitest";
import {
  compileTokensToCSSVariables,
  compileStyleValue,
  compileCSSDeclarations,
  compileStyleRule,
  compileFullCSS,
} from "../index.js";
import { DEFAULT_TOKENS, DEFAULT_BREAKPOINTS, createBlankDocument, type StyleRule } from "@builder/document";

describe("Style Compiler", () => {
  it("compileStyleValue converts tokens, units, keywords, and raw strings", () => {
    expect(compileStyleValue({ unit: "px", value: 16 })).toBe("16px");
    expect(compileStyleValue({ unit: "%", value: 100 })).toBe("100%");
    expect(compileStyleValue({ keyword: "flex" })).toBe("flex");
    expect(compileStyleValue({ token: "color.primary" })).toBe("var(--color-primary)");
    expect(compileStyleValue({ raw: "1px solid red" })).toBe("1px solid red");
  });

  it("compileCSSDeclarations formats declarations with kebab-case", () => {
    const css = compileCSSDeclarations({
      backgroundColor: { keyword: "white" },
      minHeight: { unit: "vh", value: 100 },
      fontSize: { unit: "px", value: 18 },
    });

    expect(css).toContain("  background-color: white;");
    expect(css).toContain("  min-height: 100vh;");
    expect(css).toContain("  font-size: 18px;");
  });

  it("compileTokensToCSSVariables compiles design tokens to :root variables", () => {
    const css = compileTokensToCSSVariables(DEFAULT_TOKENS);

    expect(css).toContain(":root {");
    expect(css).toContain("--color-primary: #0f172a;");
    expect(css).toContain("--color-background: #ffffff;");
    expect(css).toContain("--fonts-heading: Inter, sans-serif;");
    expect(css).toContain("--space-4: 16px;");
    expect(css).toContain("--radius-md: 8px;");
  });

  it("compileStyleRule compiles base styles and media queries for breakpoints", () => {
    const rule: StyleRule = {
      id: "hero_btn",
      kind: "local",
      values: {
        desktop: {
          default: {
            padding: { unit: "px", value: 16 },
            color: { token: "color.primary" },
          },
          hover: {
            color: { keyword: "blue" },
          },
        },
        tablet: {
          default: {
            padding: { unit: "px", value: 12 },
          },
        },
        mobile: {
          default: {
            padding: { unit: "px", value: 8 },
            width: { unit: "%", value: 100 },
          },
        },
      },
    };

    const css = compileStyleRule(rule, DEFAULT_BREAKPOINTS);

    // Desktop base selector
    expect(css).toContain(".s_hero_btn {");
    expect(css).toContain("  padding: 16px;");
    expect(css).toContain("  color: var(--color-primary);");

    // Hover state
    expect(css).toContain(".s_hero_btn:hover {");
    expect(css).toContain("  color: blue;");

    // Tablet media query
    expect(css).toContain("@media (min-width: 768px) and (max-width: 1023px) {");
    expect(css).toContain("  padding: 12px;");

    // Mobile media query
    expect(css).toContain("@media (max-width: 767px) {");
    expect(css).toContain("  padding: 8px;");
    expect(css).toContain("  width: 100%;");

    // Scoped breakpoint selectors for active canvas viewports
    expect(css).toContain('[data-breakpoint="desktop"] .s_hero_btn');
    expect(css).toContain('[data-breakpoint="tablet"] .s_hero_btn');
    expect(css).toContain('[data-breakpoint="mobile"] .s_hero_btn');
  });

  it("compileFullCSS bundles tokens and rules into single stylesheet", () => {
    const doc = createBlankDocument();
    const css = compileFullCSS(doc);

    expect(css).toContain(":root {");
    expect(css).toMatch(/\.s_style/);
  });

  it("Batch F.2: ensures Button elements have text-decoration: none by default unless styled so", () => {
    const doc = createBlankDocument();
    const css = compileFullCSS(doc);

    // Default base reset is included with :where selector
    expect(css).toContain(':where(a[data-element-type="Button"], button[data-element-type="Button"]) {');
    expect(css).toContain("text-decoration: none;");
  });

  it("Item 2: loads Google Fonts url and includes base typography inheritance rules", () => {
    const doc = createBlankDocument();
    doc.tokens.fonts = {
      heading: "Playfair Display",
      body: "Plus Jakarta Sans",
      mono: "monospace",
    };
    const css = compileFullCSS(doc);

    expect(css).toContain('@import url("https://fonts.googleapis.com/css2?');
    expect(css).toContain("family=Playfair+Display");
    expect(css).toContain("family=Plus+Jakarta+Sans");
    expect(css).toContain("html, body {\n  font-family: var(--fonts-body);\n}");
    expect(css).toContain(':where(h1, h2, h3, h4, h5, h6),\n:where([data-element-type="Heading"]) {\n  font-family: var(--fonts-heading);\n}');
    expect(css).toContain(':where(p, span, li, blockquote),\n:where([data-element-type="Text"], [data-element-type="RichText"]) {\n  font-family: var(--fonts-body);\n}');
    expect(css).toContain(':where(a, button, input, textarea, select),\n:where([data-element-type="Button"], [data-element-type="Link"], [data-element-type="Input"], [data-element-type="Textarea"]) {\n  font-family: inherit;\n}');
  });
});
