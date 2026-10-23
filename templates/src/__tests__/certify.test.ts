import { describe, it, expect } from "vitest";
import { TEMPLATES, getTemplatesByCategory } from "../index.js";
import { certifyTemplate } from "../certify.js";
import { instantiateTemplateDocument, validateSiteDocument } from "@builder/document";
import { renderPageToStaticMarkup } from "@builder/renderer/server";

describe("Milestone M8: Templates Certification", () => {
  it("contains exactly 5 production prototype templates", () => {
    expect(TEMPLATES.length).toBe(5);
    const slugs = TEMPLATES.map((t) => t.slug);
    expect(slugs).toContain("saas-landing");
    expect(slugs).toContain("agency-portfolio");
    expect(slugs).toContain("restaurant-cafe");
    expect(slugs).toContain("ecommerce-showcase");
    expect(slugs).toContain("creator-blog");
  });

  for (const template of TEMPLATES) {
    describe(`Template: ${template.name} (${template.slug})`, () => {
      it("passes the complete certification check", () => {
        const cert = certifyTemplate(template);
        if (!cert.valid) {
          console.error(`Certification errors for ${template.slug}:`, cert.errors);
        }
        expect(cert.errors).toEqual([]);
        expect(cert.valid).toBe(true);
        expect(cert.pageCount).toBeGreaterThanOrEqual(2);
        expect(cert.elementCount).toBeGreaterThan(10);
      });

      it("validates semantic document structure", () => {
        const validation = validateSiteDocument(template.document);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });

      it("compiles static markup and CSS for all pages cleanly", () => {
        for (const [pageId] of Object.entries(template.document.pages)) {
          const { html, css } = renderPageToStaticMarkup(template.document, pageId);
          expect(html).toBeTruthy();
          expect(html).toContain("<");
          expect(css).toBeTruthy();
        }
      });

      it("enforces exactly one H1 per page across all pages (Batch F.1 hero title)", () => {
        for (const [, page] of Object.entries(template.document.pages)) {
          const queue = [page.rootId];
          const visited = new Set<string>();
          const h1s: any[] = [];
          while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            const el = template.document.elements[currentId];
            if (!el) continue;
            if (el.type === "Heading" && (el.props?.level === 1 || el.props?.level === "1")) {
              h1s.push(el);
            }
            if (el.children) queue.push(...el.children);
          }
          expect(h1s.length).toBe(1);
        }
      });

      it("can be cloned and instantiated into a brand new site with unique IDs", () => {
        const newSite = instantiateTemplateDocument(template.document, {
          siteName: `Custom ${template.name}`,
          brandTokens: {
            colors: {
              "color.primary": "#ec4899",
            },
          },
        });

        expect(newSite.site.name).toBe(`Custom ${template.name}`);
        expect(newSite.tokens.colors["color.primary"]).toBe("#ec4899");

        // Zero overlapping element IDs
        const originalElIds = new Set(Object.keys(template.document.elements));
        for (const newElId of Object.keys(newSite.elements)) {
          expect(originalElIds.has(newElId)).toBe(false);
        }

        // Validate cloned document
        const validation = validateSiteDocument(newSite);
        expect(validation.valid).toBe(true);
      });
    });
  }

  it("filters templates by category", () => {
    const saas = getTemplatesByCategory("SaaS");
    expect(saas.length).toBe(1);
    expect(saas[0]!.slug).toBe("saas-landing");

    const all = getTemplatesByCategory("All");
    expect(all.length).toBe(5);

    const nonExistent = getTemplatesByCategory("NonExistent");
    expect(nonExistent.length).toBe(0);
  });
});
