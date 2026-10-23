import type { SiteDocument } from "@builder/document";

export interface PreflightError {
  code: string;
  message: string;
  elementId?: string | undefined;
  pageId?: string | undefined;
}

export interface PreflightResult {
  passed: boolean;
  errors: PreflightError[];
  warnings: string[];
  emptyImagesCount?: number | undefined;
}

export interface PreflightOptions {
  hasVercelConnection: boolean;
  isVercelExpiredOrRevoked?: boolean;
}

/**
 * Executes pre-flight publishing checks (PUB-001) according to Architecture Section 11.1.
 * Blocking problems stop the pipeline with clear, actionable error codes and messages.
 */
export function validatePreflight(
  doc: SiteDocument,
  options: PreflightOptions
): PreflightResult {
  const errors: PreflightError[] = [];
  const warnings: string[] = [];

  // 1. Vercel connection verification
  if (options.isVercelExpiredOrRevoked) {
    errors.push({
      code: "PUB_VERCEL_AUTH_EXPIRED",
      message: "Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations.",
    });
  } else if (!options.hasVercelConnection) {
    errors.push({
      code: "PUB_NO_VERCEL_CONNECTION",
      message: "Vercel integration is not connected. Connect your Vercel account in workspace settings before publishing.",
    });
  }

  // 2. Page and route checks
  const pages = Object.entries(doc.pages);
  if (pages.length === 0) {
    errors.push({
      code: "PUB_NO_PAGES",
      message: "Site must contain at least one page.",
    });
  }

  const slugs = new Set<string>();
  let hasHomePage = false;

  for (const [pageId, page] of pages) {
    if (!page.slug || page.slug.trim() === "") {
      errors.push({
        code: "PUB_MISSING_PAGE_SLUG",
        message: `Page "${page.name}" is missing a URL slug.`,
        pageId,
      });
    } else {
      if (slugs.has(page.slug)) {
        errors.push({
          code: "PUB_DUPLICATE_SLUG",
          message: `Duplicate page slug "${page.slug}" found on page "${page.name}".`,
          pageId,
        });
      }
      slugs.add(page.slug);

      if (page.slug === "/" || page.slug === "") {
        hasHomePage = true;
      }
    }

    // Root element validation
    const root = doc.elements[page.rootId];
    if (!root) {
      errors.push({
        code: "PUB_MISSING_ROOT",
        message: `Page "${page.name}" references non-existent root element "${page.rootId}".`,
        pageId,
      });
    } else if (root.type !== "Body") {
      errors.push({
        code: "PUB_INVALID_ROOT",
        message: `Page "${page.name}" root element must be of type "Body", got "${root.type}".`,
        pageId,
      });
    }
  }

  if (!hasHomePage && pages.length > 0) {
    warnings.push("No page has slug '/' (home page). The first page will be served as index.html.");
  }

  // 3. Element-level integrity checks
  let emptyImagesCount = 0;
  for (const [elId, el] of Object.entries(doc.elements)) {
    // Check links
    if (el.props.href && typeof el.props.href === "string") {
      const href = el.props.href;
      if (href.startsWith("/")) {
        const path = href.split("#")[0];
        if (path && path !== "" && !slugs.has(path)) {
          errors.push({
            code: "PUB_BROKEN_LINK",
            message: `Element "${el.name || elId}" links to non-existent page "${path}".`,
            elementId: elId,
          });
        }
      }
    }

    // Check images
    if (el.type === "Image") {
      if (!el.props.src || String(el.props.src).trim() === "") {
        emptyImagesCount++;
      }
    }

    // Check form elements
    if (el.type === "Form") {
      if (!el.props.name && !el.id) {
        errors.push({
          code: "PUB_INVALID_FORM",
          message: `Form element "${el.name || elId}" must have a name or ID for submission tracking.`,
          elementId: elId,
        });
      }
    }
  }

  if (emptyImagesCount > 0) {
    warnings.push(
      `${emptyImagesCount} image${emptyImagesCount > 1 ? "s have" : " has"} no photo`
    );
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    emptyImagesCount,
  };
}
