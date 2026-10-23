import { nanoid } from "nanoid";
import {
  createBlankDocument,
  type SiteDocument,
  type Element,
  type StyleRule,
  type CSSDeclarations,
} from "@builder/document";
import type { ImportReport } from "./url.js";

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaColorStop {
  position: number;
  color: FigmaColor;
}

export interface FigmaVector2D {
  x: number;
  y: number;
}

export interface FigmaPaint {
  type: "SOLID" | "IMAGE" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | string;
  color?: FigmaColor;
  opacity?: number;
  imageRef?: string;
  gradientHandlePositions?: FigmaVector2D[];
  gradientStops?: FigmaColorStop[];
  visible?: boolean;
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | string;
  offset?: { x: number; y: number };
  radius?: number;
  color?: FigmaColor;
  visible?: boolean;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  letterSpacing?: number;
  fills?: FigmaPaint[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string; // FRAME, COMPONENT, INSTANCE, TEXT, RECTANGLE, VECTOR, GROUP, BOOLEAN_OPERATION, STAR, LINE, ELLIPSE, etc.
  visible?: boolean;
  children?: FigmaNode[];
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX";
  characters?: string;
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<string | number, FigmaTypeStyle>;
  style?: FigmaTypeStyle;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  effects?: FigmaEffect[];
  opacity?: number;
  clipsContent?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

/**
 * In-memory file cache to guarantee only 1 API call per import session.
 */
const fileCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Extracts a Figma file key from a URL or raw key.
 */
export function extractFigmaFileKey(urlOrKey: string): string {
  const trimmed = urlOrKey.trim();
  const match = trimmed.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed.split("?")[0]!.split("/")[0]!;
}

/**
 * Converts a Figma 0..1 color object to CSS rgba string.
 */
export function figmaColorToCss(color?: FigmaColor, opacity = 1): string {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = Math.round(((color.a ?? 1) * opacity) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Fetches Figma file JSON with caching to obey rate limits (1 API file request per session).
 */
export async function fetchFigmaFile(fileKey: string, token: string): Promise<any> {
  const cacheKey = `${fileKey}:${token.slice(-6)}`;
  const cached = fileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: {
      "X-Figma-Token": token,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Figma API Error (${res.status}): ${
        res.status === 403
          ? "Invalid personal access token or access forbidden"
          : errorText || "Failed to fetch Figma file"
      }`
    );
  }

  const data = await res.json();
  fileCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

export interface FigmaFrameSummary {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
}

/**
 * Lists available top-level frames from a fetched Figma file JSON.
 */
export function listFigmaFrames(fileJson: any): FigmaFrameSummary[] {
  const frames: FigmaFrameSummary[] = [];
  const documentNode = fileJson?.document;
  if (!documentNode?.children) return frames;

  for (const canvas of documentNode.children) {
    if (canvas.type === "CANVAS" && canvas.children) {
      for (const node of canvas.children) {
        if (["FRAME", "COMPONENT", "COMPONENT_SET", "GROUP"].includes(node.type)) {
          const bbox = node.absoluteBoundingBox || { width: 0, height: 0 };
          frames.push({
            id: node.id,
            name: node.name,
            type: node.type,
            width: Math.round(bbox.width),
            height: Math.round(bbox.height),
          });
        }
      }
    }
  }

  return frames;
}

export interface ConvertFigmaOptions {
  siteName?: string;
  imageMap?: Record<string, string>;
  fileKey?: string;
  token?: string;
}

/**
 * Checks if a node is a vector, icon, or shape that should be exported as SVG.
 */
export function isVectorOrIconNode(node: FigmaNode): boolean {
  if (!node || node.visible === false) return false;
  const t = node.type?.toUpperCase() || "";
  if (["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE"].includes(t)) {
    return true;
  }
  // Small groups or frames that only contain vectors/shapes
  if (["GROUP", "FRAME"].includes(t) && node.children && node.children.length > 0) {
    const isSmall =
      Boolean(node.absoluteBoundingBox) &&
      (node.absoluteBoundingBox!.width <= 48 && node.absoluteBoundingBox!.height <= 48);
    const hasOnlyVectors = node.children.every((c) =>
      ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE"].includes(c.type?.toUpperCase() || "")
    );
    if (isSmall && hasOnlyVectors) {
      return true;
    }
  }
  return false;
}

/**
 * Collects all vector/icon node IDs from a frame node hierarchy.
 */
export function collectVectorNodeIds(node: FigmaNode): string[] {
  const ids: string[] = [];
  function walk(n: FigmaNode) {
    if (!n || n.visible === false) return;
    if (isVectorOrIconNode(n)) {
      ids.push(n.id);
      return; // don't traverse children if the entire node is treated as an SVG icon
    }
    if (n.children) {
      for (const child of n.children) {
        walk(child);
      }
    }
  }
  walk(node);
  return ids;
}

/**
 * Batches ALL icon node IDs in ONE request to Figma /v1/images endpoint to save rate limits.
 */
export async function batchExportFigmaVectors(
  fileKey: string,
  token: string,
  nodeIds: string[]
): Promise<Record<string, string>> {
  if (!nodeIds || nodeIds.length === 0) return {};

  const uniqueIds = Array.from(new Set(nodeIds));
  const queryParam = uniqueIds.join(",");
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(queryParam)}&format=svg`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Figma-Token": token,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return {};
    }

    const data = await res.json();
    return data?.images || {};
  } catch {
    return {};
  }
}

/**
 * Converts Figma LINEAR and RADIAL gradients into standard CSS gradient strings.
 */
export function figmaGradientToCss(paint: FigmaPaint): string | null {
  if (!paint.gradientStops || paint.gradientStops.length === 0) return null;

  const stops = paint.gradientStops
    .map((stop) => {
      const colorCss = figmaColorToCss(stop.color, paint.opacity ?? 1);
      const posPct = Math.round(stop.position * 100);
      return `${colorCss} ${posPct}%`;
    })
    .join(", ");

  if (paint.type === "GRADIENT_LINEAR") {
    let angleDeg = 180;
    if (paint.gradientHandlePositions && paint.gradientHandlePositions.length >= 2) {
      const p0 = paint.gradientHandlePositions[0]!;
      const p1 = paint.gradientHandlePositions[1]!;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const rad = Math.atan2(dy, dx);
      angleDeg = Math.round((rad * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;
    }
    return `linear-gradient(${angleDeg}deg, ${stops})`;
  }

  if (paint.type === "GRADIENT_RADIAL") {
    return `radial-gradient(circle, ${stops})`;
  }

  return null;
}

/**
 * Recursively converts a picked Figma frame node into a Builder SiteDocument.
 */
export function convertFigmaFrameToDocument(
  frameNode: FigmaNode,
  options?: ConvertFigmaOptions
): { document: SiteDocument; report: ImportReport } {
  const siteName = options?.siteName || frameNode.name || "Figma Imported Site";
  const imageMap = options?.imageMap || {};
  const warnings: string[] = [];
  let imported = 0;
  let approximated = 0;
  let skipped = 0;

  const doc = createBlankDocument(siteName);
  const homePageId = Object.keys(doc.pages)[0] || "page_home";
  const homePage = doc.pages[homePageId]!;

  // Clear existing default elements
  doc.elements = {};
  doc.styles = {};

  const rootBodyId = `el_body_${nanoid(8)}`;
  homePage.rootId = rootBodyId;

  function convertNode(
    node: FigmaNode,
    parentId: string | null,
    isTopLevel = false,
    parentLayoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL",
    parentBoundingBox?: { x: number; y: number; width: number; height: number }
  ): string | null {
    if (!node || node.visible === false || node.name?.startsWith("_") || node.name?.startsWith(".")) {
      skipped++;
      return null;
    }

    imported++;
    const nodeType = node.type?.toUpperCase() || "FRAME";
    let primitiveType = "Box";
    let props: Record<string, any> = {};

    // 1. Determine Primitive Type
    if (isTopLevel) {
      primitiveType = "Section";
    } else if (isVectorOrIconNode(node)) {
      // Exported vector or icon element
      const iconUrl =
        imageMap[node.id] ||
        `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
      const width = node.absoluteBoundingBox?.width || 24;
      const height = node.absoluteBoundingBox?.height || 24;
      primitiveType = "Icon";
      props = {
        name: node.name || "icon",
        size: Math.round(Math.max(width, height)),
        src: iconUrl,
      };
    } else if (nodeType === "TEXT") {
      const text = node.characters || "";
      const baseStyle = node.style || {};
      const fontSize = baseStyle.fontSize || 16;

      // Handle mixed-style text (style overrides per character range)
      const hasOverrides =
        node.characterStyleOverrides &&
        node.characterStyleOverrides.length > 0 &&
        node.styleOverrideTable &&
        Object.keys(node.styleOverrideTable).length > 0;

      if (hasOverrides && text.length > 0) {
        primitiveType = "Text";
        const spans: Array<{ text: string; style?: Record<string, any> }> = [];
        const overrides = node.characterStyleOverrides!;
        const styleTable = node.styleOverrideTable!;

        let currentStyleIndex = overrides[0] ?? 0;
        let currentChunk = text[0] || "";

        for (let i = 1; i < text.length; i++) {
          const styleIdx = overrides[i] ?? 0;
          if (styleIdx === currentStyleIndex) {
            currentChunk += text[i];
          } else {
            // Push previous span
            const overrideStyle = styleTable[currentStyleIndex] || styleTable[String(currentStyleIndex)];
            const spanStyle: Record<string, any> = {};
            if (overrideStyle) {
              if (overrideStyle.fontWeight) spanStyle.fontWeight = String(overrideStyle.fontWeight);
              if (overrideStyle.fontSize) spanStyle.fontSize = `${overrideStyle.fontSize}px`;
              if (overrideStyle.fontFamily) spanStyle.fontFamily = overrideStyle.fontFamily;
              if (overrideStyle.letterSpacing) spanStyle.letterSpacing = `${overrideStyle.letterSpacing}px`;
              if (overrideStyle.fills && overrideStyle.fills.length > 0) {
                const f = overrideStyle.fills[0];
                if (f?.color) spanStyle.color = figmaColorToCss(f.color, f.opacity);
              }
            }
            const spanObj: { text: string; style?: Record<string, any> } = {
              text: currentChunk,
            };
            if (Object.keys(spanStyle).length > 0) {
              spanObj.style = spanStyle;
            }
            spans.push(spanObj);
            currentStyleIndex = styleIdx;
            currentChunk = text[i] || "";
          }
        }

        if (currentChunk.length > 0) {
          const overrideStyle = styleTable[currentStyleIndex] || styleTable[String(currentStyleIndex)];
          const spanStyle: Record<string, any> = {};
          if (overrideStyle) {
            if (overrideStyle.fontWeight) spanStyle.fontWeight = String(overrideStyle.fontWeight);
            if (overrideStyle.fontSize) spanStyle.fontSize = `${overrideStyle.fontSize}px`;
            if (overrideStyle.fontFamily) spanStyle.fontFamily = overrideStyle.fontFamily;
            if (overrideStyle.letterSpacing) spanStyle.letterSpacing = `${overrideStyle.letterSpacing}px`;
            if (overrideStyle.fills && overrideStyle.fills.length > 0) {
              const f = overrideStyle.fills[0];
              if (f?.color) spanStyle.color = figmaColorToCss(f.color, f.opacity);
            }
          }
          const spanObj: { text: string; style?: Record<string, any> } = {
            text: currentChunk,
          };
          if (Object.keys(spanStyle).length > 0) {
            spanObj.style = spanStyle;
          }
          spans.push(spanObj);
        }

        props = {
          text,
          spans,
        };
      } else {
        if (fontSize >= 24) {
          primitiveType = "Heading";
          props = {
            level: fontSize >= 32 ? 1 : 2,
            text: text || "Heading",
          };
        } else {
          primitiveType = "Text";
          props = {
            text: text || "Text",
          };
        }
      }
    } else if (nodeType === "ELLIPSE") {
      primitiveType = "Box";
    } else if (nodeType === "RECTANGLE") {
      const hasImageFill = node.fills?.some((f) => f.type === "IMAGE");
      if (hasImageFill) {
        primitiveType = "Image";
        props = {
          src: "https://images.unsplash.com/photo-1499750310107-5fef28a66643",
          alt: node.name || "Image",
        };
      } else {
        primitiveType = "Box";
      }
    } else if (nodeType === "FRAME" || nodeType === "COMPONENT" || nodeType === "INSTANCE") {
      primitiveType = isTopLevel ? "Section" : "Box";
    }

    const elementId = `el_${primitiveType.toLowerCase()}_${nanoid(8)}`;
    const styleId = `s_${elementId}`;

    // Extract styles
    const declarations: CSSDeclarations = {};

    // Auto Layout -> Flexbox
    if (node.layoutMode === "HORIZONTAL") {
      declarations["display"] = { keyword: "flex" };
      declarations["flexDirection"] = { keyword: "row" };
      if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
        declarations["gap"] = { unit: "px", value: node.itemSpacing };
      }
    } else if (node.layoutMode === "VERTICAL") {
      declarations["display"] = { keyword: "flex" };
      declarations["flexDirection"] = { keyword: "column" };
      if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
        declarations["gap"] = { unit: "px", value: node.itemSpacing };
      }
    }

    // Auto layout alignments
    if (node.primaryAxisAlignItems === "CENTER") {
      declarations["justifyContent"] = { keyword: "center" };
    } else if (node.primaryAxisAlignItems === "SPACE_BETWEEN") {
      declarations["justifyContent"] = { keyword: "space-between" };
    } else if (node.primaryAxisAlignItems === "MAX") {
      declarations["justifyContent"] = { keyword: "flex-end" };
    }

    if (node.counterAxisAlignItems === "CENTER") {
      declarations["alignItems"] = { keyword: "center" };
    } else if (node.counterAxisAlignItems === "MAX") {
      declarations["alignItems"] = { keyword: "flex-end" };
    }

    // Padding
    if (
      node.paddingLeft ||
      node.paddingRight ||
      node.paddingTop ||
      node.paddingBottom
    ) {
      declarations["paddingTop"] = { unit: "px", value: node.paddingTop || 0 };
      declarations["paddingRight"] = { unit: "px", value: node.paddingRight || 0 };
      declarations["paddingBottom"] = { unit: "px", value: node.paddingBottom || 0 };
      declarations["paddingLeft"] = { unit: "px", value: node.paddingLeft || 0 };
    }

    // Fills (Solid, Linear Gradient, Radial Gradient)
    if (node.fills && node.fills.length > 0) {
      const activeFill = node.fills.find((f) => f.visible !== false);
      if (activeFill) {
        if (activeFill.type === "SOLID" && activeFill.color) {
          const cssColor = figmaColorToCss(activeFill.color, activeFill.opacity);
          if (primitiveType === "Heading" || primitiveType === "Text") {
            declarations["color"] = { raw: cssColor };
          } else {
            declarations["backgroundColor"] = { raw: cssColor };
          }
        } else if (activeFill.type === "GRADIENT_LINEAR" || activeFill.type === "GRADIENT_RADIAL") {
          const gradCss = figmaGradientToCss(activeFill);
          if (gradCss) {
            declarations["background"] = { raw: gradCss };
          }
        }
      }
    }

    // Typography styles
    if (node.style) {
      if (node.style.fontFamily) {
        declarations["fontFamily"] = { raw: node.style.fontFamily };
      }
      if (node.style.fontSize) {
        declarations["fontSize"] = { unit: "px", value: node.style.fontSize };
      }
      if (node.style.fontWeight) {
        declarations["fontWeight"] = { raw: String(node.style.fontWeight) };
      }
      if (node.style.lineHeightPx) {
        declarations["lineHeight"] = { unit: "px", value: Math.round(node.style.lineHeightPx) };
      }
      if (node.style.textAlignHorizontal) {
        declarations["textAlign"] = { keyword: node.style.textAlignHorizontal.toLowerCase() };
      }
      if (node.style.letterSpacing) {
        declarations["letterSpacing"] = { unit: "px", value: Math.round(node.style.letterSpacing * 10) / 10 };
      }
    }

    // Strokes -> border
    if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
      const solidStroke = node.strokes.find((s) => s.type === "SOLID" && s.visible !== false);
      const strokeColor = solidStroke?.color ? figmaColorToCss(solidStroke.color) : "#000000";
      declarations["border"] = { raw: `${node.strokeWeight}px solid ${strokeColor}` };
    }

    // Shapes: ELLIPSE -> 50% border radius
    if (nodeType === "ELLIPSE") {
      declarations["borderRadius"] = { unit: "%", value: 50 };
    } else if (node.rectangleCornerRadii && node.rectangleCornerRadii.length === 4) {
      // Per-corner radius [top-left, top-right, bottom-right, bottom-left]
      const [tl, tr, br, bl] = node.rectangleCornerRadii;
      declarations["borderRadius"] = { raw: `${tl}px ${tr}px ${br}px ${bl}px` };
    } else if (node.cornerRadius) {
      declarations["borderRadius"] = { unit: "px", value: node.cornerRadius };
    }

    // Opacity
    if (node.opacity !== undefined && node.opacity < 1) {
      declarations["opacity"] = { raw: String(node.opacity) };
    }

    // clipsContent -> overflow: hidden
    if (node.clipsContent) {
      declarations["overflow"] = { keyword: "hidden" };
    }

    // Effects -> Drop Shadows
    if (node.effects && node.effects.length > 0) {
      const dropShadow = node.effects.find((e) => e.type === "DROP_SHADOW" && e.visible !== false);
      if (dropShadow) {
        const offset = dropShadow.offset || { x: 0, y: 4 };
        const radius = dropShadow.radius || 8;
        const color = figmaColorToCss(dropShadow.color);
        declarations["boxShadow"] = { raw: `${offset.x}px ${offset.y}px ${radius}px ${color}` };
      }

      // Check for unsupported effects
      const unsupported = node.effects.filter((e) => !["DROP_SHADOW"].includes(e.type));
      if (unsupported.length > 0) {
        approximated++;
        warnings.push(`Layer "${node.name}" uses effects (${unsupported.map((u) => u.type).join(", ")}) approximated or skipped.`);
      }
    }

    // Free positioning calculation for children of non-Auto-Layout frames
    if (
      !isTopLevel &&
      (!parentLayoutMode || parentLayoutMode === "NONE") &&
      parentBoundingBox &&
      node.absoluteBoundingBox
    ) {
      const relLeft = Math.round(node.absoluteBoundingBox.x - parentBoundingBox.x);
      const relTop = Math.round(node.absoluteBoundingBox.y - parentBoundingBox.y);
      declarations["position"] = { keyword: "absolute" };
      declarations["left"] = { unit: "px", value: relLeft };
      declarations["top"] = { unit: "px", value: relTop };
      if (node.absoluteBoundingBox.width) {
        declarations["width"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.width) };
      }
      if (node.absoluteBoundingBox.height) {
        declarations["height"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.height) };
      }
    } else if (!isTopLevel && node.absoluteBoundingBox && !parentLayoutMode) {
      if (node.absoluteBoundingBox.width) {
        declarations["width"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.width) };
      }
      if (node.absoluteBoundingBox.height) {
        declarations["height"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.height) };
      }
    }

    // Top-level section bounds: keep width (e.g. 390px) and center on canvas
    if (isTopLevel) {
      declarations["width"] = { unit: "%", value: 100 };
      if (node.absoluteBoundingBox?.width) {
        declarations["maxWidth"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.width) };
        declarations["marginLeft"] = { keyword: "auto" };
        declarations["marginRight"] = { keyword: "auto" };
      }
    }

    // If frame has non-Auto-Layout layoutMode, establish relative positioning container
    if (!node.layoutMode || node.layoutMode === "NONE") {
      if (!declarations["position"]) {
        declarations["position"] = { keyword: "relative" };
      }
      if (node.absoluteBoundingBox?.height) {
        declarations["minHeight"] = { unit: "px", value: Math.round(node.absoluteBoundingBox.height) };
      }
    }

    const styleRule: StyleRule = {
      id: styleId,
      kind: "local",
      values: {
        desktop: {
          default: declarations,
        },
      },
    };
    doc.styles[styleId] = styleRule;

    // Children: If this node is not a vector/icon leaf, traverse children preserving z-order
    const childrenIds: string[] = [];
    if (!isVectorOrIconNode(node) && node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childId = convertNode(
          child,
          elementId,
          false,
          node.layoutMode || "NONE",
          node.absoluteBoundingBox
        );
        if (childId) childrenIds.push(childId);
      }
    }

    const el: Element = {
      id: elementId,
      type: primitiveType,
      name: node.name || primitiveType,
      parentId,
      children: childrenIds,
      props,
      styleIds: [styleId],
      origin: "figma",
    };

    doc.elements[elementId] = el;
    return elementId;
  }

  // Create Body element
  const bodyStyleId = `s_${rootBodyId}`;
  doc.styles[bodyStyleId] = {
    id: bodyStyleId,
    kind: "local",
    values: {
      desktop: {
        default: {
          minHeight: { unit: "vh", value: 100 },
          display: { keyword: "flex" },
          flexDirection: { keyword: "column" },
        },
      },
    },
  };

  const topLevelSectionId = convertNode(frameNode, rootBodyId, true);

  doc.elements[rootBodyId] = {
    id: rootBodyId,
    type: "Body",
    name: "Body",
    parentId: null,
    children: topLevelSectionId ? [topLevelSectionId] : [],
    props: {},
    styleIds: [bodyStyleId],
  };

  return {
    document: doc,
    report: {
      imported,
      approximated,
      skipped,
      warnings,
    },
  };
}

