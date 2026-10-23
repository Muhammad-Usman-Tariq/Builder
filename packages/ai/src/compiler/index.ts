import {
  type SiteDocument,
  type Element,
  type StyleRule,
  type StyleValue,
  type Page,
  type DesignTokens,
  DEFAULT_BREAKPOINTS,
  validateSiteDocument,
} from "@builder/document";
import type { AiNode, AiFlatNode, AiSection, AiSitePlan, AiThemeTokens } from "../schema/ai-tree.js";
import { normalizeAndRepairDocument, normalizeAndRepairStyleValue } from "./repair.js";

export { normalizeAndRepairDocument, normalizeAndRepairStyleValue };

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Rebuilds a hierarchical AiNode tree from a flat array of nodes.
 * Validates unique IDs, valid parents, and detects cycles.
 * Section B.1
 */
export function rebuildTreeFromFlatNodes(nodes: AiFlatNode[]): AiNode {
  if (!nodes || nodes.length === 0) {
    throw new Error("Cannot rebuild tree: node list is empty.");
  }

  // 1. Validate unique IDs
  const idMap = new Map<string, AiFlatNode>();
  for (const node of nodes) {
    if (!node.id) {
      throw new Error("Invalid AI node: missing node ID.");
    }
    if (idMap.has(node.id)) {
      throw new Error(`Duplicate node ID found in AI tree: "${node.id}".`);
    }
    idMap.set(node.id, node);
  }

  // 2. Validate parents
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    childrenMap.set(node.id, []);
  }

  const rootNodes: AiFlatNode[] = [];
  for (const node of nodes) {
    if (!node.parentId) {
      rootNodes.push(node);
    } else {
      if (!idMap.has(node.parentId)) {
        throw new Error(
          `Invalid parentId: node "${node.id}" references non-existent parent "${node.parentId}".`
        );
      }
      childrenMap.get(node.parentId)!.push(node.id);
    }
  }

  if (rootNodes.length === 0) {
    throw new Error("No root node found: all nodes have parent references (cycle detected).");
  }

  // 3. Cycle detection using 3-color DFS (0 = unvisited, 1 = visiting, 2 = visited)
  const visitState = new Map<string, number>();
  for (const node of nodes) {
    visitState.set(node.id, 0);
  }

  function detectCycle(currentId: string, path: string[]): void {
    visitState.set(currentId, 1);
    const children = childrenMap.get(currentId) || [];
    for (const childId of children) {
      const state = visitState.get(childId) ?? 0;
      if (state === 1) {
        throw new Error(
          `Cycle detected in AI tree: ${path.join(" -> ")} -> ${currentId} -> ${childId}.`
        );
      }
      if (state === 0) {
        detectCycle(childId, [...path, currentId]);
      }
    }
    visitState.set(currentId, 2);
  }

  for (const root of rootNodes) {
    detectCycle(root.id, []);
  }

  // Check if any unreachable nodes form detached cycles
  for (const node of nodes) {
    if (visitState.get(node.id) === 0) {
      detectCycle(node.id, []);
    }
  }

  // 4. Build hierarchical AiNode
  function buildAiNode(flat: AiFlatNode): AiNode {
    const rawProps = flat.props || {};
    const childIds = childrenMap.get(flat.id) || [];
    const children = childIds.map((cid) => buildAiNode(idMap.get(cid)!));

    let level: number | undefined = undefined;
    if (rawProps["level"] !== undefined) {
      const l =
        typeof rawProps["level"] === "string"
          ? parseInt(rawProps["level"].replace(/\D/g, ""), 10)
          : Number(rawProps["level"]);
      level = Math.min(Math.max(l || 2, 1), 6);
    }

    return {
      type: flat.type,
      name: flat.name || (rawProps["name"] as string | undefined),
      style: flat.style,
      level,
      text: rawProps["text"] as string | undefined,
      href: rawProps["href"] as string | undefined,
      variant: rawProps["variant"] as any,
      src: rawProps["src"] as string | undefined,
      imageQuery: rawProps["imageQuery"] as string | undefined,
      alt: rawProps["alt"] as string | undefined,
      nameProp:
        (rawProps["nameProp"] as string | undefined) ??
        (rawProps["name"] as string | undefined),
      placeholder: rawProps["placeholder"] as string | undefined,
      inputType: rawProps["inputType"] as string | undefined,
      brandText: rawProps["brandText"] as string | undefined,
      links: rawProps["links"] as any,
      ctaText: rawProps["ctaText"] as string | undefined,
      ctaHref: rawProps["ctaHref"] as string | undefined,
      children: children.length > 0 ? children : undefined,
    };
  }

  if (rootNodes.length === 1) {
    return buildAiNode(rootNodes[0]!);
  }

  const primaryRoot = rootNodes.find((r) => r.type === "Section") || rootNodes[0]!;
  const builtPrimary = buildAiNode(primaryRoot);
  const otherRoots = rootNodes.filter((r) => r.id !== primaryRoot.id).map(buildAiNode);
  builtPrimary.children = [...(builtPrimary.children || []), ...otherRoots];
  return builtPrimary;
}

/**
 * Maps raw CSS or token styles from an AI node into a StyleValue map.
 */
function compileAiStyleToDeclarations(
  styleObj?: Record<string, string | number>
): Record<string, StyleValue> {
  if (!styleObj) return {};
  const decls: Record<string, StyleValue> = {};

  for (const [key, value] of Object.entries(styleObj)) {
    const repaired = normalizeAndRepairStyleValue(key, value);
    if (repaired !== null) {
      decls[key] = repaired;
    } else {
      console.warn(`[AI Compiler] Dropped invalid style property "${key}":`, value);
    }
  }

  return decls;
}

/**
 * Context for compiling an AI tree into a SiteDocument.
 */
interface CompilerContext {
  elements: Record<string, Element>;
  styles: Record<string, StyleRule>;
}

/**
 * Recursively converts an AiNode tree into flat Elements and StyleRules.
 */
export function compileAiNode(
  node: AiNode,
  parentId: string,
  ctx: CompilerContext
): string {
  const elId = randomId("el");
  const styleId = randomId("st");

  // Create style rule
  const declarations = compileAiStyleToDeclarations(node.style);
  ctx.styles[styleId] = {
    id: styleId,
    kind: "local",
    name: `${node.name || node.type} Style`,
    values: {
      desktop: {
        default: declarations,
      },
    },
  };

  // Compile props based on type
  const props: Record<string, any> = {};
  if (node.text !== undefined) props["text"] = node.text;
  if (node.level !== undefined) props["level"] = node.level;
  if (node.href !== undefined) props["href"] = node.href;
  if (node.variant !== undefined) props["variant"] = node.variant;
  if (node.src !== undefined) props["src"] = node.src;
  if (node.alt !== undefined) props["alt"] = node.alt;
  if (node.placeholder !== undefined) props["placeholder"] = node.placeholder;
  if (node.nameProp !== undefined) props["name"] = node.nameProp;
  if (node.inputType !== undefined) props["inputType"] = node.inputType;
  if (node.brandText !== undefined) props["brandText"] = node.brandText;
  if (node.links !== undefined) props["links"] = node.links;
  if (node.ctaText !== undefined) props["ctaText"] = node.ctaText;
  if (node.ctaHref !== undefined) props["ctaHref"] = node.ctaHref;
  if (node.imageQuery !== undefined) props["imageQuery"] = node.imageQuery;

  // Defaults if missing
  if (node.type === "Heading" && !props["text"]) props["text"] = "Heading";
  if (node.type === "Text" && !props["text"]) props["text"] = "Text block content.";
  if (node.type === "Button" && !props["text"]) props["text"] = "Click Here";
  if (node.type === "Image") {
    props["src"] = node.src || "";
    props["alt"] = node.alt || "Website image";
    props["imageQuery"] = node.imageQuery || props["alt"] || "business";
  }

  // Create Element
  ctx.elements[elId] = {
    id: elId,
    type: node.type,
    name: node.name || node.type,
    parentId,
    children: [],
    styleIds: [styleId],
    props,
    origin: "ai",
    aiLocked: false,
  };

  // Recursively compile children
  if (node.children && node.children.length > 0) {
    for (const childNode of node.children) {
      const childId = compileAiNode(childNode, elId, ctx);
      ctx.elements[elId]!.children.push(childId);
    }
  }

  return elId;
}

/**
 * Builds default DesignTokens from an AiThemeTokens object.
 */
export function buildTokensFromTheme(theme: AiThemeTokens): DesignTokens {
  return {
    colors: {
      "color.primary": theme.colors.primary,
      "color.secondary": theme.colors.secondary,
      "color.background": theme.colors.background,
      "color.surface": theme.colors.surface,
      "color.text": theme.colors.text,
      "color.textMuted": theme.colors.muted,
      "color.border": theme.colors.border,
      "color.accent": theme.colors.accent,
      ...theme.colors,
    },
    fonts: {
      heading: theme.fonts.heading,
      body: theme.fonts.body,
      mono: "monospace",
    },
    spacing: {
      "space.xs": "4px",
      "space.sm": `${theme.spacing}px`,
      "space.md": `${theme.spacing * 2}px`,
      "space.lg": `${theme.spacing * 3}px`,
      "space.xl": `${theme.spacing * 4}px`,
    },
    radius: {
      "radius.none": "0px",
      "radius.sm": `${Math.max(2, Math.floor(theme.radius / 2))}px`,
      "radius.md": `${theme.radius}px`,
      "radius.lg": `${theme.radius * 2}px`,
      "radius.full": "9999px",
    },
    shadows: {
      "shadow.sm": "0 1px 2px rgba(0,0,0,0.05)",
      "shadow.md": "0 4px 6px -1px rgba(0,0,0,0.1)",
      "shadow.lg": "0 10px 15px -3px rgba(0,0,0,0.1)",
    },
  };
}

export interface CompileSiteInput {
  siteName: string;
  plan: AiSitePlan;
  pageSections: Record<string, AiSection[]>; // map slug -> sections
}

/**
 * Compiles a full AI-generated site plan and sections into a validated SiteDocument.
 * Non-negotiable rule 8 & Section 10.1
 */
export function compileAiSiteDocument(input: CompileSiteInput): SiteDocument {
  const ctx: CompilerContext = {
    elements: {},
    styles: {},
  };

  const pages: Record<string, Page> = {};
  let homePageId = "";

  for (const pagePlan of input.plan.pages) {
    const pageId = randomId("pg");
    const rootId = randomId("el_body");
    const rootStyleId = randomId("st_body");

    const isHomePlan =
      pagePlan.slug === "/" ||
      pagePlan.slug === "/_root_" ||
      pagePlan.slug === "_root_" ||
      pagePlan.slug === "/root" ||
      pagePlan.slug === "root" ||
      pagePlan.name.toLowerCase() === "home" ||
      !homePageId;

    if (isHomePlan && !homePageId) {
      homePageId = pageId;
    }

    const finalSlug =
      isHomePlan && homePageId === pageId
        ? "/"
        : pagePlan.slug === "/_root_" || pagePlan.slug === "_root_"
        ? "/"
        : pagePlan.slug;

    // Body root style
    ctx.styles[rootStyleId] = {
      id: rootStyleId,
      kind: "local",
      name: `${pagePlan.name} Body Style`,
      values: {
        desktop: {
          default: {
            minHeight: { unit: "vh", value: 100 },
            backgroundColor: { raw: input.plan.theme.colors.background },
            color: { raw: input.plan.theme.colors.text },
            fontFamily: { raw: input.plan.theme.fonts.body },
          },
        },
      },
    };

    // Body element
    ctx.elements[rootId] = {
      id: rootId,
      type: "Body",
      name: "Page Body",
      parentId: null,
      children: [],
      styleIds: [rootStyleId],
      props: {},
      origin: "ai",
      aiLocked: false,
    };

    // Compile sections for this page
    const sections =
      input.pageSections[pagePlan.slug] ||
      input.pageSections[finalSlug] ||
      (finalSlug === "/" ? input.pageSections["/_root_"] : undefined) ||
      [];
    for (const sec of sections) {
      const sectionNode = sec.tree;
      const secId = compileAiNode(sectionNode, rootId, ctx);
      ctx.elements[rootId]!.children.push(secId);
    }

    pages[pageId] = {
      id: pageId,
      name: pagePlan.name,
      slug: finalSlug,
      rootId,
      seo: {
        title: pagePlan.title?.includes(input.siteName)
          ? pagePlan.title
          : `${pagePlan.title || pagePlan.name} | ${input.siteName}`,
        description: pagePlan.description,
      },
      status: "draft",
    };
  }

  // Enforce consistent business name across elements (Navbar brandText, footer copy, etc.)
  for (const el of Object.values(ctx.elements)) {
    if (!el || !el.props) continue;
    if (el.type === "Navbar") {
      el.props["brandText"] = input.siteName;
    }
    // If text contains common placeholder / hallucinated brand names or copyright footer
    if (typeof el.props["text"] === "string") {
      el.props["text"] = el.props["text"]
        .replace(/Maison des Fleurs/gi, input.siteName)
        .replace(/©\s*\d{4}\s+[^.,\n|]+/g, `© ${new Date().getFullYear()} ${input.siteName}`);
    }
  }

  const doc: SiteDocument = {
    schemaVersion: 1,
    site: {
      name: input.siteName,
      defaultLocale: "en",
      locales: ["en"],
    },
    breakpoints: DEFAULT_BREAKPOINTS,
    tokens: buildTokensFromTheme(input.plan.theme),
    elements: ctx.elements,
    styles: ctx.styles,
    pages,
    components: {},
    assets: {},
  };

  // 1. Normalize and repair document (repair missing slugs, style shorthands/units/keywords)
  const repairWarnings: string[] = [];
  normalizeAndRepairDocument(doc, { warnings: repairWarnings });
  (doc as any).repairWarningsCount = repairWarnings.length;

  // 2. Run full validation from packages/document
  const validation = validateSiteDocument(doc);
  if (!validation.valid) {
    const errorMsg = `AI Compiler validation failed after repair: ${validation.errors.map((e) => `${e.path} (${e.message})`).join("; ")}`;
    console.error(`[AI Compiler] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  return doc;
}
