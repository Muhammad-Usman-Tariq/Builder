import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteDocument } from "@builder/document";
import { CanvasPage } from "../canvas/CanvasPage.js";
import { compileFullCSS } from "../styles/compiler.js";

if (typeof (globalThis as any).React === "undefined") {
  (globalThis as any).React = React;
}

export interface RenderResult {
  html: string;
  css: string;
  title: string;
  description?: string | undefined;
}

/**
 * Server-side static HTML generator using the EXACT same React element renderers as the canvas.
 * Satisfies architecture section 6.3 and non-negotiable rule 4.
 */
export function renderPageToStaticMarkup(
  doc: SiteDocument,
  pageId: string,
  options?: {
    resolveAssetUrl?: ((assetId: string) => string) | undefined;
    cmsEntry?: Record<string, any> | undefined;
    cmsEntries?: Record<string, any>[] | undefined;
  } | undefined
): RenderResult {
  const page = doc.pages[pageId];
  if (!page) {
    throw new Error(`Cannot render static markup: page "${pageId}" not found.`);
  }

  const elementTree = React.createElement(CanvasPage, {
    doc,
    pageId,
    isEditor: false,
    resolveAssetUrl: options?.resolveAssetUrl,
    cmsEntry: options?.cmsEntry,
    cmsEntries: options?.cmsEntries,
  });

  const html = renderToStaticMarkup(elementTree);
  const css = compileFullCSS(doc);

  return {
    html,
    css,
    title: page.seo?.title || page.name,
    description: page.seo?.description,
  };
}
