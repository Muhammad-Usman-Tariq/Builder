import * as Y from "yjs";
import { createBlankDocument } from "../defaults/index.js";
import { assertValidSiteDocument } from "../validator/index.js";
import type { SiteDocument } from "../types/index.js";

/**
 * Hydrates or synchronizes a Y.Doc from a JSON SiteDocument.
 */
export function siteDocumentToYDoc(doc: SiteDocument, targetDoc?: Y.Doc): Y.Doc {
  assertValidSiteDocument(doc);
  const yDoc = targetDoc || new Y.Doc();

  yDoc.transact(() => {
    // 1. Meta
    const yMeta = yDoc.getMap("meta");
    yMeta.set("schemaVersion", doc.schemaVersion);

    // 2. Site
    const ySite = yDoc.getMap("site");
    ySite.set("name", doc.site.name);
    ySite.set("defaultLocale", doc.site.defaultLocale);
    ySite.set("locales", doc.site.locales);

    // 3. Breakpoints
    const yBreakpoints = yDoc.getArray("breakpoints");
    yBreakpoints.delete(0, yBreakpoints.length);
    yBreakpoints.insert(0, doc.breakpoints);

    // 4. Tokens
    const yTokens = yDoc.getMap("tokens");
    yTokens.set("colors", doc.tokens.colors);
    yTokens.set("fonts", doc.tokens.fonts);
    yTokens.set("spacing", doc.tokens.spacing);
    yTokens.set("radius", doc.tokens.radius);
    yTokens.set("shadows", doc.tokens.shadows);

    // 5. Pages
    const yPages = yDoc.getMap("pages");
    for (const key of Array.from(yPages.keys())) {
      if (!(key in doc.pages)) yPages.delete(key);
    }
    for (const [id, page] of Object.entries(doc.pages)) {
      yPages.set(id, page);
    }

    // 6. Elements
    const yElements = yDoc.getMap("elements");
    for (const key of Array.from(yElements.keys())) {
      if (!(key in doc.elements)) yElements.delete(key);
    }
    for (const [id, el] of Object.entries(doc.elements)) {
      yElements.set(id, el);
    }

    // 7. Styles
    const yStyles = yDoc.getMap("styles");
    for (const key of Array.from(yStyles.keys())) {
      if (!(key in doc.styles)) yStyles.delete(key);
    }
    for (const [id, style] of Object.entries(doc.styles)) {
      yStyles.set(id, style);
    }

    // 8. Components
    const yComponents = yDoc.getMap("components");
    for (const key of Array.from(yComponents.keys())) {
      if (!(key in doc.components)) yComponents.delete(key);
    }
    for (const [id, comp] of Object.entries(doc.components)) {
      yComponents.set(id, comp);
    }

    // 9. Assets
    const yAssets = yDoc.getMap("assets");
    for (const key of Array.from(yAssets.keys())) {
      if (!(key in doc.assets)) yAssets.delete(key);
    }
    for (const [id, asset] of Object.entries(doc.assets)) {
      yAssets.set(id, asset);
    }
  }, "init");

  return yDoc;
}

/**
 * Creates a brand new initialized Y.Doc.
 */
export function createYDoc(initialDoc?: SiteDocument): Y.Doc {
  const doc = initialDoc || createBlankDocument();
  return siteDocumentToYDoc(doc);
}

/**
 * Converts a Y.Doc into a pure JSON SiteDocument and validates it.
 */
export function yDocToSiteDocument(yDoc: Y.Doc): SiteDocument {
  const yMeta = yDoc.getMap("meta");
  const ySite = yDoc.getMap("site");
  const yBreakpoints = yDoc.getArray("breakpoints");
  const yTokens = yDoc.getMap("tokens");
  const yPages = yDoc.getMap("pages");
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");
  const yComponents = yDoc.getMap("components");
  const yAssets = yDoc.getMap("assets");

  const schemaVersion = (yMeta.get("schemaVersion") as number) || 1;
  const site = {
    name: (ySite.get("name") as string) || "Untitled",
    defaultLocale: (ySite.get("defaultLocale") as string) || "en",
    locales: (ySite.get("locales") as string[]) || ["en"],
  };

  const breakpoints = yBreakpoints.toArray() as any[];
  const tokens = {
    colors: (yTokens.get("colors") as Record<string, string>) || {},
    fonts: (yTokens.get("fonts") as any) || { heading: "sans-serif", body: "sans-serif" },
    spacing: (yTokens.get("spacing") as Record<string, any>) || {},
    radius: (yTokens.get("radius") as Record<string, any>) || {},
    shadows: (yTokens.get("shadows") as Record<string, string>) || {},
  };

  const pages = yPages.toJSON() as Record<string, any>;
  const elements = yElements.toJSON() as Record<string, any>;
  const styles = yStyles.toJSON() as Record<string, any>;
  const components = yComponents.toJSON() as Record<string, any>;
  const assets = yAssets.toJSON() as Record<string, any>;

  const doc: SiteDocument = {
    schemaVersion,
    site,
    breakpoints,
    tokens,
    pages,
    elements,
    styles,
    components,
    assets,
  };

  assertValidSiteDocument(doc);
  return doc;
}

/**
 * Encodes the binary state update of a Y.Doc.
 */
export function encodeYDocState(yDoc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(yDoc);
}

/**
 * Applies a binary state update to a Y.Doc.
 */
export function applyYDocUpdate(yDoc: Y.Doc, update: Uint8Array, origin?: unknown): void {
  Y.applyUpdate(yDoc, update, origin);
}

/**
 * Merges two or more binary Yjs state updates.
 */
export function mergeYDocUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

/**
 * Instantiates and rehydrates a Y.Doc directly from a binary state update.
 */
export function createYDocFromState(binaryState: Uint8Array): Y.Doc {
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, binaryState);
  return yDoc;
}

