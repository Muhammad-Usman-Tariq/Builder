/**
 * Deep Link handling for Builder Desktop.
 * Protocol: builder://site/<siteId>
 */

export interface DeepLinkResult {
  siteId: string;
}

/**
 * Parses a builder protocol URL.
 * Accepts:
 *   - builder://site/site_123
 *   - builder://site/site_123/
 *   - builder:///site/site_123
 *   - builder://site/site_123?page=p1
 */
export function parseDeepLink(rawUrl: string): DeepLinkResult | null {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed.toLowerCase().startsWith("builder:")) {
    return null;
  }

  // Prevent path traversal attempts
  if (trimmed.includes("..")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol.toLowerCase() !== "builder:") {
      return null;
    }

    let siteId: string | null = null;

    if (parsed.host.toLowerCase() === "site") {
      // Host is "site", pathname should be single segment "/<siteId>"
      const segs = parsed.pathname.split("/").filter(Boolean);
      if (segs.length === 1 && segs[0]) {
        siteId = segs[0];
      }
    } else if (parsed.pathname.startsWith("/site/")) {
      const segs = parsed.pathname.split("/").filter(Boolean);
      // segs: ["site", "<siteId>"]
      if (segs.length === 2 && segs[0]?.toLowerCase() === "site" && segs[1]) {
        siteId = segs[1];
      }
    }

    if (!siteId) {
      return null;
    }

    // Sanitize siteId: must only contain alphanumeric, underscore, hyphen
    const validSiteIdRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validSiteIdRegex.test(siteId)) {
      return null;
    }

    return { siteId };
  } catch {
    return null;
  }
}

/**
 * Searches command-line arguments for a builder:// protocol URL.
 */
export function findDeepLinkInArgv(argv: string[]): string | null {
  if (!Array.isArray(argv)) {
    return null;
  }
  for (const arg of argv) {
    if (typeof arg === "string" && arg.trim().toLowerCase().startsWith("builder:")) {
      return arg.trim();
    }
  }
  return null;
}

/**
 * Builds the full web editor URL for a given site ID.
 */
export function buildEditorUrl(baseUrl: string, siteId: string): string {
  if (!baseUrl) {
    throw new Error("baseUrl is required to construct editor URL");
  }
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/editor/${encodeURIComponent(siteId)}`;
}
