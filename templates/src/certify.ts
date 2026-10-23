import { validateSiteDocument } from "@builder/document";
import { renderPageToStaticMarkup } from "@builder/renderer/server";
import type { TemplateDefinition, TemplateCertificationResult } from "./types.js";

/**
 * Validates and certifies a template according to Section 12.4 & spec 13.11:
 * - Valid site document schema and tree integrity
 * - No broken internal links or missing page routes
 * - Images have valid sources and accessible alt text
 * - Headings and buttons have accessible text content
 * - Static markup compilation (publish build) succeeds without errors
 */
export function certifyTemplate(template: TemplateDefinition): TemplateCertificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const doc = template.document;

  // 1. Valid schema & document structure
  const validation = validateSiteDocument(doc);
  if (!validation.valid) {
    errors.push(...validation.errors.map((e) => `[Schema] [${e.code}] ${e.path}: ${e.message}`));
  }

  // 2. Page & navigation integrity
  const pageEntries = Object.entries(doc.pages);
  if (pageEntries.length === 0) {
    errors.push("[Pages] Template must contain at least one page");
  }

  const slugs = new Set<string>();
  for (const [pageId, page] of pageEntries) {
    if (!page.slug) {
      errors.push(`[Pages] Page ${page.name} (${pageId}) is missing a slug`);
    } else if (slugs.has(page.slug)) {
      errors.push(`[Pages] Duplicate page slug: ${page.slug}`);
    } else {
      slugs.add(page.slug);
    }

    if (!doc.elements[page.rootId]) {
      errors.push(`[Pages] Page ${page.name} root element ${page.rootId} does not exist`);
    } else if (doc.elements[page.rootId]!.type !== "Body") {
      errors.push(
        `[Pages] Page ${page.name} root element must be of type 'Body', got '${doc.elements[page.rootId]!.type}'`
      );
    }
  }

  // 3. Elements check (broken links, missing assets, accessible content)
  for (const [elId, el] of Object.entries(doc.elements)) {
    // Links / href checks
    if (el.props.href && typeof el.props.href === "string") {
      const href = el.props.href;
      if (href.startsWith("/")) {
        // Internal page link (e.g. /pricing, /#features, /#)
        const path = href.split("#")[0];
        if (path && path !== "" && !slugs.has(path)) {
          errors.push(`[Links] Element '${el.name || elId}' links to non-existent page slug '${path}'`);
        }
      }
    }

    // Accessible headings
    if (el.type === "Heading") {
      if (!el.props.text || String(el.props.text).trim() === "") {
        errors.push(`[A11y] Heading element '${el.name || elId}' has empty text`);
      }
    }

    // Accessible buttons
    if (el.type === "Button") {
      if (!el.props.text || String(el.props.text).trim() === "") {
        errors.push(`[A11y] Button element '${el.name || elId}' has empty text`);
      }
    }

    // Images must have non-empty alt text and src
    if (el.type === "Image") {
      if (!el.props.src || String(el.props.src).trim() === "") {
        errors.push(`[Assets] Image element '${el.name || elId}' has missing src`);
      }
      if (!el.props.alt || String(el.props.alt).trim() === "") {
        errors.push(`[A11y] Image element '${el.name || elId}' has missing or empty alt text`);
      }
    }

    // Forms and inputs
    if (el.type === "Input") {
      if (!el.props.placeholder && !el.props.name && !el.props.label) {
        warnings.push(`[A11y] Input element '${el.name || elId}' lacks a label or placeholder`);
      }
    }
  }

  // 4. Publish build check: static markup rendering succeeds for all pages
  for (const [pageId, page] of pageEntries) {
    try {
      const { html, css } = renderPageToStaticMarkup(doc, pageId);
      if (!html || html.trim() === "") {
        errors.push(`[Publish] Rendered HTML for page '${page.name}' is empty`);
      }
      if (!css || css.trim() === "") {
        warnings.push(`[Publish] Rendered CSS for page '${page.name}' is empty`);
      }
    } catch (err: any) {
      errors.push(
        `[Publish] renderPageToStaticMarkup threw an error for page '${page.name}': ${err?.message || String(err)}`
      );
    }
  }

  // 5. SEO/A11y rule: Exactly one H1 per page in every template (the hero title)
  for (const [, page] of pageEntries) {
    const queue = [page.rootId];
    const visited = new Set<string>();
    const pageHeadingH1s: typeof doc.elements[string][] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const el = doc.elements[currentId];
      if (!el) continue;

      if (el.type === "Heading") {
        const rawLevel = el.props?.level;
        if (rawLevel === 1 || rawLevel === "1" || rawLevel === "h1") {
          pageHeadingH1s.push(el);
        }
      }

      if (el.children) {
        queue.push(...el.children);
      }
    }

    if (pageHeadingH1s.length !== 1) {
      errors.push(
        `[SEO/A11y] Page '${page.name}' (${page.slug}) must have exactly one H1 element (hero title), but found ${pageHeadingH1s.length}`
      );
    }
  }

  return {
    slug: template.slug,
    name: template.name,
    valid: errors.length === 0,
    pageCount: pageEntries.length,
    elementCount: Object.keys(doc.elements).length,
    errors,
    warnings,
  };
}

export function certifyAllTemplates(templates: TemplateDefinition[]): TemplateCertificationResult[] {
  return templates.map(certifyTemplate);
}
