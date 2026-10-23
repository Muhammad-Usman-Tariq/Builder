/**
 * Security and URL validation helpers for Builder Desktop.
 */

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Checks whether a URL is safe to open in the user's system default browser.
 * Rejects javascript:, file:, data:, blob:, or any protocol other than http/https.
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") {
    return false;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return false;
    }

    // Must have a valid non-empty hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a URL belongs to the Builder web application origin.
 */
export function isAllowedAppUrl(url: string, baseAppUrl: string): boolean {
  if (!url || !baseAppUrl) {
    return false;
  }

  try {
    const parsedTarget = new URL(url);
    const parsedBase = new URL(baseAppUrl);

    // Same origin check (protocol + hostname + port)
    return parsedTarget.origin.toLowerCase() === parsedBase.origin.toLowerCase();
  } catch {
    return false;
  }
}
