import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema, saveSiteDocument } from "@builder/db";
import {
  siteDocumentToYDoc,
  yDocToSiteDocument,
  insertElement,
  setProp,
  validateSiteDocument,
  type SiteDocument,
} from "@builder/document";
import { recordMcpAudit } from "../audit.js";
import type {
  GetSiteStructureInput,
  ListPagesInput,
  UpdateTextInput,
  CreateSectionInput,
} from "../types.js";

/**
 * Normalizes site ID input: accepts plain siteId, "/editor/<id>", or full editor URL.
 */
export function normalizeSiteId(siteInput: string): string {
  if (!siteInput || typeof siteInput !== "string") {
    throw new Error("Missing site ID. Use the site ID, e.g. site_abc123 — call list_sites.");
  }
  let clean = siteInput.trim();
  // Match "/editor/<id>" or full URL ending with "/editor/<id>"
  const match = clean.match(/\/editor\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // If it's a URL but didn't match /editor/
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    try {
      const url = new URL(clean);
      const parts = url.pathname.split("/").filter(Boolean);
      const editorIdx = parts.indexOf("editor");
      if (editorIdx !== -1 && parts[editorIdx + 1]) {
        return parts[editorIdx + 1]!;
      }
      if (parts.length > 0) {
        return parts[parts.length - 1]!;
      }
    } catch {}
  }
  clean = clean.replace(/^\/+|\/+$/g, "");
  return clean;
}

/**
 * Resolves page ID: accepts direct pageId, page slug (e.g. "/" or "/blog"), or page name.
 */
export function resolvePageId(doc: SiteDocument, pageIdOrSlug: string): string {
  if (!pageIdOrSlug) return "";
  const trimmed = pageIdOrSlug.trim();
  if (doc.pages[trimmed]) {
    return trimmed;
  }
  const normalizedSlug = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const foundBySlug = Object.values(doc.pages).find(
    (p) => p.slug === trimmed || p.slug === normalizedSlug
  );
  if (foundBySlug) {
    return foundBySlug.id;
  }
  const foundByName = Object.values(doc.pages).find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (foundByName) {
    return foundByName.id;
  }
  if (
    trimmed.toLowerCase() === "home" ||
    trimmed.toLowerCase() === "page-home" ||
    trimmed.toLowerCase() === "/page-home"
  ) {
    const homePage = Object.values(doc.pages).find(
      (p) => p.slug === "/" || p.name.toLowerCase() === "home"
    );
    if (homePage) {
      return homePage.id;
    }
  }
  const pagesList = Object.values(doc.pages);
  if (pagesList.length === 1 && pagesList[0]) {
    return pagesList[0].id;
  }
  throw new Error(
    `Page "${pageIdOrSlug}" not found in site document. Use the page ID or slug (e.g. "/" or "/blog") — call list_pages.`
  );
}

/**
 * 0. list_sites
 * Lists all sites in the workspace with their IDs, names, last updated timestamps, and page counts.
 */
export async function handleListSites(
  workspaceId: string,
  actor: string
) {
  const sites = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.workspaceId, workspaceId))
    .orderBy(desc(schema.sites.updatedAt));

  const siteDocs = await db
    .select({
      siteId: schema.siteDocuments.siteId,
      snapshot: schema.siteDocuments.snapshot,
    })
    .from(schema.siteDocuments);

  const pageCountMap = new Map<string, number>();
  for (const d of siteDocs) {
    if (d.snapshot) {
      const doc = d.snapshot as SiteDocument;
      pageCountMap.set(d.siteId, Object.keys(doc.pages || {}).length);
    }
  }

  const results = sites.map((s) => ({
    id: s.id,
    name: s.name,
    lastUpdated: (s.updatedAt || s.createdAt).toISOString(),
    pageCount: pageCountMap.get(s.id) || 0,
  }));

  await recordMcpAudit({
    workspaceId,
    actor,
    action: "mcp:list_sites",
    target: "workspace",
    data: { siteCount: results.length },
  });

  return results;
}

/**
 * 1. get_site_structure
 * Inspects site document hierarchy and tokens.
 */
export async function handleGetSiteStructure(
  workspaceId: string,
  actor: string,
  input: GetSiteStructureInput
) {
  const siteId = normalizeSiteId(input.siteId);

  // 1. Verify workspace isolation
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.workspaceId, workspaceId)));

  if (!site) {
    throw new Error(`Site "${input.siteId}" not found in this workspace. Use the site ID, e.g. site_abc123 — call list_sites.`);
  }

  // 2. Fetch document
  const [docRecord] = await db
    .select()
    .from(schema.siteDocuments)
    .where(eq(schema.siteDocuments.siteId, siteId));

  if (!docRecord?.snapshot) {
    throw new Error(`Site document not found for site "${input.siteId}"`);
  }

  const doc = docRecord.snapshot as SiteDocument;

  // 3. Filter by pageId/slug if specified
  const pagesList = Object.values(doc.pages).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    rootId: p.rootId,
  }));

  let targetElements = doc.elements;
  if (input.pageId) {
    const resolvedPageId = resolvePageId(doc, input.pageId);
    const page = doc.pages[resolvedPageId];
    if (!page) {
      throw new Error(`Page "${input.pageId}" not found in site`);
    }
  }

  const summary = {
    siteId: site.id,
    siteName: site.name,
    pagesCount: pagesList.length,
    pages: pagesList,
    elementsCount: Object.keys(targetElements).length,
    tokens: {
      colors: Object.keys(doc.tokens.colors),
      fonts: Object.keys(doc.tokens.fonts),
    },
  };

  // 4. Record audit log
  await recordMcpAudit({
    workspaceId,
    actor,
    action: "mcp:get_site_structure",
    target: input.siteId,
    data: { pageId: input.pageId, elementsCount: summary.elementsCount },
  });

  return summary;
}

/**
 * 2. list_pages
 * Lists all pages in the site.
 */
export async function handleListPages(
  workspaceId: string,
  actor: string,
  input: ListPagesInput
) {
  const siteId = normalizeSiteId(input.siteId);
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.workspaceId, workspaceId)));

  if (!site) {
    throw new Error(`Site "${input.siteId}" not found in this workspace. Use the site ID, e.g. site_abc123 — call list_sites.`);
  }

  const [docRecord] = await db
    .select()
    .from(schema.siteDocuments)
    .where(eq(schema.siteDocuments.siteId, siteId));

  if (!docRecord?.snapshot) {
    throw new Error(`Site document not found for site "${input.siteId}"`);
  }

  const doc = docRecord.snapshot as SiteDocument;
  const pages = Object.values(doc.pages).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    rootId: p.rootId,
    seo: p.seo,
  }));

  await recordMcpAudit({
    workspaceId,
    actor,
    action: "mcp:list_pages",
    target: siteId,
    data: { pageCount: pages.length },
  });

  return { siteId, pages };
}

/**
 * 3. update_text
 * Updates text content of an element via pure document commands.
 */
export async function handleUpdateText(
  workspaceId: string,
  actor: string,
  input: UpdateTextInput
) {
  const siteId = normalizeSiteId(input.siteId);
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.workspaceId, workspaceId)));

  if (!site) {
    throw new Error(`Site "${input.siteId}" not found in this workspace. Use the site ID, e.g. site_abc123 — call list_sites.`);
  }

  const [docRecord] = await db
    .select()
    .from(schema.siteDocuments)
    .where(eq(schema.siteDocuments.siteId, siteId));

  if (!docRecord?.snapshot) {
    throw new Error(`Site document not found for site "${input.siteId}"`);
  }

  const doc = docRecord.snapshot as SiteDocument;
  const element = doc.elements[input.elementId];
  if (!element) {
    throw new Error(`Element "${input.elementId}" not found in site document`);
  }

  const previousText = element.props["text"];

  // Execute pure command via Yjs document
  const yDoc = siteDocumentToYDoc(doc);
  setProp(yDoc, { elementId: input.elementId, propName: "text", value: input.text }, "mcp");
  const updatedDoc = yDocToSiteDocument(yDoc);

  // Validate document integrity
  const validation = validateSiteDocument(updatedDoc);
  if (!validation.valid) {
    throw new Error(`Document validation failed: ${validation.errors.join("; ")}`);
  }

  // Persist updated document
  await saveSiteDocument(db, {
    siteId,
    document: updatedDoc,
  });

  await recordMcpAudit({
    workspaceId,
    actor,
    action: "mcp:update_text",
    target: `${siteId}:${input.elementId}`,
    data: {
      elementId: input.elementId,
      elementType: element.type,
      previousText,
      newText: input.text,
    },
  });

  return {
    success: true,
    siteId,
    elementId: input.elementId,
    previousText,
    updatedText: input.text,
  };
}

/**
 * 4. create_section
 * Requires confirmation first; executes section creation upon approval.
 * Non-negotiable Rule 2 & Architecture Section 13.3.
 */
export async function handleCreateSection(
  workspaceId: string,
  actor: string,
  input: CreateSectionInput
) {
  const siteId = normalizeSiteId(input.siteId);
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.workspaceId, workspaceId)));

  if (!site) {
    throw new Error(`Site "${input.siteId}" not found in this workspace. Use the site ID, e.g. site_abc123 — call list_sites.`);
  }

  const [docRecord] = await db
    .select()
    .from(schema.siteDocuments)
    .where(eq(schema.siteDocuments.siteId, siteId));

  if (!docRecord?.snapshot) {
    throw new Error(`Site document not found for site "${input.siteId}"`);
  }

  const doc = docRecord.snapshot as SiteDocument;
  const resolvedPageId = resolvePageId(doc, input.pageId);
  const page = doc.pages[resolvedPageId];
  if (!page) {
    throw new Error(`Page "${input.pageId}" not found in site document`);
  }

  // 1. If not explicitly approved, return confirmation request (Architecture 13.3)
  if (!input.confirmed) {
    const confirmationToken = `conf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const sectionLabel = input.name || `${input.sectionType.toUpperCase()} Section`;

    await recordMcpAudit({
      workspaceId,
      actor,
      action: "mcp:create_section:approval_requested",
      target: `${siteId}:${resolvedPageId}`,
      data: {
        siteId,
        pageId: resolvedPageId,
        sectionType: input.sectionType,
        name: sectionLabel,
        confirmationToken,
      },
    });

    return {
      status: "requires_approval",
      confirmationToken,
      message: `Approval required: inserting a new "${input.sectionType}" section will add layout and content elements to page "${page.name}". Re-run create_section with confirmed: true and confirmationToken: "${confirmationToken}" to execute.`,
      plan: {
        siteId,
        pageId: resolvedPageId,
        sectionType: input.sectionType,
        sectionName: sectionLabel,
        estimatedElements: 4,
      },
    };
  }

  // 2. Confirmed: Execute pure insertion commands
  const yDoc = siteDocumentToYDoc(doc);
  const pageRootId = page.rootId;

  // Insert Section Container
  const sectionId = insertElement(
    yDoc,
    {
      parentId: pageRootId,
      element: {
        type: "Box",
        name: input.name || `${input.sectionType.toUpperCase()} Section`,
        origin: "ai",
        props: {},
      },
    },
    "mcp"
  );

  // Insert Heading
  insertElement(
    yDoc,
    {
      parentId: sectionId,
      element: {
        type: "Heading",
        name: `${input.sectionType} Heading`,
        origin: "ai",
        props: {
          text: `${input.name || input.sectionType.toUpperCase()} Section`,
          level: 2,
        },
      },
    },
    "mcp"
  );

  // Insert Description
  insertElement(
    yDoc,
    {
      parentId: sectionId,
      element: {
        type: "Text",
        name: `${input.sectionType} Description`,
        origin: "ai",
        props: {
          text: `Explore our ${input.sectionType} features designed for performance and scale.`,
        },
      },
    },
    "mcp"
  );

  // Insert Button CTA
  insertElement(
    yDoc,
    {
      parentId: sectionId,
      element: {
        type: "Button",
        name: `${input.sectionType} CTA`,
        origin: "ai",
        props: {
          text: "Get Started Now",
          variant: "primary",
        },
      },
    },
    "mcp"
  );

  const updatedDoc = yDocToSiteDocument(yDoc);

  // Validate integrity
  const validation = validateSiteDocument(updatedDoc);
  if (!validation.valid) {
    throw new Error(`Document validation failed: ${validation.errors.join("; ")}`);
  }

  // Persist updated document
  await saveSiteDocument(db, {
    siteId,
    document: updatedDoc,
  });

  await recordMcpAudit({
    workspaceId,
    actor,
    action: "mcp:create_section:executed",
    target: `${siteId}:${sectionId}`,
    data: {
      siteId,
      pageId: resolvedPageId,
      sectionType: input.sectionType,
      sectionId,
      confirmationToken: input.confirmationToken,
      elementsCount: 4,
    },
  });

  return {
    status: "created",
    siteId,
    pageId: resolvedPageId,
    sectionId,
    sectionType: input.sectionType,
    elementsCount: 4,
  };
}
