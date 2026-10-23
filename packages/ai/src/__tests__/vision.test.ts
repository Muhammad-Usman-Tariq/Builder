import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { importFromScreenshot } from "../pipelines/vision.js";
import { type ModelChainEntry, isAiConfigured } from "../models/chain.js";
import { validateSiteDocument } from "@builder/document";

describe("Vision Pipeline: Screenshot Import (Batch G)", () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  let mockResponseSections: any = {
    sections: [
      {
        name: "Hero",
        purpose: "Hero banner with headline, call to action, and hero image",
        nodes: [
          {
            id: "sec_hero",
            parentId: null,
            type: "Section",
            name: "Hero Section",
            props: {},
            style: {
              backgroundColor: "#ffffff",
              padding: "48px 24px",
              display: "flex",
              flexDirection: "column",
            },
          },
          {
            id: "hero_container",
            parentId: "sec_hero",
            type: "Container",
            name: "Hero Container",
            props: {},
            style: {
              maxWidth: 1200,
              margin: "0 auto",
            },
          },
          {
            id: "hero_title",
            parentId: "hero_container",
            type: "Heading",
            name: "Hero Title",
            props: {
              level: 1,
              text: "Launch your next product faster",
            },
            style: {
              fontSize: 48,
              fontWeight: "bold",
              color: "#0f172a",
            },
          },
          {
            id: "hero_subtitle",
            parentId: "hero_container",
            type: "Text",
            name: "Hero Subtitle",
            props: {
              text: "The modern visual builder for high-converting landing pages.",
            },
            style: {
              fontSize: 18,
              color: "#64748b",
            },
          },
          {
            id: "hero_btn",
            parentId: "hero_container",
            type: "Button",
            name: "Get Started Button",
            props: {
              text: "Get Started Free",
              variant: "primary",
            },
            style: {
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: 8,
              padding: "12px 24px",
            },
          },
          {
            id: "hero_img",
            parentId: "hero_container",
            type: "Image",
            name: "Product Showcase Image",
            props: {
              src: "",
              alt: "Dashboard product screenshot showcase",
            },
            style: {
              width: "100%",
              borderRadius: 12,
            },
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-vision-test",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "mock-vision-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(mockResponseSections),
                },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
          baseUrl = `http://127.0.0.1:${serverPort}/v1`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("throws clear error when no vision provider is configured", async () => {
    const origEnv = { ...process.env };
    try {
      delete process.env.AI_MODEL_CHAIN_VISION;
      process.env.AI_MODEL_CHAIN = "nonvision:test-model";
      process.env.AI_PROVIDER_NONVISION_TYPE = "openai-compatible";
      process.env.AI_PROVIDER_NONVISION_BASE_URL = baseUrl;
      process.env.AI_PROVIDER_NONVISION_VISION = "false";

      expect(isAiConfigured("vision")).toBe(false);

      await expect(
        importFromScreenshot({
          desktopScreenshot: "data:image/png;base64,fakeScreenshotData",
        })
      ).rejects.toThrow(
        "No vision-capable AI provider is configured. Configure an AI provider with vision enabled (AI_PROVIDER_<NAME>_VISION=true or set AI_MODEL_CHAIN_VISION in .env)."
      );
    } finally {
      process.env = origEnv;
    }
  });

  it("successfully reconstructs flat node page and builds valid SiteDocument with simulated vision provider", async () => {
    const customChain: ModelChainEntry[] = [
      {
        provider: "test-vision",
        modelId: "mock-vision-model",
        raw: "test-vision:mock-vision-model",
        config: {
          name: "test-vision",
          type: "openai-compatible",
          baseUrl,
          structured: "json_schema",
          vision: true,
        },
      },
    ];

    const VALID_PNG_DATA_URL =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const result = await importFromScreenshot({
      desktopScreenshot: VALID_PNG_DATA_URL,
      mobileScreenshot: VALID_PNG_DATA_URL,
      siteName: "Acme Landing Page",
      customChain,
    });

    expect(result).toBeDefined();
    expect(result.document).toBeDefined();

    // 1. Validate full SiteDocument
    const validation = validateSiteDocument(result.document);
    expect(validation.valid).toBe(true);

    // 2. Check site & pages structure
    expect(result.document.site.name).toBe("Acme Landing Page");
    const pages = Object.values(result.document.pages);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const homePage = pages.find((p) => p.slug === "/");
    expect(homePage).toBeDefined();

    // 3. Check Image elements become empty image slots
    const elements = Object.values(result.document.elements);
    const imageElements = elements.filter((el) => el.type === "Image");
    expect(imageElements.length).toBe(1);
    expect(imageElements[0]?.props?.src).toBe("");
    expect(imageElements[0]?.props?.alt).toBe("Dashboard product screenshot showcase");

    // 4. Check Heading (Hero Title)
    const headingElements = elements.filter((el) => el.type === "Heading");
    expect(headingElements.length).toBe(1);
    expect(headingElements[0]?.props?.text).toBe("Launch your next product faster");

    // 5. Honest report of approximations
    expect(result.report).toBeDefined();
    expect(result.report.imported).toBe(6); // 6 nodes imported
    expect(result.report.approximated).toBeGreaterThanOrEqual(1); // empty image slot + layouts
    expect(result.report.warnings.length).toBeGreaterThan(0);
    expect(result.report.warnings[0]).toContain("converted to empty image placeholders");
  });

  it("normalizes and repairs unformatted styles from vision output during compile", async () => {
    // Inject shorthand padding and string numbers
    mockResponseSections = {
      sections: [
        {
          name: "Banner",
          purpose: "Banner section",
          nodes: [
            {
              id: "sec_banner",
              parentId: null,
              type: "Section",
              props: {},
              style: {
                padding: "16px 24px", // Shorthand requiring repair
                margin: "0 auto",
                display: "flex",
              },
            },
            {
              id: "banner_title",
              parentId: "sec_banner",
              type: "Heading",
              props: {
                level: 2,
                text: "Special Announcement",
              },
              style: {
                fontSize: 24,
                lineHeight: "32px",
              },
            },
          ],
        },
      ],
    };

    const customChain: ModelChainEntry[] = [
      {
        provider: "test-vision",
        modelId: "mock-vision-model",
        raw: "test-vision:mock-vision-model",
        config: {
          name: "test-vision",
          type: "openai-compatible",
          baseUrl,
          structured: "json_schema",
          vision: true,
        },
      },
    ];

    const result = await importFromScreenshot({
      desktopScreenshot:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      siteName: "Repaired Site",
      customChain,
    });

    const validation = validateSiteDocument(result.document);
    expect(validation.valid).toBe(true);
    expect(result.report.imported).toBe(2);
  });

  it("detects font categories correctly and produces honest report with skipped items and charts", async () => {
    mockResponseSections = {
      fontCategory: "serif",
      headingFontCategory: "serif",
      bodyFontCategory: "serif",
      skippedItems: [
        "Sidebar items 7-15 omitted due to density",
        "Footer secondary copyright links",
      ],
      charts: [
        {
          name: "Annual Revenue Chart",
          description: "Bar chart displaying quarterly growth",
        },
      ],
      sections: [
        {
          name: "Editorial",
          purpose: "Editorial magazine section with serif typography",
          nodes: [
            {
              id: "sec_editorial",
              parentId: null,
              type: "Section",
              props: {},
              style: {
                padding: "32px 16px",
                display: "flex",
                flexDirection: "column",
              },
            },
            {
              id: "editorial_heading",
              parentId: "sec_editorial",
              type: "Heading",
              props: {
                level: 1,
                text: "The Architectural Chronicle",
              },
              style: {
                fontSize: 40,
              },
            },
            {
              id: "editorial_body",
              parentId: "sec_editorial",
              type: "Text",
              props: {
                text: "A study in contemporary design principles and structure.",
              },
              style: {
                fontSize: 16,
              },
            },
          ],
        },
      ],
    };

    const customChain: ModelChainEntry[] = [
      {
        provider: "test-vision",
        modelId: "mock-vision-model",
        raw: "test-vision:mock-vision-model",
        config: {
          name: "test-vision",
          type: "openai-compatible",
          baseUrl,
          structured: "json_schema",
          vision: true,
        },
      },
    ];

    const result = await importFromScreenshot({
      desktopScreenshot:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      siteName: "Editorial Gazette",
      customChain,
    });

    // 1. Font tokens: Serif detection produces Playfair Display
    expect(result.document.tokens.fonts.heading).toBe("Playfair Display");
    expect(result.document.tokens.fonts.body).toBe("Merriweather");

    // 2. Heading element has serif font family applied
    const headingEl = Object.values(result.document.elements).find(
      (e) => e.type === "Heading"
    );
    expect(headingEl).toBeDefined();
    const styleId = headingEl?.styleIds[0];
    const headingStyle = styleId ? result.document.styles[styleId] : null;
    expect(headingStyle?.values.desktop?.default?.fontFamily).toEqual({
      raw: "Playfair Display",
    });

    // 3. Honest report: skipped items counted
    expect(result.report.skipped).toBe(2);
    expect(result.report.warnings.some((w) => w.includes("Sidebar items 7-15"))).toBe(true);
    expect(result.report.details?.items?.some((i) => i.type === "skipped")).toBe(true);

    // 4. Charts: approximated with placeholder
    expect(result.report.warnings.some((w) => w.includes("Annual Revenue Chart"))).toBe(true);
    expect(result.report.details?.items?.some((i) => i.type === "chart")).toBe(true);

    // 5. Chart image placeholder inserted in document
    const chartPlaceholder = Object.values(result.document.elements).find(
      (e) => e.type === "Image" && String(e.props?.alt).includes("Annual Revenue Chart")
    );
    expect(chartPlaceholder).toBeDefined();
  });

  it("merges sidebar, header, and main content into two-column layout with inherited font tokens and clean navigation links", async () => {
    mockResponseSections = {
      fontCategory: "sans-serif",
      headingFontCategory: "sans-serif",
      bodyFontCategory: "sans-serif",
      skippedItems: [],
      charts: [],
      sections: [
        {
          name: "Sidebar",
          purpose: "Navigation sidebar with links",
          nodes: [
            {
              id: "sec_sidebar",
              parentId: null,
              type: "Section",
              props: {},
              style: {
                backgroundColor: "#1e293b",
                padding: "24px 16px",
              },
            },
            {
              id: "sidebar_logo",
              parentId: "sec_sidebar",
              type: "Heading",
              props: { level: 3, text: "Acme App" },
              style: { color: "#ffffff" },
            },
            {
              id: "sidebar_nav_link_1",
              parentId: "sec_sidebar",
              type: "Link",
              props: { text: "Overview", href: "/overview" },
              style: { color: "#94a3b8" },
            },
            {
              id: "sidebar_nav_link_2",
              parentId: "sec_sidebar",
              type: "Link",
              props: { text: "Settings", href: "/settings" },
              style: { color: "#94a3b8" },
            },
          ],
        },
        {
          name: "Header",
          purpose: "Top navigation header",
          nodes: [
            {
              id: "sec_header",
              parentId: null,
              type: "Section",
              props: {},
              style: {
                backgroundColor: "#ffffff",
                padding: "16px 24px",
              },
            },
            {
              id: "header_title",
              parentId: "sec_header",
              type: "Heading",
              props: { level: 2, text: "Dashboard Overview" },
              style: { fontSize: 24 },
            },
          ],
        },
        {
          name: "Main Content",
          purpose: "Dashboard content metrics and summaries",
          nodes: [
            {
              id: "sec_main_content",
              parentId: null,
              type: "Section",
              props: {},
              style: {
                padding: "24px",
              },
            },
            {
              id: "content_card_text",
              parentId: "sec_main_content",
              type: "Text",
              props: { text: "Total revenue increased by 14% this quarter." },
              style: { fontSize: 16 },
            },
          ],
        },
      ],
    };

    const customChain: ModelChainEntry[] = [
      {
        provider: "test-vision",
        modelId: "mock-vision-model",
        raw: "test-vision:mock-vision-model",
        config: {
          name: "test-vision",
          type: "openai-compatible",
          baseUrl,
          structured: "json_schema",
          vision: true,
        },
      },
    ];

    const result = await importFromScreenshot({
      desktopScreenshot:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      siteName: "SaaS Dashboard",
      customChain,
    });

    // 1. Verify SiteDocument validates cleanly
    const validation = validateSiteDocument(result.document);
    expect(validation.errors).toEqual([]);

    // 2. Verify root Section has flex row layout
    const homePage = Object.values(result.document.pages).find((p) => p.slug === "/");
    expect(homePage).toBeDefined();
    const bodyEl = result.document.elements[homePage!.rootId];
    expect(bodyEl?.children.length).toBe(1);

    const layoutSectionEl = result.document.elements[bodyEl!.children[0]!];
    expect(layoutSectionEl?.type).toBe("Section");
    const layoutStyle = result.document.styles[layoutSectionEl!.styleIds[0]!];
    expect(layoutStyle?.values.desktop?.default?.display).toEqual({ keyword: "flex" });
    expect(layoutStyle?.values.desktop?.default?.flexDirection).toEqual({ keyword: "row" });

    // 3. Child 0 is Sidebar Column with fixed width 260px and flex-shrink 0
    expect(layoutSectionEl?.children.length).toBe(2);
    const sidebarColEl = result.document.elements[layoutSectionEl!.children[0]!];
    expect(sidebarColEl?.type).toBe("Box");
    const sidebarStyle = result.document.styles[sidebarColEl!.styleIds[0]!];
    expect(sidebarStyle?.values.desktop?.default?.width).toEqual({ unit: "px", value: 260 });
    expect(sidebarStyle?.values.desktop?.default?.flexShrink).toEqual({ raw: "0" });

    // 4. Child 1 is Main Content Column with flexible width
    const mainColEl = result.document.elements[layoutSectionEl!.children[1]!];
    expect(mainColEl?.type).toBe("Box");
    const mainColStyle = result.document.styles[mainColEl!.styleIds[0]!];
    expect(mainColStyle?.values.desktop?.default?.flex).toEqual({ raw: "1 1 0%" });
    expect(mainColStyle?.values.desktop?.default?.minWidth).toEqual({ unit: "px", value: 0 });

    // 5. Header is inside the Main Content Column (child 0 of main column)
    expect(mainColEl?.children.length).toBeGreaterThanOrEqual(2);
    const headerBoxEl = result.document.elements[mainColEl!.children[0]!];
    expect(headerBoxEl?.name).toContain("Header");
    const headerTitleEl = Object.values(result.document.elements).find(
      (e) => e.props?.text === "Dashboard Overview"
    );
    expect(headerTitleEl).toBeDefined();

    // 6. Navigation links inherit font tokens and have textDecoration: "none"
    const linkEl = Object.values(result.document.elements).find(
      (e) => e.type === "Link" && e.props?.text === "Overview"
    );
    expect(linkEl).toBeDefined();
    const linkStyle = result.document.styles[linkEl!.styleIds[0]!];
    expect(linkStyle?.values.desktop?.default?.textDecoration).toEqual({ keyword: "none" });
    expect(linkStyle?.values.desktop?.default?.fontFamily).toEqual({ raw: "Inter" });
  });

  it("attaches header, stat cards, charts, and panels to the main column without leaving it empty", async () => {
    mockResponseSections = {
      sections: [
        {
          name: "App Sidebar",
          purpose: "Left navigation sidebar",
          nodes: [
            {
              id: "sec_side",
              parentId: null,
              type: "Section",
              name: "Sidebar Section",
              props: {},
              style: { backgroundColor: "#1e293b", width: 240 },
            },
            {
              id: "side_link_dash",
              parentId: "sec_side",
              type: "Link",
              name: "Dashboard Link",
              props: { text: "Dashboard", href: "/dashboard" },
              style: { color: "#ffffff" },
            },
          ],
        },
        {
          name: "Top Header",
          purpose: "Header navbar at top of main area",
          nodes: [
            {
              id: "sec_head",
              parentId: null,
              type: "Section",
              name: "Top Header Section",
              props: {},
              style: { padding: "16px 24px" },
            },
            {
              id: "head_title",
              parentId: "sec_head",
              type: "Heading",
              name: "Page Title",
              props: { level: 1, text: "Analytics Overview" },
              style: { fontSize: 24 },
            },
          ],
        },
        {
          name: "Stat Cards Grid",
          purpose: "KPI summary cards",
          nodes: [
            {
              id: "sec_stats",
              parentId: null,
              type: "Section",
              name: "Stats Grid",
              props: {},
              style: { display: "flex", flexDirection: "row", gap: "16px" },
            },
            {
              id: "card_rev",
              parentId: "sec_stats",
              type: "Box",
              name: "Revenue Card",
              props: {},
              style: { padding: "16px", backgroundColor: "#ffffff" },
            },
            {
              id: "card_rev_title",
              parentId: "card_rev",
              type: "Text",
              name: "Card Title",
              props: { text: "Total Revenue: $48,200" },
              style: { fontWeight: "bold" },
            },
          ],
        },
        {
          name: "Chart & Activity Panel",
          purpose: "Main chart panel and recent activities list",
          nodes: [
            {
              id: "sec_panel",
              parentId: null,
              type: "Section",
              name: "Panels Section",
              props: {},
              style: { padding: "24px" },
            },
            {
              id: "chart_img",
              parentId: "sec_panel",
              type: "Image",
              name: "Monthly Traffic Chart",
              props: { src: "", alt: "[Chart] Monthly Traffic Trends" },
              style: { width: "100%", height: 300 },
            },
            {
              id: "panel_text",
              parentId: "sec_panel",
              type: "Text",
              name: "Recent Activity Log",
              props: { text: "1,420 orders processed today." },
              style: { color: "#64748b" },
            },
          ],
        },
      ],
    };

    const customChain: ModelChainEntry[] = [
      {
        provider: "test-vision",
        modelId: "mock-vision-model",
        raw: "test-vision:mock-vision-model",
        config: {
          name: "test-vision",
          type: "openai-compatible",
          baseUrl,
          structured: "json_schema",
          vision: true,
        },
      },
    ];

    const result = await importFromScreenshot({
      desktopScreenshot:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      siteName: "Dense Dashboard Test",
      customChain,
    });

    const homePage = Object.values(result.document.pages).find((p) => p.slug === "/");
    expect(homePage).toBeDefined();
    const bodyEl = result.document.elements[homePage!.rootId]!;
    const layoutSectionEl = result.document.elements[bodyEl.children[0]!]!;

    // Two-column layout contains sidebar column (0) and main content column (1)
    expect(layoutSectionEl.children.length).toBe(2);
    const mainColEl = result.document.elements[layoutSectionEl.children[1]!]!;
    expect(mainColEl.name).toBe("Main Content Column");

    // Main column must NOT be empty! It must contain header, stat cards, and panels
    expect(mainColEl.children.length).toBe(3);

    // Verify header, cards, and panel contents exist in document elements
    const elements = Object.values(result.document.elements);
    const headerTitle = elements.find((e) => e.props?.text === "Analytics Overview");
    expect(headerTitle).toBeDefined();

    const statText = elements.find((e) => e.props?.text === "Total Revenue: $48,200");
    expect(statText).toBeDefined();

    const chartEl = elements.find((e) => e.type === "Image" && String(e.props?.alt || "").includes("Monthly Traffic Trends"));
    expect(chartEl).toBeDefined();

    const panelText = elements.find((e) => e.props?.text === "1,420 orders processed today.");
    expect(panelText).toBeDefined();
  });
});
