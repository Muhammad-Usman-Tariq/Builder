import { z } from "zod";
import {
  AiFlatSectionSchema,
  type AiFlatSection,
  type AiSection,
  type AiNode,
  type AiSitePlan,
} from "../schema/ai-tree.js";
import {
  type ModelChainEntry,
  type LanguageModelResolver,
  isAiConfigured,
} from "../models/chain.js";
import { generateStructuredWithFallback } from "./structured.js";
import { compileAiSiteDocument, rebuildTreeFromFlatNodes } from "../compiler/index.js";
import type { SiteDocument } from "@builder/document";

export const VisionImportOutputSchema = z.object({
  fontCategory: z
    .enum(["sans-serif", "serif", "monospace"])
    .default("sans-serif")
    .describe("Dominant font family category detected in the screenshot (sans-serif, serif, or monospace)"),
  headingFontCategory: z
    .enum(["sans-serif", "serif", "monospace"])
    .optional()
    .describe("Font category specifically for headings"),
  bodyFontCategory: z
    .enum(["sans-serif", "serif", "monospace"])
    .optional()
    .describe("Font category specifically for body copy"),
  skippedItems: z
    .array(z.string())
    .default([])
    .describe("List of elements, dense items, or sections from the screenshot that were omitted or skipped"),
  charts: z
    .array(
      z.object({
        name: z.string().describe("Name or title of chart/graph"),
        description: z.string().optional().describe("Description of what the chart visualizes"),
        section: z.string().optional().describe("Section where chart appeared"),
      })
    )
    .default([])
    .describe("Charts, graphs, or data visualizations identified in the screenshot"),
  sections: z.array(AiFlatSectionSchema).min(1),
});

export type VisionImportOutput = z.infer<typeof VisionImportOutputSchema>;

const VISION_IMPORT_SYSTEM_PROMPT = `
You are the visual layout engine of Builder.
Analyze the provided website screenshot(s) and reconstruct the page structure accurately into flat nodes conforming to the output schema.
Output a JSON object with:
- fontCategory: "sans-serif" | "serif" | "monospace" (carefully inspect heading & body letterforms: detect whether headings/body are sans-serif like Inter/Roboto, serif like Georgia/Playfair/Times, or monospace like Courier/JetBrains).
- headingFontCategory: "sans-serif" | "serif" | "monospace"
- bodyFontCategory: "sans-serif" | "serif" | "monospace"
- skippedItems: list of any content, dense list elements, or links from the screenshot that were NOT fully reproduced (e.g. truncated sidebar items, tiny footer text, icons). Never claim 0 skipped if any content was omitted.
- charts: list of any charts, graphs, or data visualizations in the screenshot. Approximate each chart as an Image primitive placeholder with alt: "[Chart] <name>".
- sections: array of reconstructed sections conforming to AiFlatSectionSchema.

Rules:
- Never output HTML, JSX, or markdown code blocks. Return strictly valid JSON conforming to the schema.
- Within each section, the root Section node must have id: "sec_<name>" and parentId: null.
- Every child node must have parentId pointing to a valid node id within that same section.
- Extract copy and text content faithfully from the screenshot.
- Process dense screenshots by breaking down regions (e.g. sidebar, header, main content, footer) and preserving all visible items.
- For headings, specify level (1 for the main hero heading, 2 for section headers, 3 for subheadings) and copy in props.text.
- For images and charts, output an Image primitive with props.alt describing the visual content and props.src: "" (empty image slot).
- For buttons, output Button primitives with props.text.
- Approximate layout using responsive flex/grid styles, sensible padding, gap, background colors, and text colors matching the screenshot.
`;

export interface ScreenshotImportOptions {
  desktopScreenshot: string;
  mobileScreenshot?: string | undefined;
  siteName?: string | undefined;
  customChain?: ModelChainEntry[] | undefined;
  modelResolver?: LanguageModelResolver | undefined;
}

export interface ScreenshotImportReport {
  imported: number;
  approximated: number;
  skipped: number;
  warnings: string[];
  details?: {
    emptyImageSlots?: number;
    approximatedLayouts?: number;
    approximatedTypography?: number;
    items?: Array<{ type: string; message: string }>;
  };
}

export interface ScreenshotImportResult {
  document: SiteDocument;
  report: ScreenshotImportReport;
}

/**
 * Imports a website layout from screenshot(s) using a vision-capable AI provider.
 * Section G
 */
export async function importFromScreenshot(
  options: ScreenshotImportOptions
): Promise<ScreenshotImportResult> {
  // 1. Verify vision provider configuration
  if (!options.customChain && !isAiConfigured("vision")) {
    throw new Error(
      "No vision-capable AI provider is configured. Configure an AI provider with vision enabled (AI_PROVIDER_<NAME>_VISION=true or set AI_MODEL_CHAIN_VISION in .env)."
    );
  }

  const images: string[] = [options.desktopScreenshot];
  if (options.mobileScreenshot) {
    images.push(options.mobileScreenshot);
  }

  // 2. Invoke vision-capable provider to produce flat section nodes
  const visionOutput = await generateStructuredWithFallback<VisionImportOutput>({
    task: "vision",
    schema: VisionImportOutputSchema,
    system: VISION_IMPORT_SYSTEM_PROMPT,
    prompt:
      "Reconstruct the visual layout, typography, and text content of this website screenshot into flat section nodes. Detect font categories (sans-serif vs serif vs monospace), list any omitted or dense items in skippedItems, and note any charts.",
    images,
    maxTokens: 8192,
    customChain: options.customChain,
    modelResolver: options.modelResolver,
  });

  // 3. Process font categories (Item 4.b)
  const headingCat = visionOutput.headingFontCategory || visionOutput.fontCategory || "sans-serif";
  const bodyCat = visionOutput.bodyFontCategory || visionOutput.fontCategory || "sans-serif";

  const headingFontToken =
    headingCat === "serif"
      ? "Playfair Display"
      : headingCat === "monospace"
      ? "JetBrains Mono"
      : "Inter";

  const bodyFontToken =
    bodyCat === "serif"
      ? "Merriweather"
      : bodyCat === "monospace"
      ? "JetBrains Mono"
      : "Inter";

  // 4. Process nodes and track approximations
  let importedCount = 0;
  let emptyImageSlots = 0;
  let approximatedLayouts = 0;
  let approximatedTypography = 0;

  // Ensure charts have image placeholders (Item 4.c)
  for (const chart of visionOutput.charts || []) {
    const foundChartNode = visionOutput.sections.some((s) =>
      s.nodes.some((n) => n.type === "Image" && n.props?.alt?.toLowerCase().includes(chart.name.toLowerCase()))
    );
    if (!foundChartNode && visionOutput.sections[0]) {
      const chartPlaceholderId = `chart_placeholder_${Math.random().toString(36).substring(2, 7)}`;
      visionOutput.sections[0].nodes.push({
        id: chartPlaceholderId,
        parentId: visionOutput.sections[0].nodes[0]?.id || null,
        type: "Image",
        name: `Chart: ${chart.name}`,
        props: {
          src: "",
          alt: `[Chart] ${chart.name}: ${chart.description || "Data visualization"} (approximated placeholder)`,
        },
        style: {
          width: "100%",
          minHeight: 240,
          backgroundColor: "#f1f5f9",
          borderRadius: 8,
        },
      });
    }
  }

  for (const section of visionOutput.sections) {
    for (const node of section.nodes) {
      importedCount++;
      if (node.type === "Image") {
        emptyImageSlots++;
        node.props = {
          ...node.props,
          src: "",
          alt: node.props?.alt || "Image slot",
        };
      }
      if (
        node.style &&
        (node.style.display === "grid" ||
          node.style.position === "absolute" ||
          node.style.flexDirection)
      ) {
        approximatedLayouts++;
      }
      if (node.type === "Heading") {
        approximatedTypography++;
        if (!node.style) node.style = {};
        node.style.fontFamily = headingFontToken;
      } else if (node.type === "Text") {
        approximatedTypography++;
        if (!node.style) node.style = {};
        node.style.fontFamily = bodyFontToken;
        if (node.props?.href) {
          node.style.textDecoration = "none";
        }
      } else if (node.type === "Link" || (node.props && node.props.href !== undefined)) {
        approximatedTypography++;
        if (!node.style) node.style = {};
        node.style.fontFamily = bodyFontToken;
        node.style.textDecoration = "none";
      } else if (node.type === "Button") {
        if (!node.style) node.style = {};
        node.style.fontFamily = bodyFontToken;
        node.style.textDecoration = "none";
      }

      // Navigation links are not underlined by default and inherit font token
      if (
        /nav|sidebar|menu|header/i.test(node.name || "") ||
        /nav|sidebar|menu|header/i.test(node.id || "")
      ) {
        if (node.type === "Link" || node.props?.href || node.type === "Button") {
          if (!node.style) node.style = {};
          node.style.textDecoration = "none";
          node.style.fontFamily = bodyFontToken;
        }
      }
    }
  }

  // 5. Convert flat sections to trees, merging regions if a sidebar is detected (Item 4)
function getImageDimensions(dataUri?: string): { width: number; height: number } | null {
  if (!dataUri || typeof dataUri !== "string") return null;
  const match = dataUri.match(/^data:image\/([a-zA-Z0-9+]+);?(base64)?,?(.*)$/);
  if (!match) return null;
  const isBase64 = match[2] === "base64";
  const dataPayload = match[3] || "";
  try {
    const buf = isBase64 ? Buffer.from(dataPayload, "base64") : Buffer.from(decodeURIComponent(dataPayload));
    // PNG: bytes 16-24 contain width & height as 32-bit big endian uint
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: scan markers for SOF0 (0xFF, 0xC0) or SOF2 (0xFF, 0xC2)
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length - 8) {
        if (buf[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buf[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height };
        }
        const len = buf.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }
  } catch {
    // Ignore dimension parsing failure
  }
  return null;
}

  const isSidebar = (s: AiFlatSection) => {
    return (
      /sidebar|side-nav|side_nav|drawer/i.test(s.name) ||
      (s.purpose && /sidebar|side-nav|side_nav|drawer/i.test(s.purpose)) ||
      s.nodes.some(
        (n: any) =>
          /sidebar|side-nav|side_nav/i.test(n.name || "") ||
          /sidebar|side-nav|side_nav/i.test(n.id || "")
      )
    );
  };

  const isHeader = (s: AiFlatSection) => {
    return (
      /header|navbar|top-nav|top_nav/i.test(s.name) ||
      (s.purpose && /header|navbar|top-nav|top_nav/i.test(s.purpose)) ||
      s.nodes.some(
        (n: any) =>
          n.type === "Navbar" ||
          /header|navbar|top-nav|top_nav/i.test(n.name || "") ||
          /header|navbar|top-nav|top_nav/i.test(n.id || "")
      )
    );
  };

  // Inspect screenshot dimensions to scale layout to screenshot
  const screenshotDims = getImageDimensions(options.desktopScreenshot);
  const screenshotWidth = screenshotDims && screenshotDims.width >= 320 ? screenshotDims.width : null;

  // Scale sidebar width proportionally to screenshot (approx 18-20% of width, bounded between 200 and 280)
  const sidebarWidth = screenshotWidth
    ? Math.round(Math.min(Math.max(screenshotWidth * 0.18, 200), 280))
    : 260;

  const sidebarIndex = visionOutput.sections.findIndex(isSidebar);
  let resolvedSections: AiSection[];

  if (sidebarIndex !== -1) {
    const sidebarSection = visionOutput.sections[sidebarIndex]!;
    const otherSections = visionOutput.sections.filter((_, idx) => idx !== sidebarIndex);
    const headerSections = otherSections.filter(isHeader);
    const contentSections = otherSections.filter((s) => !isHeader(s));

    const sidebarTree = rebuildTreeFromFlatNodes(sidebarSection.nodes);
    const sidebarChildren: AiNode[] =
      sidebarTree.children && sidebarTree.children.length > 0
        ? sidebarTree.children
        : sidebarTree.type !== "Section"
        ? [sidebarTree]
        : [];

    const sidebarColumn: AiNode = {
      type: "Box",
      name: sidebarSection.name || "Sidebar Column",
      style: {
        display: "flex",
        flexDirection: "column",
        backgroundColor: sidebarTree.style?.backgroundColor || "#f8fafc",
        ...(sidebarTree.style || {}),
        width: sidebarWidth,
        minWidth: sidebarWidth,
        maxWidth: sidebarWidth,
        flexShrink: 0,
      },
      children: sidebarChildren,
    };

    const mainChildren: AiNode[] = [];

    // Helper to extract or wrap nodes from a section tree so no nodes are left detached
    const unpackSectionNodes = (tree: AiNode, defaultName: string, isRowLayout: boolean): AiNode => {
      // If the reconstructed tree has children, wrap all children preserving their structure
      const childrenNodes =
        tree.children && tree.children.length > 0
          ? tree.children
          : tree.type !== "Section"
          ? [tree]
          : [];

      return {
        type: "Box",
        name: tree.name || defaultName,
        style: {
          display: "flex",
          flexDirection: isRowLayout ? "row" : "column",
          ...(tree.style || {}),
          width: "100%",
        },
        children: childrenNodes,
      };
    };

    // Header inside main column at top
    for (const hSec of headerSections) {
      const hTree = rebuildTreeFromFlatNodes(hSec.nodes);
      mainChildren.push(unpackSectionNodes(hTree, hSec.name || "Header", true));
    }

    // Content sections inside main column (cards, charts, panels, tables)
    for (const cSec of contentSections) {
      const cTree = rebuildTreeFromFlatNodes(cSec.nodes);
      mainChildren.push(unpackSectionNodes(cTree, cSec.name || "Content Section", false));
    }

    const mainColumn: AiNode = {
      type: "Box",
      name: "Main Content Column",
      style: {
        flex: "1 1 0%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
      },
      children: mainChildren,
    };

    const twoColumnLayout: AiNode = {
      type: "Section",
      name: "Layout (Sidebar + Main)",
      style: {
        display: "flex",
        flexDirection: "row",
        width: "100%",
        minHeight: "100vh",
        alignItems: "stretch",
      },
      children: [sidebarColumn, mainColumn],
    };

    resolvedSections = [
      {
        name: "Main Layout",
        purpose: "Two-column layout with sidebar and main content",
        tree: twoColumnLayout,
      },
    ];
  } else {
    resolvedSections = visionOutput.sections.map((s) => ({
      name: s.name,
      purpose: s.purpose,
      tree: rebuildTreeFromFlatNodes(s.nodes),
    }));
  }

  const compiledSections: Record<string, AiSection[]> = {
    "/": resolvedSections,
  };

  const siteName = options.siteName?.trim() || "Screenshot Import";

  const plan: AiSitePlan = {
    brief: {
      businessType: "Imported Website",
      audience: "General Audience",
      tone: "Modern and Clean",
      goals: ["Present visual hierarchy", "Showcase content"],
      primaryColorName: "Primary",
    },
    theme: {
      colors: {
        primary: "#2563eb",
        secondary: "#4f46e5",
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#0f172a",
        muted: "#64748b",
        border: "#e2e8f0",
        accent: "#06b6d4",
      },
      fonts: {
        heading: headingFontToken,
        body: bodyFontToken,
      },
      spacing: 8,
      radius: 8,
    },
    pages: [
      {
        name: "Home",
        slug: "/",
        title: siteName,
        description: `Imported from screenshot on ${new Date().toLocaleDateString()}`,
        sections: resolvedSections.map((s) => ({
          name: s.name,
          purpose: s.purpose || s.name,
          layout: "content" as const,
        })),
      },
    ],
  };

  // 6. Compile through normalize-and-repair and document validation
  const document = compileAiSiteDocument({
    siteName,
    plan,
    pageSections: compiledSections,
  });

  // Scale canvas breakpoints to screenshot if width detected
  if (screenshotWidth) {
    document.breakpoints = document.breakpoints.map((bp) => {
      if (bp.id === "desktop") {
        return { ...bp, minWidth: screenshotWidth };
      }
      return bp;
    });
  }

  // 7. Build honest report of approximations & skipped items (Item 4.c)
  const skippedCount = (visionOutput.skippedItems || []).length;
  const totalApproximated =
    emptyImageSlots + Math.min(approximatedLayouts, Math.ceil(importedCount * 0.25)) + (visionOutput.charts?.length || 0);

  const warnings: string[] = [];
  const items: Array<{ type: string; message: string }> = [];

  if (emptyImageSlots > 0) {
    const msg = `${emptyImageSlots} image slot${emptyImageSlots > 1 ? "s" : ""} converted to empty image placeholders for manual replacement.`;
    warnings.push(msg);
    items.push({ type: "image_slot", message: msg });
  }

  if (approximatedLayouts > 0) {
    const msg = "CSS layout coordinates approximated into responsive flex/grid boxes.";
    warnings.push(msg);
    items.push({ type: "layout_approximated", message: msg });
  }

  if (visionOutput.charts && visionOutput.charts.length > 0) {
    for (const chart of visionOutput.charts) {
      const msg = `Chart "${chart.name}" approximated with an image placeholder.`;
      warnings.push(msg);
      items.push({ type: "chart", message: msg });
    }
  }

  if (visionOutput.skippedItems && visionOutput.skippedItems.length > 0) {
    for (const skippedItem of visionOutput.skippedItems) {
      const msg = `Skipped un-reproduced element: ${skippedItem}`;
      warnings.push(msg);
      items.push({ type: "skipped", message: msg });
    }
  }

  items.push({
    type: "typography",
    message: `Typography matched to ${headingCat} heading font (${headingFontToken}) and ${bodyCat} body font (${bodyFontToken}).`,
  });

  const report: ScreenshotImportReport = {
    imported: importedCount,
    approximated: totalApproximated,
    skipped: skippedCount,
    warnings,
    details: {
      emptyImageSlots,
      approximatedLayouts,
      approximatedTypography,
      items,
    },
  };

  return { document, report };
}
