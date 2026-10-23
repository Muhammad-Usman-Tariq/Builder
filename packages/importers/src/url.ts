import { chromium, type Browser } from "@playwright/test";
import { nanoid } from "nanoid";
import {
  createBlankDocument,
  type SiteDocument,
  type Element,
  type StyleRule,
  type CSSDeclarations,
  type StyleValue,
} from "@builder/document";
import { validateUrlSsrf } from "./ssrf.js";
import { checkRobotsTxt } from "./robots.js";

export interface ImportReportDetails {
  droppedBackgroundImages: number;
  unsupportedElements: number;
  convertedLayouts: number;
  removedScripts: number;
  prunedEmptyBoxes: number;
  items: Array<{ type: string; message: string }>;
}

export interface ImportReport {
  imported: number;
  approximated: number;
  skipped: number;
  warnings: string[];
  details?: ImportReportDetails;
}

export interface UrlImportOptions {
  url: string;
  siteName?: string;
  workspaceId?: string;
  allowLocal?: boolean;
  timeoutMs?: number;
  aiCleanup?: boolean;
}

export interface UrlImportResult {
  success: boolean;
  document: SiteDocument;
  report: ImportReport;
}

interface RawNode {
  id: string;
  tagName: string;
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  type?: string;
  placeholder?: string;
  name?: string;
  bgUrl?: string;
  svgContent?: string;
  width?: string;
  height?: string;
  stylesDesktop: Record<string, string>;
  stylesTablet?: Record<string, string> | undefined;
  stylesMobile?: Record<string, string> | undefined;
  children: RawNode[];
}

/**
 * Extracts clean computed style values to our StyleValue format.
 */
function cssVal(val: string): StyleValue {
  if (/^-?\d+(\.\d+)?(px|%|rem|em|vh|vw|fr)$/.test(val)) {
    const match = val.match(/^(-?\d+(\.\d+)?)(px|%|rem|em|vh|vw|fr)$/);
    if (match && match[1] && match[3]) {
      return { value: parseFloat(match[1]), unit: match[3] as any };
    }
  }
  if (/^[a-z-]+$/.test(val)) {
    return { keyword: val };
  }
  return { raw: val };
}

/**
 * Checks if a CSS background color is considered transparent.
 */
function isTransparent(colorStr?: string): boolean {
  if (!colorStr) return true;
  const c = colorStr.trim().toLowerCase();
  return (
    c === "" ||
    c === "none" ||
    c === "transparent" ||
    c === "rgba(0, 0, 0, 0)" ||
    c === "rgba(0,0,0,0)" ||
    c === "hsla(0, 0%, 0%, 0)"
  );
}

/**
 * Checks if an element has a visible border.
 */
function hasVisibleBorder(styles: Record<string, string>): boolean {
  if (styles.border && styles.border !== "none" && !styles.border.startsWith("0px")) return true;
  if (
    styles.borderWidth &&
    styles.borderWidth !== "0px" &&
    styles.borderStyle &&
    styles.borderStyle !== "none"
  ) {
    return true;
  }
  return false;
}

/**
 * Maps HTML nodes to our builder primitives.
 */
function mapTagToPrimitiveType(tag: string, text?: string, nodeTypeAttr?: string): string {
  const t = tag.toLowerCase();
  if (t === "body") return "Body";
  if (["header", "footer", "section", "main", "article", "nav", "aside"].includes(t)) return "Section";
  if (/^h[1-6]$/.test(t)) return "Heading";
  if (["p", "strong", "em", "b", "i", "li", "small", "blockquote"].includes(t)) return "Text";
  if (t === "span" || t === "label") return "Text";
  if (t === "img") return "Image";
  if (t === "svg") return "Image"; // Inline SVG icons mapped to Image asset
  if (t === "button") return "Button";
  if (t === "input" && (nodeTypeAttr === "button" || nodeTypeAttr === "submit")) return "Button";
  if (t === "a") {
    // If text is short or styled like a button, treat as Button, else Link
    return text && text.trim().length > 0 && text.trim().length < 30 ? "Button" : "Link";
  }
  if (t === "form") return "Form";
  if (t === "input") return "Input";
  if (t === "textarea") return "Textarea";
  if (t === "select") return "Input";
  if (["table", "tbody", "thead", "tfoot", "tr", "td", "th"].includes(t)) return "Box";
  if (t === "div") return "Box";
  return "Box";
}

/**
 * Imports a web page from a URL into a valid Builder SiteDocument.
 */
export async function importFromUrl(options: UrlImportOptions): Promise<UrlImportResult> {
  const { url, siteName = "Imported Website", allowLocal = false, timeoutMs = 30000 } = options;
  const warnings: string[] = [];
  let importedCount = 0;
  let approximatedCount = 0;
  let skippedCount = 0;

  // 1. SSRF Guard
  const ssrf = await validateUrlSsrf(url, { allowLocal });
  if (!ssrf.valid) {
    throw new Error(`SSRF Guard: ${ssrf.error}`);
  }

  // 2. Robots.txt Compliance Check
  if (!allowLocal) {
    const robots = await checkRobotsTxt(url);
    if (!robots.allowed) {
      throw new Error(robots.reason || "Crawling this URL is disallowed by robots.txt");
    }
  }

  let browser: Browser | null = null;
  let capturedTree: RawNode | null = null;
  let evalStats = {
    removedScripts: 0,
    unsupportedElements: 0,
    convertedLayouts: 0,
    droppedBackgroundImages: 0,
  };

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    // Prevent esbuild/tsx __name bundling helper ReferenceError inside browser context
    await page.addInitScript(() => {
      try {
        (window as any).__name = (fn: any) => fn;
        (globalThis as any).__name = (fn: any) => fn;
      } catch {}
    });

    // 3. Desktop capture (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // Extract DOM tree & computed styles function
    const extractScript = () => {
      if (typeof (globalThis as any).__name === "undefined") {
        (globalThis as any).__name = (fn: any) => fn;
      }
      if (typeof (window as any).__name === "undefined") {
        (window as any).__name = (fn: any) => fn;
      }
      let elementCount = 0;
      const MAX_ELEMENTS = 800;
      let removedScripts = 0;
      let unsupportedElements = 0;
      let convertedLayouts = 0;
      let droppedBackgroundImages = 0;

      function extractNode(el: HTMLElement): any {
        if (!el || elementCount >= MAX_ELEMENTS) return null;

        const tag = el.tagName.toLowerCase();

        // 1. Skip and track scripts & noscript
        if (tag === "script" || tag === "noscript") {
          removedScripts++;
          return null;
        }

        // 2. Skip and track unsupported interactive / media elements
        if (["iframe", "canvas", "video", "audio", "object", "embed", "applet"].includes(tag)) {
          unsupportedElements++;
          return null;
        }

        // 3. Skip metadata, head tags, and aria-hidden elements
        if (
          ["style", "meta", "link", "template"].includes(tag) ||
          el.getAttribute("aria-hidden") === "true"
        ) {
          return null;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 && rect.height <= 1 && (tag === "img" || tag === "div")) {
          return null; // tracking pixel
        }

        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") {
          return null;
        }

        elementCount++;

        // 4. Capture inline SVG icons
        if (tag === "svg") {
          const w = rect.width > 0 ? `${Math.round(rect.width)}px` : el.getAttribute("width") || "24px";
          const h = rect.height > 0 ? `${Math.round(rect.height)}px` : el.getAttribute("height") || "24px";
          return {
            id: el.getAttribute("id") || `node_${Math.random().toString(36).substring(2, 9)}`,
            tagName: "svg",
            svgContent: el.outerHTML,
            width: w,
            height: h,
            alt: el.getAttribute("aria-label") || el.getAttribute("title") || "Icon",
            stylesDesktop: {
              display: "inline-block",
              width: w,
              height: h,
            },
            children: [],
          };
        }

        // 5. Extract background image
        let bgImg = cs.backgroundImage;
        let bgUrl: string | undefined;
        if (bgImg && bgImg !== "none") {
          if (!bgImg.startsWith("linear-gradient") && !bgImg.startsWith("radial-gradient")) {
            const match = bgImg.match(/url\(["']?(.*?)["']?\)/i);
            if (match && match[1]) {
              try {
                bgUrl = new URL(match[1], window.location.href).href;
                bgImg = `url("${bgUrl}")`;
              } catch {
                droppedBackgroundImages++;
              }
            }
          }
        }

        // 6. Layout structure preservation (Grid, Table, Inline-block rows)
        let display = cs.display;
        let flexDirection = cs.flexDirection;
        let flexWrap = cs.flexWrap;
        let gridTemplateColumns = cs.gridTemplateColumns;
        let gridTemplateRows = cs.gridTemplateRows;
        let gap = cs.gap;
        let columnGap = cs.columnGap;
        let rowGap = cs.rowGap;

        if (display === "grid" || display === "inline-grid") {
          convertedLayouts++;
          display = "grid";
        }

        // Table layout conversion
        if (tag === "table" || tag === "tbody" || tag === "thead" || tag === "tfoot") {
          convertedLayouts++;
          display = "flex";
          flexDirection = "column";
        } else if (tag === "tr") {
          convertedLayouts++;
          display = "flex";
          flexDirection = "row";
        } else if (tag === "td" || tag === "th") {
          display = "flex";
          flexDirection = "column";
        }

        // Inline-block child buttons/items converted to flex wrap row
        if (display === "block" || display === "inline-block") {
          let inlineBlockChildren = 0;
          for (let i = 0; i < el.children.length; i++) {
            const ch = el.children[i] as HTMLElement;
            if (ch) {
              const chCs = window.getComputedStyle(ch);
              if (
                chCs.display === "inline-block" ||
                chCs.display === "inline-flex" ||
                ch.tagName.toLowerCase() === "button"
              ) {
                inlineBlockChildren++;
              }
            }
          }
          if (inlineBlockChildren >= 2) {
            convertedLayouts++;
            display = "flex";
            flexWrap = "wrap";
            if (!gap || gap === "normal") gap = "8px";
          }
        }

        const desktopStyles: Record<string, string> = {
          display,
          flexDirection,
          flexWrap: flexWrap !== "nowrap" ? flexWrap : "",
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          gap: gap !== "normal" ? gap : "",
          columnGap: columnGap !== "normal" ? columnGap : "",
          rowGap: rowGap !== "normal" ? rowGap : "",
          gridTemplateColumns: gridTemplateColumns !== "none" ? gridTemplateColumns : "",
          gridTemplateRows: gridTemplateRows !== "none" ? gridTemplateRows : "",
          padding: cs.padding,
          margin: cs.margin,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          backgroundImage: bgImg && bgImg !== "none" ? bgImg : "",
          backgroundSize: cs.backgroundSize !== "auto" ? cs.backgroundSize : (bgUrl ? "cover" : ""),
          backgroundPosition: cs.backgroundPosition,
          backgroundRepeat: cs.backgroundRepeat,
          width: cs.width && cs.width !== "auto" ? cs.width : "",
          height: cs.height && cs.height !== "auto" ? cs.height : "",
          maxWidth: cs.maxWidth && cs.maxWidth !== "none" ? cs.maxWidth : "",
          minWidth: cs.minWidth && cs.minWidth !== "0px" && cs.minWidth !== "auto" ? cs.minWidth : "",
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          textAlign: cs.textAlign,
          textDecoration: cs.textDecorationLine && cs.textDecorationLine !== "none" ? cs.textDecorationLine : "",
          borderRadius: cs.borderRadius,
          border: cs.border,
          borderWidth: cs.borderWidth,
          borderStyle: cs.borderStyle,
          borderColor: cs.borderColor,
          boxShadow: cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "",
        };

        const children: any[] = [];
        for (let i = 0; i < el.children.length; i++) {
          if (elementCount >= MAX_ELEMENTS) break;
          const childNode = extractNode(el.children[i] as HTMLElement);
          if (childNode) children.push(childNode);
        }

        let directText = "";
        for (let i = 0; i < el.childNodes.length; i++) {
          const n = el.childNodes[i];
          if (n && n.nodeType === Node.TEXT_NODE) {
            const txt = (n.textContent || "").trim();
            if (txt) directText += (directText ? " " : "") + txt;
          }
        }

        return {
          id: el.getAttribute("id") || `node_${Math.random().toString(36).substring(2, 9)}`,
          tagName: tag,
          text: directText || (children.length === 0 ? (el.textContent || "").trim() : ""),
          href: el.getAttribute("href") || undefined,
          src: el.getAttribute("src") || undefined,
          alt: el.getAttribute("alt") || undefined,
          placeholder: el.getAttribute("placeholder") || undefined,
          name: el.getAttribute("name") || undefined,
          type: el.getAttribute("type") || undefined,
          bgUrl,
          stylesDesktop: desktopStyles,
          children,
        };
      }

      const bodyEl = document.body;
      const rootNode = extractNode(bodyEl);
      return {
        rootNode,
        stats: {
          removedScripts,
          unsupportedElements,
          convertedLayouts,
          droppedBackgroundImages,
        },
      };
    };

    const evalResult = await page.evaluate(extractScript);
    capturedTree = evalResult?.rootNode || null;
    if (evalResult?.stats) {
      evalStats = evalResult.stats;
    }

    if (!capturedTree) {
      throw new Error("Failed to extract layout structure from target page.");
    }

    // 4. Tablet capture (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(250);

    const tabletStylesMap = await page.evaluate(() => {
      const map: Record<string, Record<string, string>> = {};
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length; i++) {
        const el = all[i] as HTMLElement;
        const id = el.getAttribute("id");
        if (id) {
          const cs = window.getComputedStyle(el);
          map[id] = {
            fontSize: cs.fontSize,
            display: cs.display,
            flexDirection: cs.flexDirection,
            padding: cs.padding,
            textAlign: cs.textAlign,
            gridTemplateColumns: cs.gridTemplateColumns !== "none" ? cs.gridTemplateColumns : "",
            gap: cs.gap !== "normal" ? cs.gap : "",
          };
        }
      }
      return map;
    });

    // 5. Mobile capture (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(250);

    const mobileStylesMap = await page.evaluate(() => {
      const map: Record<string, Record<string, string>> = {};
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length; i++) {
        const el = all[i] as HTMLElement;
        const id = el.getAttribute("id");
        if (id) {
          const cs = window.getComputedStyle(el);
          map[id] = {
            fontSize: cs.fontSize,
            display: cs.display,
            flexDirection: cs.flexDirection,
            padding: cs.padding,
            textAlign: cs.textAlign,
            gridTemplateColumns: cs.gridTemplateColumns !== "none" ? cs.gridTemplateColumns : "",
            gap: cs.gap !== "normal" ? cs.gap : "",
          };
        }
      }
      return map;
    });

    // Attach tablet/mobile styles
    function attachResponsive(node: RawNode) {
      const tab = node.id ? tabletStylesMap[node.id] : undefined;
      if (tab) {
        node.stylesTablet = tab;
      }
      const mob = node.id ? mobileStylesMap[node.id] : undefined;
      if (mob) {
        node.stylesMobile = mob;
      }
      for (const child of node.children) {
        attachResponsive(child);
      }
    }
    attachResponsive(capturedTree);

    // Record stats
    skippedCount += evalStats.removedScripts + evalStats.unsupportedElements;
    approximatedCount += evalStats.convertedLayouts + evalStats.droppedBackgroundImages;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // 6. Build Document Tree
  const doc = createBlankDocument(siteName);
  const homePageId = Object.keys(doc.pages)[0] || "page_home";
  const homePage = doc.pages[homePageId]!;

  // Reset root elements
  doc.elements = {};
  doc.styles = {};

  const rootBodyId = `el_body_${nanoid(8)}`;
  homePage.rootId = rootBodyId;

  let totalImagesCount = 0;
  const MAX_IMAGES = 60;
  const MAX_ELEMENTS = 800;
  let totalElementsCount = 0;
  let prunedEmptyBoxesCount = 0;

  function isTrulyEmptyBox(node: RawNode, convertedChildrenIds: string[]): boolean {
    if (convertedChildrenIds.length > 0) return false;
    if (node.text && node.text.trim().length > 0) return false;
    if (node.bgUrl) return false;
    const s = node.stylesDesktop;
    if (s.backgroundImage && s.backgroundImage !== "none") return false;
    if (!isTransparent(s.backgroundColor)) return false;
    if (hasVisibleBorder(s)) return false;
    if (s.boxShadow && s.boxShadow !== "none") return false;
    return true;
  }

  function convertNodeToElement(
    raw: RawNode,
    parentId: string | null
  ): string | null {
    if (totalElementsCount >= MAX_ELEMENTS) {
      if (!warnings.includes("Maximum element limit (800) reached; remaining elements skipped.")) {
        warnings.push("Maximum element limit (800) reached; remaining elements skipped.");
      }
      skippedCount++;
      return null;
    }

    const primitiveType = mapTagToPrimitiveType(raw.tagName, raw.text, raw.type);
    const tempElementId = `el_${primitiveType.toLowerCase()}_${nanoid(8)}`;

    // Convert children recursively first
    const childrenIds: string[] = [];
    for (const ch of raw.children) {
      const childId = convertNodeToElement(ch, tempElementId);
      if (childId) childrenIds.push(childId);
    }

    // Prune truly empty wrapper boxes (never prune root body)
    if (parentId !== null && (primitiveType === "Box" || primitiveType === "Section")) {
      if (isTrulyEmptyBox(raw, childrenIds)) {
        prunedEmptyBoxesCount++;
        return null;
      }
    }

    const elementId = tempElementId;
    const styleId = `s_${elementId}`;
    totalElementsCount++;
    importedCount++;

    // Props
    const props: Record<string, any> = {};
    if (primitiveType === "Heading") {
      const matchLevel = raw.tagName.match(/^h([1-6])$/i);
      props["level"] = matchLevel && matchLevel[1] ? parseInt(matchLevel[1], 10) : 2;
      props["text"] = raw.text || "Heading";
    } else if (primitiveType === "Text") {
      props["text"] = raw.text || "";
    } else if (primitiveType === "Button") {
      props["text"] = raw.text || "Button";
      if (raw.href) props["href"] = raw.href;
      props["variant"] = "primary";
    } else if (primitiveType === "Link") {
      props["text"] = raw.text || "Link";
      props["href"] = raw.href || "#";
    } else if (primitiveType === "Image") {
      if (raw.svgContent) {
        const encodedSvg = `data:image/svg+xml;utf8,${encodeURIComponent(raw.svgContent)}`;
        props["src"] = encodedSvg;
        props["alt"] = raw.alt || "Icon";
      } else {
        totalImagesCount++;
        if (totalImagesCount > MAX_IMAGES) {
          if (!warnings.includes("Maximum image limit (60) reached; remaining images skipped.")) {
            warnings.push("Maximum image limit (60) reached; remaining images skipped.");
          }
          approximatedCount++;
          props["src"] = "https://images.unsplash.com/photo-1499750310107-5fef28a66643";
          props["alt"] = raw.alt || "Image";
        } else {
          props["src"] = raw.src || "https://images.unsplash.com/photo-1499750310107-5fef28a66643";
          props["alt"] = raw.alt || "Image";
        }
      }
    } else if (primitiveType === "Input") {
      props["placeholder"] = raw.placeholder || "Enter text...";
      props["name"] = raw.name || "input";
      if (raw.type) props["type"] = raw.type;
    } else if (primitiveType === "Textarea") {
      props["placeholder"] = raw.placeholder || "Enter message...";
      props["name"] = raw.name || "message";
    } else if (primitiveType === "Form") {
      props["formId"] = raw.id || "imported-form";
      props["action"] = raw.href || "/api/public/forms";
      props["method"] = "POST";
    }

    // Build Responsive Style Rule
    const desktopDecls: CSSDeclarations = {};
    for (const [k, v] of Object.entries(raw.stylesDesktop)) {
      if (v && v !== "none" && v !== "normal" && v !== "auto") {
        desktopDecls[k] = cssVal(v);
      }
    }

    const isButton = primitiveType === "Button";
    const isTextContainer = primitiveType === "Heading" || primitiveType === "Text" || primitiveType === "Link";
    const isContainer = ["Body", "Section", "Box", "Form"].includes(primitiveType);
    const isImage = primitiveType === "Image";

    // 1. Buttons & Text containers: use padding instead of fixed heights
    if (isButton || isTextContainer) {
      delete desktopDecls["height"];
      delete desktopDecls["minHeight"];
      if (isButton) {
        delete desktopDecls["width"];
        // Ensure padding exists instead of fixed heights
        if (!desktopDecls["padding"] && !desktopDecls["paddingTop"]) {
          desktopDecls["padding"] = { raw: "10px 20px" };
        }
      }
      desktopDecls["boxSizing"] = { keyword: "border-box" };
      desktopDecls["maxWidth"] = { value: 100, unit: "%" };
    }

    // 2. Containers: convert fixed widths to max-width with width 100% and centered containers
    if (isContainer) {
      desktopDecls["boxSizing"] = { keyword: "border-box" };
      const currentWidth = desktopDecls["width"];
      if (currentWidth && "value" in currentWidth && currentWidth.unit === "px") {
        const pxVal = currentWidth.value;
        desktopDecls["width"] = { value: 100, unit: "%" };
        if (pxVal > 0 && pxVal < 1440) {
          desktopDecls["maxWidth"] = { value: pxVal, unit: "px" };
        } else {
          desktopDecls["maxWidth"] = { value: 100, unit: "%" };
        }
        desktopDecls["marginLeft"] = { keyword: "auto" };
        desktopDecls["marginRight"] = { keyword: "auto" };
      } else if (desktopDecls["maxWidth"] && "value" in desktopDecls["maxWidth"] && desktopDecls["maxWidth"].unit === "px") {
        desktopDecls["width"] = { value: 100, unit: "%" };
        desktopDecls["marginLeft"] = { keyword: "auto" };
        desktopDecls["marginRight"] = { keyword: "auto" };
      } else {
        desktopDecls["width"] = { value: 100, unit: "%" };
        desktopDecls["maxWidth"] = { value: 100, unit: "%" };
      }

      if (primitiveType === "Body") {
        desktopDecls["overflowX"] = { keyword: "hidden" };
      }
    }

    // 3. Images: responsive scaling
    if (isImage) {
      desktopDecls["maxWidth"] = { value: 100, unit: "%" };
      desktopDecls["height"] = { keyword: "auto" };
    }

    // Apply background image styling
    if (raw.bgUrl) {
      desktopDecls["backgroundImage"] = { raw: `url("${raw.bgUrl}")` };
      if (!desktopDecls["backgroundSize"]) desktopDecls["backgroundSize"] = { keyword: "cover" };
      if (!desktopDecls["backgroundPosition"]) desktopDecls["backgroundPosition"] = { keyword: "center" };
      if (!desktopDecls["backgroundRepeat"]) desktopDecls["backgroundRepeat"] = { keyword: "no-repeat" };
    }

    const tabletDecls: CSSDeclarations = {};
    if (raw.stylesTablet) {
      for (const [k, v] of Object.entries(raw.stylesTablet)) {
        if (v && raw.stylesDesktop[k] !== v) {
          tabletDecls[k] = cssVal(v);
        }
      }
    }

    const mobileDecls: CSSDeclarations = {};
    if (raw.stylesMobile) {
      for (const [k, v] of Object.entries(raw.stylesMobile)) {
        if (v && (raw.stylesTablet?.[k] || raw.stylesDesktop[k]) !== v) {
          mobileDecls[k] = cssVal(v);
        }
      }
    }

    // Responsive overrides for tablet and mobile to prevent horizontal overflow and button height locks
    if (isButton || isTextContainer) {
      delete tabletDecls["height"];
      delete mobileDecls["height"];
      if (isButton) {
        delete tabletDecls["width"];
        delete mobileDecls["width"];
      }
      tabletDecls["boxSizing"] = { keyword: "border-box" };
      mobileDecls["boxSizing"] = { keyword: "border-box" };
      tabletDecls["maxWidth"] = { value: 100, unit: "%" };
      mobileDecls["maxWidth"] = { value: 100, unit: "%" };
    }

    if (isContainer) {
      tabletDecls["width"] = { value: 100, unit: "%" };
      tabletDecls["maxWidth"] = { value: 100, unit: "%" };
      tabletDecls["boxSizing"] = { keyword: "border-box" };
      mobileDecls["width"] = { value: 100, unit: "%" };
      mobileDecls["maxWidth"] = { value: 100, unit: "%" };
      mobileDecls["boxSizing"] = { keyword: "border-box" };
      if (primitiveType === "Body") {
        tabletDecls["overflowX"] = { keyword: "hidden" };
        mobileDecls["overflowX"] = { keyword: "hidden" };
      }
    }

    if (isImage) {
      tabletDecls["maxWidth"] = { value: 100, unit: "%" };
      tabletDecls["height"] = { keyword: "auto" };
      mobileDecls["maxWidth"] = { value: 100, unit: "%" };
      mobileDecls["height"] = { keyword: "auto" };
    }

    const styleRule: StyleRule = {
      id: styleId,
      kind: "local",
      values: {
        desktop: { default: desktopDecls },
        ...(Object.keys(tabletDecls).length > 0 ? { tablet: { default: tabletDecls } } : {}),
        ...(Object.keys(mobileDecls).length > 0 ? { mobile: { default: mobileDecls } } : {}),
      },
    };

    doc.styles[styleId] = styleRule;

    const elRecord: Element = {
      id: elementId,
      type: primitiveType,
      name: primitiveType,
      parentId,
      children: childrenIds,
      props,
      styleIds: [styleId],
      origin: "url",
    };

    doc.elements[elementId] = elRecord;
    return elementId;
  }

  // Convert root node
  const rootElement = convertNodeToElement(capturedTree, null);
  if (rootElement) {
    homePage.rootId = rootElement;
    if (doc.elements[rootElement]) {
      doc.elements[rootElement].type = "Body";
      doc.elements[rootElement].name = "Body";
    }
  }

  // 7. Optional AI cleanup pass (Section C.2)
  if (options.aiCleanup) {
    try {
      const { isAiConfigured } = await import("@builder/ai");
      if (!isAiConfigured("text")) {
        warnings.push("AI cleanup pass skipped: AI is not configured.");
      } else {
        // Attempt AI enhancement if configured
        const headings = Object.values(doc.elements).filter((e) => e.type === "Heading");
        if (headings.length > 0 && typeof headings[0]?.props["text"] === "string") {
          const { rewriteText } = await import("@builder/ai");
          const polished = await rewriteText(headings[0].props["text"], "Polish heading for web");
          headings[0].props["text"] = polished;
        }
      }
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      warnings.push(`AI cleanup pass failed (${msg}): continuing with direct element tree.`);
    }
  }

  // Detailed report construction
  const detailItems: Array<{ type: string; message: string }> = [];

  if (evalStats.convertedLayouts > 0) {
    warnings.push(`Converted ${evalStats.convertedLayouts} CSS grid and table layout(s) into responsive structures.`);
    detailItems.push({ type: "layout", message: `Converted ${evalStats.convertedLayouts} grid/table layouts` });
  }
  if (evalStats.removedScripts > 0) {
    warnings.push(`Removed ${evalStats.removedScripts} script/code tag(s) for security.`);
    detailItems.push({ type: "script", message: `Removed ${evalStats.removedScripts} <script> tags` });
  }
  if (evalStats.unsupportedElements > 0) {
    warnings.push(`Skipped ${evalStats.unsupportedElements} unsupported interactive/media element(s) (iframe, canvas, embed).`);
    detailItems.push({ type: "unsupported", message: `Skipped ${evalStats.unsupportedElements} unsupported elements` });
  }
  if (evalStats.droppedBackgroundImages > 0) {
    warnings.push(`Dropped ${evalStats.droppedBackgroundImages} invalid or inaccessible background image(s).`);
    detailItems.push({ type: "image", message: `Dropped ${evalStats.droppedBackgroundImages} background images` });
  }
  if (prunedEmptyBoxesCount > 0) {
    warnings.push(`Pruned ${prunedEmptyBoxesCount} empty wrapper container(s).`);
    detailItems.push({ type: "empty_box", message: `Pruned ${prunedEmptyBoxesCount} empty boxes` });
  }

  const reportDetails: ImportReportDetails = {
    droppedBackgroundImages: evalStats.droppedBackgroundImages,
    unsupportedElements: evalStats.unsupportedElements,
    convertedLayouts: evalStats.convertedLayouts,
    removedScripts: evalStats.removedScripts,
    prunedEmptyBoxes: prunedEmptyBoxesCount,
    items: detailItems,
  };

  return {
    success: true,
    document: doc,
    report: {
      imported: importedCount,
      approximated: approximatedCount,
      skipped: skippedCount,
      warnings,
      details: reportDetails,
    },
  };
}
