import { describe, it, expect } from "vitest";
import { compileAiSiteDocument } from "../compiler/index.js";
import { validateSiteDocument } from "@builder/document";
import type { AiSitePlan, AiSection } from "../schema/ai-tree.js";

describe("AI Tree Compiler to SiteDocument", () => {
  it("compiles multi-page AI plan and sections into a fully valid SiteDocument", () => {
    const mockPlan: AiSitePlan = {
      brief: {
        businessType: "Design Studio",
        audience: "Startups & tech companies",
        tone: "Bold, modern, minimal",
        goals: ["Showcase work", "Contact inquiries"],
        primaryColorName: "Electric Indigo",
      },
      theme: {
        colors: {
          primary: "#4f46e5",
          secondary: "#312e81",
          background: "#ffffff",
          surface: "#f8fafc",
          text: "#0f172a",
          muted: "#64748b",
          border: "#e2e8f0",
          accent: "#6366f1",
        },
        fonts: {
          heading: "Plus Jakarta Sans",
          body: "Inter",
        },
        spacing: 8,
        radius: 8,
      },
      pages: [
        {
          name: "Home",
          slug: "/",
          title: "Apex Creative Design Studio",
          description: "High impact digital product design",
          sections: [
            { name: "Hero", purpose: "Studio intro", layout: "hero" },
            { name: "Work", purpose: "Portfolio grid", layout: "gallery" },
          ],
        },
        {
          name: "Contact",
          slug: "/contact",
          title: "Get in Touch with Apex",
          description: "Start a project with our team",
          sections: [
            { name: "Contact Form", purpose: "Project inquiry form", layout: "contact" },
          ],
        },
      ],
    };

    const mockHomeHero: AiSection = {
      name: "Hero",
      purpose: "Studio intro",
      tree: {
        type: "Section",
        name: "Hero Section",
        style: { padding: "80px", backgroundColor: "#f8fafc" },
        children: [
          {
            type: "Heading",
            level: 1,
            text: "We Build Category-Defining Brands",
            style: { color: "#0f172a", fontSize: "56px" },
          },
          {
            type: "Text",
            text: "Award-winning strategy, identity, and digital product experiences.",
            style: { color: "#64748b", fontSize: "18px" },
          },
          {
            type: "Button",
            text: "Explore Work",
            href: "/#work",
            variant: "primary",
          },
        ],
      },
    };

    const mockHomeWork: AiSection = {
      name: "Work",
      purpose: "Portfolio grid",
      tree: {
        type: "Section",
        name: "Work Gallery",
        children: [
          {
            type: "Heading",
            level: 2,
            text: "Selected Projects",
          },
          {
            type: "Image",
            src: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8",
            alt: "Fintech App UI Design",
          },
        ],
      },
    };

    const mockContactForm: AiSection = {
      name: "Contact Form",
      purpose: "Project inquiry form",
      tree: {
        type: "Section",
        name: "Contact Section",
        children: [
          {
            type: "Heading",
            level: 2,
            text: "Let's Build Something Together",
          },
          {
            type: "Form",
            name: "Inquiry Form",
            children: [
              { type: "Input", nameProp: "name", placeholder: "Your Name" },
              { type: "Input", nameProp: "email", placeholder: "work@company.com" },
              { type: "Textarea", nameProp: "message", placeholder: "Tell us about your project..." },
              { type: "Submit", text: "Send Message" },
            ],
          },
        ],
      },
    };

    const compiledDoc = compileAiSiteDocument({
      siteName: "Apex Design Studio",
      plan: mockPlan,
      pageSections: {
        "/": [mockHomeHero, mockHomeWork],
        "/contact": [mockContactForm],
      },
    });

    // 1. Verify Structure
    expect(compiledDoc.schemaVersion).toBe(1);
    expect(Object.keys(compiledDoc.pages).length).toBe(2);

    // 2. Verify Home Page Root and Hierarchy
    const homePage = Object.values(compiledDoc.pages).find((p) => p.slug === "/");
    expect(homePage).toBeDefined();
    const homeBody = compiledDoc.elements[homePage!.rootId];
    expect(homeBody).toBeDefined();
    expect(homeBody?.type).toBe("Body");
    expect(homeBody?.children.length).toBe(2); // Hero + Work sections

    // 3. Verify Elements and Style Rules
    const heroSecId = homeBody!.children[0]!;
    const heroEl = compiledDoc.elements[heroSecId];
    expect(heroEl?.type).toBe("Section");
    expect(heroEl?.origin).toBe("ai");
    expect(heroEl?.children.length).toBe(3); // Heading, Text, Button

    const headingId = heroEl!.children[0]!;
    const headingEl = compiledDoc.elements[headingId];
    expect(headingEl?.type).toBe("Heading");
    expect(headingEl?.props["text"]).toBe("We Build Category-Defining Brands");

    // 4. Verify Tokens
    expect(compiledDoc.tokens.fonts.heading).toBe("Plus Jakarta Sans");
    expect(compiledDoc.tokens.colors["color.primary"]).toBe("#4f46e5");

    // 5. Semantic Document Validation
    const validation = validateSiteDocument(compiledDoc);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("extracts business name from prompt accurately", async () => {
    const { extractBusinessNameFromPrompt } = await import("../pipelines/generate.js");
    expect(extractBusinessNameFromPrompt('Create a site for "Bloom & Petal"')).toBe("Bloom & Petal");
    expect(extractBusinessNameFromPrompt("Create a website for Bloom & Petal, an artisanal florist in Paris")).toBe("Bloom & Petal");
    expect(extractBusinessNameFromPrompt("Website for Bloom & Petal.")).toBe("Bloom & Petal");
    expect(extractBusinessNameFromPrompt("Artisanal bakery called 'Golden Crust' with online orders")).toBe("Golden Crust");
    expect(extractBusinessNameFromPrompt("Modern portfolio site")).toBe(null);
  });

  it("enforces business name on navbar brandText, footer, page titles, and site.name", () => {
    const plan: AiSitePlan = {
      brief: {
        businessName: "Bloom & Petal",
        businessType: "Florist",
        audience: "Flower enthusiasts",
        tone: "Elegant",
        goals: ["Sell flowers"],
        primaryColorName: "Rose",
      },
      theme: {
        colors: {
          primary: "#111111", secondary: "#222222", background: "#ffffff",
          surface: "#fafafa", text: "#000000", muted: "#888888", border: "#e0e0e0", accent: "#ff0000",
        },
        fonts: { heading: "Cormorant Garamond", body: "Inter" },
        spacing: 8,
        radius: 8,
      },
      pages: [
        {
          name: "Home",
          slug: "/",
          title: "Luxury Floral Design",
          description: "Fresh flowers daily",
          sections: [{ name: "Hero", purpose: "Intro", layout: "hero" }],
        },
      ],
    };

    const homeSec: AiSection = {
      name: "Hero",
      purpose: "Intro",
      tree: {
        type: "Section",
        children: [
          {
            type: "Navbar",
            brandText: "Maison des Fleurs", // hallucinated name to be corrected
          },
          {
            type: "Text",
            text: "Welcome to Maison des Fleurs. © 2024 Maison des Fleurs",
          },
        ],
      },
    };

    const doc = compileAiSiteDocument({
      siteName: "Bloom & Petal",
      plan,
      pageSections: { "/": [homeSec] },
    });

    expect(doc.site.name).toBe("Bloom & Petal");
    const navbar = Object.values(doc.elements).find((e) => e.type === "Navbar");
    expect(navbar?.props["brandText"]).toBe("Bloom & Petal");
    const footerText = Object.values(doc.elements).find((e) => e.type === "Text");
    expect(footerText?.props["text"]).toContain("Bloom & Petal");
    expect(footerText?.props["text"]).not.toContain("Maison des Fleurs");
    const homePage = Object.values(doc.pages).find((p) => p.slug === "/");
    expect(homePage?.seo.title).toContain("Bloom & Petal");
  });
});
