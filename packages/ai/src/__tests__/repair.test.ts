import { describe, it, expect } from "vitest";
import {
  normalizeAndRepairDocument,
  normalizeAndRepairStyleValue,
  compileAiSiteDocument,
} from "../index.js";
import { validateSiteDocument } from "@builder/document";

describe("A.1 AI Normalize and Repair", () => {
  describe("normalizeAndRepairStyleValue", () => {
    it("converts number to px for properties needing units", () => {
      expect(normalizeAndRepairStyleValue("padding", 16)).toEqual({
        unit: "px",
        value: 16,
      });
      expect(normalizeAndRepairStyleValue("width", 320)).toEqual({
        unit: "px",
        value: 320,
      });
      expect(normalizeAndRepairStyleValue("fontSize", 24)).toEqual({
        unit: "px",
        value: 24,
      });
      expect(normalizeAndRepairStyleValue("gap", 12)).toEqual({
        unit: "px",
        value: 12,
      });
    });

    it("converts unitless number to raw for properties that do not need units", () => {
      expect(normalizeAndRepairStyleValue("flex", 1)).toEqual({
        raw: "1",
      });
      expect(normalizeAndRepairStyleValue("opacity", 0.8)).toEqual({
        raw: "0.8",
      });
      expect(normalizeAndRepairStyleValue("zIndex", 10)).toEqual({
        raw: "10",
      });
      expect(normalizeAndRepairStyleValue("fontWeight", 600)).toEqual({
        raw: "600",
      });
    });

    it("parses shorthands and multi-value strings into { raw }", () => {
      expect(normalizeAndRepairStyleValue("padding", "16px 24px")).toEqual({
        raw: "16px 24px",
      });
      expect(normalizeAndRepairStyleValue("flex", "1 1 0%")).toEqual({
        raw: "1 1 0%",
      });
      expect(normalizeAndRepairStyleValue("margin", "0 auto")).toEqual({
        raw: "0 auto",
      });
      expect(normalizeAndRepairStyleValue("border", "1px solid #e2e8f0")).toEqual({
        raw: "1px solid #e2e8f0",
      });
    });

    it("parses standard unit strings into { unit, value }", () => {
      expect(normalizeAndRepairStyleValue("padding", "24px")).toEqual({
        unit: "px",
        value: 24,
      });
      expect(normalizeAndRepairStyleValue("width", "100%")).toEqual({
        unit: "%",
        value: 100,
      });
      expect(normalizeAndRepairStyleValue("fontSize", "1.5rem")).toEqual({
        unit: "rem",
        value: 1.5,
      });
    });

    it("parses keywords into { keyword }", () => {
      expect(normalizeAndRepairStyleValue("display", "flex")).toEqual({
        keyword: "flex",
      });
      expect(normalizeAndRepairStyleValue("alignItems", "center")).toEqual({
        keyword: "center",
      });
      expect(normalizeAndRepairStyleValue("justifyContent", "space-between")).toEqual({
        keyword: "space-between",
      });
    });

    it("repairs malformed object with combined unit like 'px 24px'", () => {
      expect(normalizeAndRepairStyleValue("padding", { value: 16, unit: "px 24px" })).toEqual({
        raw: "16px 24px",
      });
    });

    it("drops only single unrepairable property by returning null", () => {
      expect(normalizeAndRepairStyleValue("unknownProp", null)).toBeNull();
      expect(normalizeAndRepairStyleValue("unknownProp", undefined)).toBeNull();
      expect(normalizeAndRepairStyleValue("unknownProp", NaN)).toBeNull();
      expect(normalizeAndRepairStyleValue("unknownProp", "")).toBeNull();
    });
  });

  describe("normalizeAndRepairDocument", () => {
    it("fixes missing and empty slugs and ensures unique slugs per site", () => {
      const mockDoc: any = {
        schemaVersion: 1,
        site: { name: "Test", defaultLocale: "en", locales: ["en"] },
        breakpoints: [{ id: "desktop", name: "Desktop", isBase: true }],
        tokens: { colors: {}, fonts: { heading: "sans", body: "sans" }, spacing: {}, radius: {}, shadows: {} },
        pages: {
          p1: { id: "p1", name: "Home", slug: "", rootId: "el_1", seo: {}, status: "draft" },
          p2: { id: "p2", name: "About Us", slug: "", rootId: "el_2", seo: {}, status: "draft" },
          p3: { id: "p3", name: "About", slug: "/about-us", rootId: "el_3", seo: {}, status: "draft" },
          p4: { id: "p4", name: "", slug: "", rootId: "el_4", seo: {}, status: "draft" },
        },
        elements: {},
        styles: {},
        components: {},
        assets: {},
      };

      const repaired = normalizeAndRepairDocument(mockDoc);
      expect(repaired.pages["p1"]?.slug).toBe("/");
      expect(repaired.pages["p2"]?.slug).toBe("/about-us");
      // p3 had duplicate "/about-us", should be made unique
      expect(repaired.pages["p3"]?.slug).toBe("/about-us-2");
      // p4 had empty name and slug, gets unique slug
      expect(repaired.pages["p4"]?.slug).toMatch(/^\/page/);
    });

    it("fixes generated home page with slug /_root_ to exactly / and never writes placeholder values", () => {
      const mockDoc: any = {
        schemaVersion: 1,
        site: { name: "Test", defaultLocale: "en", locales: ["en"] },
        breakpoints: [{ id: "desktop", name: "Desktop", isBase: true }],
        tokens: { colors: {}, fonts: { heading: "sans", body: "sans" }, spacing: {}, radius: {}, shadows: {} },
        pages: {
          p1: { id: "p1", name: "Home", slug: "/_root_", rootId: "el_1", seo: {}, status: "draft" },
          p2: { id: "p2", name: "Contact", slug: "/contact", rootId: "el_2", seo: {}, status: "draft" },
        },
        elements: {},
        styles: {},
        components: {},
        assets: {},
      };

      const repaired = normalizeAndRepairDocument(mockDoc);
      expect(repaired.pages["p1"]?.slug).toBe("/");
      expect(repaired.pages["p2"]?.slug).toBe("/contact");
    });

    it("repairs style rules containing raw numbers and shorthands from AI logs", () => {
      const mockDoc: any = {
        schemaVersion: 1,
        site: { name: "Test", defaultLocale: "en", locales: ["en"] },
        breakpoints: [{ id: "desktop", name: "Desktop", isBase: true }],
        tokens: { colors: {}, fonts: { heading: "sans", body: "sans" }, spacing: {}, radius: {}, shadows: {} },
        pages: {
          p1: { id: "p1", name: "Home", slug: "/", rootId: "el_1", seo: {}, status: "draft" },
        },
        elements: {},
        styles: {
          s1: {
            id: "s1",
            kind: "local",
            values: {
              desktop: {
                default: {
                  padding: "16px 24px",
                  flex: 1,
                  flexShrink: "1 1 0%",
                  gap: 16,
                  color: "#333333",
                  invalidItem: null,
                },
              },
            },
          },
        },
        components: {},
        assets: {},
      };

      const repaired = normalizeAndRepairDocument(mockDoc);
      const decls = repaired.styles["s1"]?.values["desktop"]?.default!;
      expect(decls["padding"]).toEqual({ raw: "16px 24px" });
      expect(decls["flex"]).toEqual({ raw: "1" });
      expect(decls["flexShrink"]).toEqual({ raw: "1 1 0%" });
      expect(decls["gap"]).toEqual({ unit: "px", value: 16 });
      expect(decls["color"]).toEqual({ raw: "#333333" });
      // Invalid item was dropped
      expect(decls["invalidItem"]).toBeUndefined();
    });
  });

  describe("compileAiSiteDocument with real problem cases from worker log", () => {
    it("successfully compiles and repairs a multi-page plan with empty slugs and style shorthands", () => {
      const plan = {
        brief: {
          businessType: "Modern Architecture Firm",
          audience: "Homeowners",
          tone: "Sophisticated",
          goals: ["Showcase Portfolio", "Generate Leads"],
          primaryColorName: "Charcoal",
        },
        theme: {
          colors: {
            primary: "#1a1a1a",
            secondary: "#4a4a4a",
            background: "#ffffff",
            surface: "#f5f5f5",
            text: "#111111",
            muted: "#777777",
            border: "#e0e0e0",
            accent: "#c5a880",
          },
          fonts: {
            heading: "Playfair Display",
            body: "Inter",
          },
          spacing: 8,
          radius: 4,
        },
        pages: [
          {
            name: "Home",
            slug: "", // AI left slug empty!
            title: "Architectural Studio",
            description: "Modern bespoke designs",
            sections: [
              { name: "Hero", purpose: "Lead section", layout: "hero" as const },
            ],
          },
          {
            name: "Portfolio",
            slug: "", // AI left secondary slug empty!
            title: "Selected Works",
            description: "Our projects",
            sections: [
              { name: "Gallery", purpose: "Projects showcase", layout: "gallery" as const },
            ],
          },
        ],
      };

      const heroSection = {
        name: "Hero",
        purpose: "Welcome",
        tree: {
          type: "Section" as const,
          name: "Hero Section",
          style: {
            padding: "16px 24px", // Shorthand!
            flex: 1, // Number on flex!
            minHeight: "80vh",
          },
          children: [
            {
              type: "Heading" as const,
              level: 1,
              text: "Building the Future",
              style: {
                fontSize: 48, // Number needing px!
                color: "#1a1a1a",
              },
            },
            {
              type: "Button" as const,
              text: "View Projects",
              style: {
                padding: "12px 24px",
                borderRadius: 4,
              },
            },
          ],
        },
      };

      const gallerySection = {
        name: "Gallery",
        purpose: "Showcase",
        tree: {
          type: "Section" as const,
          name: "Gallery Section",
          style: {
            padding: "32px 16px",
            display: "flex",
            flex: "1 1 0%", // Shorthand flex!
          },
          children: [
            {
              type: "Heading" as const,
              level: 2,
              text: "Featured Works",
            },
          ],
        },
      };

      const doc = compileAiSiteDocument({
        siteName: "Modern Architecture Firm",
        plan,
        pageSections: {
          "": [heroSection],
          "/portfolio": [gallerySection],
        },
      });

      // Verify validation passes 100%
      const val = validateSiteDocument(doc);
      expect(val.valid).toBe(true);

      // Verify slugs were repaired correctly
      const pages = Object.values(doc.pages);
      expect(pages).toHaveLength(2);
      expect(pages.find((p) => p.name === "Home")?.slug).toBe("/");
      expect(pages.find((p) => p.name === "Portfolio")?.slug).toBe("/portfolio");

      // Verify style values were converted properly
      const heroStyle = Object.values(doc.styles).find((s) => s.name?.includes("Hero Section"));
      expect(heroStyle).toBeDefined();
      expect(heroStyle?.values["desktop"]?.default?.["padding"]).toEqual({ raw: "16px 24px" });
      expect(heroStyle?.values["desktop"]?.default?.["flex"]).toEqual({ raw: "1" });
    });
  });
});
