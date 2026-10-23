import { nanoid } from "nanoid";
import type { SiteDocument, Element, StyleRule, Page, ComponentDef, DesignTokens } from "../types/index.js";
import { validateSiteDocument } from "../validator/index.js";

export interface InstantiateTemplateOptions {
  siteName?: string | undefined;
  brandTokens?: Partial<DesignTokens> | undefined;
  origin?: "template" | "user" | undefined;
}

/**
 * Creates a new, isolated SiteDocument from a template by deeply cloning it,
 * generating fresh unique IDs for all elements, style rules, pages, and components,
 * and remapping all internal parent/child/root references.
 *
 * Ensures non-negotiable rule:
 * picking a template creates a functional, fully editable site document with new IDs.
 */
export function instantiateTemplateDocument(
  templateDoc: SiteDocument,
  options?: InstantiateTemplateOptions
): SiteDocument {
  // Deep clone
  const cloned: SiteDocument = JSON.parse(JSON.stringify(templateDoc));

  const elementIdMap = new Map<string, string>();
  const styleIdMap = new Map<string, string>();
  const pageIdMap = new Map<string, string>();
  const componentIdMap = new Map<string, string>();

  // 1. Assign brand new unique IDs for all entities
  for (const oldId of Object.keys(cloned.elements)) {
    elementIdMap.set(oldId, `el_${nanoid(12)}`);
  }
  for (const oldId of Object.keys(cloned.styles)) {
    styleIdMap.set(oldId, `st_${nanoid(12)}`);
  }
  for (const oldId of Object.keys(cloned.pages)) {
    pageIdMap.set(oldId, `pg_${nanoid(12)}`);
  }
  for (const oldId of Object.keys(cloned.components || {})) {
    componentIdMap.set(oldId, `cp_${nanoid(12)}`);
  }

  // 2. Remap elements
  const newElements: Record<string, Element> = {};
  for (const [oldId, el] of Object.entries(cloned.elements)) {
    const newId = elementIdMap.get(oldId);
    if (!newId) continue;

    const newParentId = el.parentId ? (elementIdMap.get(el.parentId) ?? null) : null;
    const newChildren = (el.children || []).map((cid) => elementIdMap.get(cid) ?? cid);
    const newStyleIds = (el.styleIds || []).map((sid) => styleIdMap.get(sid) ?? sid);

    const remappedElement: Element = {
      ...el,
      id: newId,
      parentId: newParentId,
      children: newChildren,
      styleIds: newStyleIds,
      origin: options?.origin ?? "template",
    };

    if (el.instanceOf) {
      const mappedCompId = componentIdMap.get(el.instanceOf.componentId) ?? el.instanceOf.componentId;
      const mappedOverrides: Record<string, Partial<Element>> = {};
      for (const [ovOldId, ovEl] of Object.entries(el.instanceOf.overrides || {})) {
        const ovNewId = elementIdMap.get(ovOldId) ?? ovOldId;
        mappedOverrides[ovNewId] = ovEl;
      }
      remappedElement.instanceOf = {
        componentId: mappedCompId,
        overrides: mappedOverrides,
      };
    }

    newElements[newId] = remappedElement;
  }

  // 3. Remap styles
  const newStyles: Record<string, StyleRule> = {};
  for (const [oldId, rule] of Object.entries(cloned.styles)) {
    const newId = styleIdMap.get(oldId);
    if (!newId) continue;

    newStyles[newId] = {
      ...rule,
      id: newId,
    };
  }

  // 4. Remap pages
  const newPages: Record<string, Page> = {};
  for (const [oldId, page] of Object.entries(cloned.pages)) {
    const newId = pageIdMap.get(oldId);
    if (!newId) continue;

    const newRootId = elementIdMap.get(page.rootId) ?? page.rootId;
    newPages[newId] = {
      ...page,
      id: newId,
      rootId: newRootId,
    };
  }

  // 5. Remap components
  const newComponents: Record<string, ComponentDef> = {};
  for (const [oldId, comp] of Object.entries(cloned.components || {})) {
    const newId = componentIdMap.get(oldId);
    if (!newId) continue;

    const newRootId = elementIdMap.get(comp.rootElementId) ?? comp.rootElementId;
    newComponents[newId] = {
      ...comp,
      id: newId,
      rootElementId: newRootId,
    };
  }

  // 6. Optional site name and brand tokens
  let siteConfig = cloned.site;
  if (options?.siteName) {
    siteConfig = {
      ...siteConfig,
      name: options.siteName,
    };
  }

  let tokensConfig = cloned.tokens;
  if (options?.brandTokens) {
    tokensConfig = {
      ...tokensConfig,
      ...options.brandTokens,
      colors: {
        ...tokensConfig.colors,
        ...(options.brandTokens.colors || {}),
      },
      fonts: {
        ...tokensConfig.fonts,
        ...(options.brandTokens.fonts || {}),
      },
    };
  }

  const newDoc: SiteDocument = {
    ...cloned,
    site: siteConfig,
    tokens: tokensConfig,
    pages: newPages,
    elements: newElements,
    styles: newStyles,
    components: newComponents,
  };

  // Validate the resulting document
  const validation = validateSiteDocument(newDoc);
  if (!validation.valid) {
    const errorDetails = validation.errors.map((e) => `[${e.code}] ${e.path}: ${e.message}`).join("; ");
    throw new Error(`Instantiated template document is invalid: ${errorDetails}`);
  }

  return newDoc;
}
