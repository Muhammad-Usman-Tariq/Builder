import { describe, it, expect } from "vitest";
import {
  convertFigmaFrameToDocument,
  extractFigmaFileKey,
  figmaColorToCss,
  listFigmaFrames,
  type FigmaNode,
} from "../figma.js";

// Saved Figma JSON Fixture (mimics Figma REST API GET /v1/files/:key response)
const fixtureFrame: FigmaNode = {
  id: "1:2",
  name: "Hero Section",
  type: "FRAME",
  layoutMode: "VERTICAL",
  itemSpacing: 24,
  paddingLeft: 32,
  paddingRight: 32,
  paddingTop: 48,
  paddingBottom: 48,
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  fills: [
    {
      type: "SOLID",
      color: { r: 0.98, g: 0.98, b: 1, a: 1 },
      opacity: 1,
    },
  ],
  cornerRadius: 16,
  effects: [
    {
      type: "DROP_SHADOW",
      offset: { x: 0, y: 10 },
      radius: 20,
      color: { r: 0, g: 0, b: 0, a: 0.08 },
      visible: true,
    },
  ],
  children: [
    {
      id: "1:3",
      name: "Hero Heading",
      type: "TEXT",
      characters: "Design without Boundaries",
      style: {
        fontSize: 36,
        fontWeight: 700,
        lineHeightPx: 44,
        textAlignHorizontal: "CENTER",
      },
      fills: [
        {
          type: "SOLID",
          color: { r: 0.06, g: 0.09, b: 0.16, a: 1 },
        },
      ],
    },
    {
      id: "1:4",
      name: "Hero Subtitle",
      type: "TEXT",
      characters: "Turn your Figma frames directly into production-grade websites.",
      style: {
        fontSize: 18,
        fontWeight: 400,
        lineHeightPx: 26,
        textAlignHorizontal: "CENTER",
      },
      fills: [
        {
          type: "SOLID",
          color: { r: 0.39, g: 0.45, b: 0.55, a: 1 },
        },
      ],
    },
    {
      id: "1:5",
      name: "Feature Card",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      itemSpacing: 16,
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 16,
      fills: [
        {
          type: "SOLID",
          color: { r: 1, g: 1, b: 1, a: 1 },
        },
      ],
      strokes: [
        {
          type: "SOLID",
          color: { r: 0.9, g: 0.9, b: 0.92, a: 1 },
        },
      ],
      strokeWeight: 1,
      cornerRadius: 12,
      children: [
        {
          id: "1:6",
          name: "Thumbnail",
          type: "RECTANGLE",
          fills: [
            {
              type: "IMAGE",
              imageRef: "img_ref_12345",
            },
          ],
        },
        {
          id: "1:7",
          name: "Card Text",
          type: "TEXT",
          characters: "Instant Code Generation",
          style: {
            fontSize: 16,
            fontWeight: 600,
          },
        },
      ],
    },
  ],
};

describe("Batch E4: Figma Frame Importer", () => {
  it("extracts file key correctly from full URLs and raw keys", () => {
    expect(
      extractFigmaFileKey("https://www.figma.com/design/VbX871asdB1/My-Portfolio?node-id=0-1")
    ).toBe("VbX871asdB1");
    expect(
      extractFigmaFileKey("https://www.figma.com/file/aBcDeFg12345/Dashboard")
    ).toBe("aBcDeFg12345");
    expect(extractFigmaFileKey("rawKey12345")).toBe("rawKey12345");
  });

  it("converts Figma color to rgba string", () => {
    const css = figmaColorToCss({ r: 0.2, g: 0.4, b: 0.8, a: 1 }, 1);
    expect(css).toBe("rgba(51, 102, 204, 1)");
  });

  it("lists top-level frames from document JSON", () => {
    const mockFile = {
      document: {
        children: [
          {
            type: "CANVAS",
            name: "Page 1",
            children: [
              {
                id: "1:1",
                name: "Header",
                type: "FRAME",
                absoluteBoundingBox: { width: 1440, height: 80 },
              },
              {
                id: "1:2",
                name: "Hero Section",
                type: "FRAME",
                absoluteBoundingBox: { width: 1440, height: 600 },
              },
            ],
          },
        ],
      },
    };

    const frames = listFigmaFrames(mockFile);
    expect(frames.length).toBe(2);
    expect(frames[0]?.name).toBe("Header");
    expect(frames[1]?.name).toBe("Hero Section");
  });

  it("converts saved Figma JSON fixture into valid SiteDocument tree matching layers and styles", () => {
    const result = convertFigmaFrameToDocument(fixtureFrame, {
      siteName: "Figma Test Site",
    });

    expect(result.document).toBeDefined();
    expect(result.report.imported).toBeGreaterThan(0);

    const doc = result.document;
    const elements = Object.values(doc.elements);

    // 1. Root Body
    const body = elements.find((e) => e.type === "Body");
    expect(body).toBeDefined();

    // 2. Top-level Section (Hero Section)
    const section = elements.find((e) => e.type === "Section");
    expect(section).toBeDefined();
    expect(section?.name).toBe("Hero Section");

    // Section styles (Flexbox, vertical, gap 24px, padding 48px/32px, cornerRadius 16px)
    const secStyle = doc.styles[section!.styleIds[0]!];
    expect(secStyle).toBeDefined();
    const secDecls = secStyle!.values.desktop!.default!;
    expect(secDecls["display"]).toEqual({ keyword: "flex" });
    expect(secDecls["flexDirection"]).toEqual({ keyword: "column" });
    expect(secDecls["gap"]).toEqual({ unit: "px", value: 24 });
    expect(secDecls["borderRadius"]).toEqual({ unit: "px", value: 16 });
    expect(secDecls["boxShadow"]).toBeDefined();

    // 3. Heading (font size 36 >= 24)
    const heading = elements.find((e) => e.type === "Heading");
    expect(heading).toBeDefined();
    expect(heading?.props["text"]).toBe("Design without Boundaries");
    expect(heading?.props["level"]).toBe(1);

    // Heading styles (fontSize 36px, fontWeight 700, color)
    const headingStyle = doc.styles[heading!.styleIds[0]!];
    expect(headingStyle!.values.desktop!.default!["fontSize"]).toEqual({ unit: "px", value: 36 });

    // 4. Subtitle Text (font size 18 < 24)
    const subtitle = elements.find(
      (e) => e.type === "Text" && String(e.props["text"] || "").includes("Turn your Figma frames")
    );
    expect(subtitle).toBeDefined();

    // 5. Feature Card (Box with horizontal flex, gap 16px, border, cornerRadius 12px)
    const card = elements.find((e) => e.name === "Feature Card");
    expect(card).toBeDefined();
    expect(card?.type).toBe("Box");
    const cardStyle = doc.styles[card!.styleIds[0]!];
    const cardDecls = cardStyle!.values.desktop!.default!;
    expect(cardDecls["display"]).toEqual({ keyword: "flex" });
    expect(cardDecls["flexDirection"]).toEqual({ keyword: "row" });
    expect(cardDecls["gap"]).toEqual({ unit: "px", value: 16 });
    expect(cardDecls["borderRadius"]).toEqual({ unit: "px", value: 12 });
    expect(cardDecls["border"]).toBeDefined();

    // 6. Thumbnail Image (Rectangle with image fill)
    const thumbnail = elements.find((e) => e.name === "Thumbnail");
    expect(thumbnail).toBeDefined();
    expect(thumbnail?.type).toBe("Image");
  });

  it("handles non-Auto-Layout frame with 3-layer overlapping hero with free positioning and maxWidth", () => {
    const overlappingHeroFrame: FigmaNode = {
      id: "2:1",
      name: "Overlapping Hero Frame",
      type: "FRAME",
      layoutMode: "NONE",
      absoluteBoundingBox: { x: 100, y: 50, width: 1200, height: 600 },
      children: [
        {
          id: "2:2",
          name: "Hero Background Shape",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 100, y: 50, width: 1200, height: 600 },
          fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.2, a: 1 } }],
        },
        {
          id: "2:3",
          name: "Hero Illustration",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 700, y: 150, width: 500, height: 400 },
          fills: [{ type: "IMAGE", imageRef: "hero_img" }],
        },
        {
          id: "2:4",
          name: "Hero Title",
          type: "TEXT",
          characters: "Building the Future of Design",
          style: { fontSize: 44, fontWeight: 700 },
          absoluteBoundingBox: { x: 180, y: 200, width: 450, height: 120 },
        },
      ],
    };

    const result = convertFigmaFrameToDocument(overlappingHeroFrame, {
      siteName: "Overlapping Hero Site",
    });

    const doc = result.document;
    const elements = Object.values(doc.elements);

    // 1. Top Section
    const section = elements.find((e) => e.type === "Section");
    expect(section).toBeDefined();
    const secStyle = doc.styles[section!.styleIds[0]!]!.values.desktop!.default!;
    expect(secStyle["maxWidth"]).toEqual({ unit: "px", value: 1200 });
    expect(secStyle["marginLeft"]).toEqual({ keyword: "auto" });
    expect(secStyle["marginRight"]).toEqual({ keyword: "auto" });
    expect(secStyle["position"]).toEqual({ keyword: "relative" });
    expect(secStyle["minHeight"]).toEqual({ unit: "px", value: 600 });

    // 2. Layer 1: Background Shape (relative left: 0, top: 0)
    const bg = elements.find((e) => e.name === "Hero Background Shape");
    expect(bg).toBeDefined();
    const bgStyle = doc.styles[bg!.styleIds[0]!]!.values.desktop!.default!;
    expect(bgStyle["position"]).toEqual({ keyword: "absolute" });
    expect(bgStyle["left"]).toEqual({ unit: "px", value: 0 });
    expect(bgStyle["top"]).toEqual({ unit: "px", value: 0 });
    expect(bgStyle["width"]).toEqual({ unit: "px", value: 1200 });
    expect(bgStyle["height"]).toEqual({ unit: "px", value: 600 });

    // 3. Layer 2: Illustration (relative left: 700 - 100 = 600, top: 150 - 50 = 100)
    const illustration = elements.find((e) => e.name === "Hero Illustration");
    expect(illustration).toBeDefined();
    expect(illustration?.type).toBe("Image");
    const illustStyle = doc.styles[illustration!.styleIds[0]!]!.values.desktop!.default!;
    expect(illustStyle["position"]).toEqual({ keyword: "absolute" });
    expect(illustStyle["left"]).toEqual({ unit: "px", value: 600 });
    expect(illustStyle["top"]).toEqual({ unit: "px", value: 100 });
    expect(illustStyle["width"]).toEqual({ unit: "px", value: 500 });
    expect(illustStyle["height"]).toEqual({ unit: "px", value: 400 });

    // 4. Layer 3: Title (relative left: 180 - 100 = 80, top: 200 - 50 = 150)
    const title = elements.find((e) => e.name === "Hero Title");
    expect(title).toBeDefined();
    expect(title?.type).toBe("Heading");
    const titleStyle = doc.styles[title!.styleIds[0]!]!.values.desktop!.default!;
    expect(titleStyle["position"]).toEqual({ keyword: "absolute" });
    expect(titleStyle["left"]).toEqual({ unit: "px", value: 80 });
    expect(titleStyle["top"]).toEqual({ unit: "px", value: 150 });
    expect(titleStyle["width"]).toEqual({ unit: "px", value: 450 });
    expect(titleStyle["height"]).toEqual({ unit: "px", value: 120 });
  });

  it("imports mobile dashboard frame (iPhone 14 & 15 Pro - 1) with high fidelity", () => {
    // Fixture reproducing "iPhone 14 & 15 Pro - 1"
    const dashboardFrame: FigmaNode = {
      id: "10:1",
      name: "iPhone 14 & 15 Pro - 1",
      type: "FRAME",
      layoutMode: "NONE", // Frame without Auto Layout (free positioning)
      clipsContent: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 844 },
      children: [
        // Title
        {
          id: "10:2",
          name: "Dashboard Title",
          type: "TEXT",
          characters: "Dashboard",
          style: { fontSize: 28, fontWeight: 700 },
          absoluteBoundingBox: { x: 24, y: 56, width: 200, height: 34 },
        },
        // Daily / Weekly / Monthly Tab Bar (Auto Layout flex row)
        {
          id: "10:3",
          name: "Tab Bar",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          itemSpacing: 8,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 4,
          paddingBottom: 4,
          cornerRadius: 10,
          fills: [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.96 } }],
          absoluteBoundingBox: { x: 24, y: 106, width: 342, height: 40 },
          children: [
            {
              id: "10:4",
              name: "Daily Tab",
              type: "TEXT",
              characters: "Daily",
              style: { fontSize: 14, fontWeight: 600 },
            },
            {
              id: "10:5",
              name: "Weekly Tab",
              type: "TEXT",
              characters: "Weekly",
              style: { fontSize: 14, fontWeight: 600 },
            },
            {
              id: "10:6",
              name: "Monthly Tab",
              type: "TEXT",
              characters: "Monthly",
              style: { fontSize: 14, fontWeight: 600 },
            },
          ],
        },
        // Date card with round arrow buttons (ELLIPSE) and 2 separate text lines
        {
          id: "10:7",
          name: "Date Card",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          primaryAxisAlignItems: "SPACE_BETWEEN",
          counterAxisAlignItems: "CENTER",
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          cornerRadius: 16,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
          absoluteBoundingBox: { x: 24, y: 162, width: 342, height: 72 },
          children: [
            {
              id: "10:8",
              name: "Prev Arrow Button",
              type: "ELLIPSE",
              cornerRadius: 18,
              fills: [{ type: "SOLID", color: { r: 0.94, g: 0.95, b: 0.96 } }],
              absoluteBoundingBox: { x: 40, y: 180, width: 36, height: 36 },
            },
            {
              id: "10:9",
              name: "Date Text Column",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                {
                  id: "10:10",
                  name: "Date Line 1",
                  type: "TEXT",
                  characters: "October 12, 2026",
                  style: { fontSize: 16, fontWeight: 700 },
                },
                {
                  id: "10:11",
                  name: "Date Line 2",
                  type: "TEXT",
                  characters: "Monday • Current Period",
                  style: { fontSize: 12, fontWeight: 400 },
                },
              ],
            },
            {
              id: "10:12",
              name: "Next Arrow Button",
              type: "ELLIPSE",
              cornerRadius: 18,
              fills: [{ type: "SOLID", color: { r: 0.94, g: 0.95, b: 0.96 } }],
              absoluteBoundingBox: { x: 314, y: 180, width: 36, height: 36 },
            },
          ],
        },
        // Stat Card with an Orange Gradient & Icon
        {
          id: "10:13",
          name: "Gradient Stat Card",
          type: "FRAME",
          layoutMode: "VERTICAL",
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 20,
          paddingBottom: 20,
          cornerRadius: 20,
          fills: [
            {
              type: "GRADIENT_LINEAR",
              gradientHandlePositions: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              gradientStops: [
                { position: 0, color: { r: 1, g: 0.45, b: 0.1, a: 1 } },
                { position: 1, color: { r: 1, g: 0.2, b: 0.3, a: 1 } },
              ],
            },
          ],
          absoluteBoundingBox: { x: 24, y: 250, width: 342, height: 120 },
          children: [
            {
              id: "10:14",
              name: "Trending Icon",
              type: "VECTOR",
              absoluteBoundingBox: { x: 44, y: 270, width: 24, height: 24 },
            },
            {
              id: "10:15",
              name: "Stat Label",
              type: "TEXT",
              characters: "Total Revenue",
              style: { fontSize: 14, fontWeight: 500 },
            },
            {
              id: "10:16",
              name: "Stat Value",
              type: "TEXT",
              characters: "$128,450",
              style: { fontSize: 28, fontWeight: 700 },
            },
          ],
        },
        // Terminal stats row with mixed-style text
        {
          id: "10:17",
          name: "Terminal Stats Row",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          itemSpacing: 12,
          absoluteBoundingBox: { x: 24, y: 386, width: 342, height: 48 },
          children: [
            {
              id: "10:18",
              name: "Mixed Status Text",
              type: "TEXT",
              characters: "STATUS: ACTIVE (99.9%)",
              characterStyleOverrides: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 2, 2, 2, 2, 2, 0],
              styleOverrideTable: {
                "0": { fontWeight: 500, fontSize: 13 },
                "1": {
                  fontWeight: 700,
                  fontSize: 13,
                  fills: [{ type: "SOLID", color: { r: 0.1, g: 0.8, b: 0.2, a: 1 } }],
                },
                "2": { fontWeight: 400, fontSize: 12 },
              },
            },
          ],
        },
        // Report list with search bar and "Performance Reports" text
        {
          id: "10:19",
          name: "Reports Section",
          type: "FRAME",
          layoutMode: "VERTICAL",
          itemSpacing: 12,
          absoluteBoundingBox: { x: 24, y: 450, width: 342, height: 200 },
          children: [
            {
              id: "10:20",
              name: "Section Title",
              type: "TEXT",
              characters: "Performance Reports",
              style: { fontSize: 20, fontWeight: 600 },
            },
            {
              id: "10:21",
              name: "Search Bar",
              type: "FRAME",
              layoutMode: "HORIZONTAL",
              itemSpacing: 8,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              cornerRadius: 8,
              fills: [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }],
              children: [
                {
                  id: "10:22",
                  name: "Search Icon",
                  type: "VECTOR",
                  absoluteBoundingBox: { x: 36, y: 494, width: 16, height: 16 },
                },
                {
                  id: "10:23",
                  name: "Search Placeholder",
                  type: "TEXT",
                  characters: "Search reports...",
                  style: { fontSize: 14, fontWeight: 400 },
                },
              ],
            },
          ],
        },
        // Bottom navigation with 5 icon+label items
        {
          id: "10:24",
          name: "Bottom Navigation",
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          primaryAxisAlignItems: "SPACE_BETWEEN",
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 10,
          paddingBottom: 10,
          absoluteBoundingBox: { x: 0, y: 770, width: 390, height: 74 },
          children: [
            {
              id: "10:25",
              name: "Nav Item 1",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                { id: "10:26", name: "Home Icon", type: "VECTOR", absoluteBoundingBox: { x: 20, y: 778, width: 24, height: 24 } },
                { id: "10:27", name: "Home Label", type: "TEXT", characters: "Home", style: { fontSize: 10 } },
              ],
            },
            {
              id: "10:28",
              name: "Nav Item 2",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                { id: "10:29", name: "Analytics Icon", type: "VECTOR", absoluteBoundingBox: { x: 98, y: 778, width: 24, height: 24 } },
                { id: "10:30", name: "Analytics Label", type: "TEXT", characters: "Analytics", style: { fontSize: 10 } },
              ],
            },
            {
              id: "10:31",
              name: "Nav Item 3",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                { id: "10:32", name: "Reports Icon", type: "VECTOR", absoluteBoundingBox: { x: 176, y: 778, width: 24, height: 24 } },
                { id: "10:33", name: "Reports Label", type: "TEXT", characters: "Reports", style: { fontSize: 10 } },
              ],
            },
            {
              id: "10:34",
              name: "Nav Item 4",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                { id: "10:35", name: "Notifications Icon", type: "VECTOR", absoluteBoundingBox: { x: 254, y: 778, width: 24, height: 24 } },
                { id: "10:36", name: "Notifications Label", type: "TEXT", characters: "Alerts", style: { fontSize: 10 } },
              ],
            },
            {
              id: "10:37",
              name: "Nav Item 5",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 4,
              children: [
                { id: "10:38", name: "Profile Icon", type: "VECTOR", absoluteBoundingBox: { x: 332, y: 778, width: 24, height: 24 } },
                { id: "10:39", name: "Profile Label", type: "TEXT", characters: "Profile", style: { fontSize: 10 } },
              ],
            },
          ],
        },
      ],
    };

    const imageMap: Record<string, string> = {
      "10:14": "https://cdn.example.com/icons/trending.svg",
      "10:22": "https://cdn.example.com/icons/search.svg",
      "10:26": "https://cdn.example.com/icons/home.svg",
      "10:29": "https://cdn.example.com/icons/analytics.svg",
      "10:32": "https://cdn.example.com/icons/reports.svg",
      "10:35": "https://cdn.example.com/icons/alerts.svg",
      "10:38": "https://cdn.example.com/icons/profile.svg",
    };

    const result = convertFigmaFrameToDocument(dashboardFrame, {
      siteName: "Mobile Dashboard Site",
      imageMap,
    });

    const doc = result.document;
    const elements = Object.values(doc.elements);

    // 1. Top Section width 390px, centered
    const section = elements.find((e) => e.type === "Section");
    expect(section).toBeDefined();
    const secStyle = doc.styles[section!.styleIds[0]!]!.values.desktop!.default!;
    expect(secStyle["maxWidth"]).toEqual({ unit: "px", value: 390 });
    expect(secStyle["marginLeft"]).toEqual({ keyword: "auto" });
    expect(secStyle["marginRight"]).toEqual({ keyword: "auto" });
    expect(secStyle["overflow"]).toEqual({ keyword: "hidden" }); // clipsContent: true

    // 2. Icons become Icon elements with a src
    const icons = elements.filter((e) => e.type === "Icon");
    expect(icons.length).toBeGreaterThanOrEqual(7);
    for (const icon of icons) {
      expect(icon.props["src"]).toBeDefined();
      expect(typeof icon.props["src"]).toBe("string");
      expect(String(icon.props["src"] || "").length).toBeGreaterThan(0);
    }

    // Specific check for trending icon
    const trendingIcon = elements.find((e) => e.name === "Trending Icon");
    expect(trendingIcon).toBeDefined();
    expect(trendingIcon?.type).toBe("Icon");
    expect(trendingIcon?.props["src"]).toBe("https://cdn.example.com/icons/trending.svg");

    // 3. Gradient is present on the gradient card
    const gradCard = elements.find((e) => e.name === "Gradient Stat Card");
    expect(gradCard).toBeDefined();
    const gradStyle = doc.styles[gradCard!.styleIds[0]!]!.values.desktop!.default!;
    expect(gradStyle["background"]).toBeDefined();
    const bgVal = gradStyle["background"];
    expect(bgVal && "raw" in bgVal ? bgVal.raw : "").toContain("linear-gradient");
    expect(gradStyle["borderRadius"]).toEqual({ unit: "px", value: 20 });

    // 4. "Performance Reports" and both lines of the date card exist as separate text elements
    const perfReportText = elements.find(
      (e) => (e.type === "Text" || e.type === "Heading") && e.props["text"] === "Performance Reports"
    );
    expect(perfReportText).toBeDefined();

    const dateLine1 = elements.find(
      (e) => (e.type === "Text" || e.type === "Heading") && e.props["text"] === "October 12, 2026"
    );
    expect(dateLine1).toBeDefined();

    const dateLine2 = elements.find(
      (e) => (e.type === "Text" || e.type === "Heading") && e.props["text"] === "Monday • Current Period"
    );
    expect(dateLine2).toBeDefined();
    expect(dateLine1?.id).not.toBe(dateLine2?.id);

    // 5. Round arrow buttons (ELLIPSE) have 50% border radius
    const prevArrow = elements.find((e) => e.name === "Prev Arrow Button");
    expect(prevArrow).toBeDefined();
    const prevArrowStyle = doc.styles[prevArrow!.styleIds[0]!]!.values.desktop!.default!;
    expect(prevArrowStyle["borderRadius"]).toEqual({ unit: "%", value: 50 });

    // 6. Mixed-style text has spans
    const mixedText = elements.find((e) => e.name === "Mixed Status Text");
    expect(mixedText).toBeDefined();
    const textSpans = mixedText?.props["spans"] as Array<any> | undefined;
    expect(textSpans).toBeDefined();
    expect(textSpans?.length).toBeGreaterThan(1);

    // 7. Bottom navigation has 5 items
    const bottomNav = elements.find((e) => e.name === "Bottom Navigation");
    expect(bottomNav).toBeDefined();
    expect(bottomNav?.children.length).toBe(5);

    // Verify all 5 nav items exist
    const navItem1 = elements.find((e) => e.name === "Nav Item 1");
    const navItem2 = elements.find((e) => e.name === "Nav Item 2");
    const navItem3 = elements.find((e) => e.name === "Nav Item 3");
    const navItem4 = elements.find((e) => e.name === "Nav Item 4");
    const navItem5 = elements.find((e) => e.name === "Nav Item 5");
    expect(navItem1).toBeDefined();
    expect(navItem2).toBeDefined();
    expect(navItem3).toBeDefined();
    expect(navItem4).toBeDefined();
    expect(navItem5).toBeDefined();
  });
});

