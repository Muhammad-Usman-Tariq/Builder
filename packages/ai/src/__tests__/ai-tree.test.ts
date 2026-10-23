import { describe, it, expect } from "vitest";
import {
  AiNodeSchema,
  AiSitePlanSchema,
  AiSectionSchema,
} from "../schema/ai-tree.js";

describe("AI Tree Schemas", () => {
  it("validates valid nested AI nodes with primitives", () => {
    const validNode = {
      type: "Section",
      name: "Hero Section",
      style: {
        padding: "64px",
        backgroundColor: "#0f172a",
      },
      children: [
        {
          type: "Heading",
          level: 1,
          text: "Lahore's Warmest Coffee",
          style: { color: "#ffffff", fontSize: "48px" },
        },
        {
          type: "Text",
          text: "Handcrafted espresso and fresh sourdough pastries daily.",
          style: { color: "#94a3b8" },
        },
        {
          type: "Button",
          text: "View Menu",
          href: "/menu",
          variant: "primary" as const,
        },
        {
          type: "Image",
          imageQuery: "latte art wooden table",
          alt: "Fresh latte with heart art",
        },
      ],
    };

    const parsed = AiNodeSchema.parse(validNode);
    expect(parsed.type).toBe("Section");
    expect(parsed.children?.length).toBe(4);
    expect(parsed.children?.[0]?.type).toBe("Heading");
  });

  it("validates full AI site plans", () => {
    const validPlan = {
      brief: {
        businessType: "Artisan Coffee Roastery",
        audience: "Coffee lovers and remote workers",
        tone: "Warm, craft, inviting",
        goals: ["Showcase beans", "Drive cafe visits", "Online ordering"],
        primaryColorName: "Amber Bronze",
      },
      theme: {
        colors: {
          primary: "#d97706",
          secondary: "#78350f",
          background: "#fffbeb",
          surface: "#fef3c7",
          text: "#1c1917",
          muted: "#78716c",
          border: "#e7e5e4",
          accent: "#f59e0b",
        },
        fonts: {
          heading: "Playfair Display",
          body: "Inter",
        },
        spacing: 8,
        radius: 8,
      },
      pages: [
        {
          name: "Home",
          slug: "/",
          title: "Craft Coffee & Bakery",
          description: "Freshly roasted single-origin coffees",
          sections: [
            { name: "Hero", purpose: "Introduce brand and CTA", layout: "hero" as const },
            { name: "Features", purpose: "Highlight beans and ethics", layout: "features" as const },
          ],
        },
        {
          name: "Menu",
          slug: "/menu",
          title: "Our Seasonal Menu",
          description: "Espresso, brew bar, and bakery items",
          sections: [
            { name: "Drinks", purpose: "Showcase drink options", layout: "content" as const },
          ],
        },
      ],
    };

    const parsed = AiSitePlanSchema.parse(validPlan);
    expect(parsed.pages.length).toBe(2);
    expect(parsed.theme.fonts.heading).toBe("Playfair Display");
  });

  it("validates AiSectionSchema", () => {
    const validSection = {
      name: "Hero Section",
      purpose: "Brand introduction",
      tree: {
        type: "Section" as const,
        children: [
          { type: "Heading" as const, text: "Header Title", level: 1 },
        ],
      },
    };

    const parsed = AiSectionSchema.parse(validSection);
    expect(parsed.name).toBe("Hero Section");
    expect(parsed.tree.type).toBe("Section");
  });

  it("rejects unknown primitive types", () => {
    const invalidNode = {
      type: "CustomScriptTag",
      children: [],
    };

    expect(() => AiNodeSchema.parse(invalidNode)).toThrow();
  });
});
