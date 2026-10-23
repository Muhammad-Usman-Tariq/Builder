/**
 * Helper to determine if a database URL is properly configured (not empty or a placeholder).
 */
export function isConfiguredDatabaseUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.includes("USER:PASSWORD") ||
    trimmed.includes("HOST:PORT") ||
    trimmed.includes("DBNAME") ||
    trimmed.includes("strong_password_here") ||
    trimmed.includes("your-") ||
    trimmed.includes("<")
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
    if (!parsed.hostname || parsed.hostname === "HOST") return false;
    if (parsed.username === "USER") return false;
    return true;
  } catch {
    return false;
  }
}
