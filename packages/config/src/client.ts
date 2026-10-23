export interface ClientConfig {
  appUrl: string;
  apiPublicUrl: string;
}

/**
 * Returns non-sensitive, client-safe configuration for browser bundles.
 * Secrets must never be added here.
 */
export function getClientConfig(): ClientConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL (or NEXT_PUBLIC_APP_URL) is required");
  }
  const apiPublicUrl =
    process.env.NEXT_PUBLIC_API_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    appUrl;

  return {
    appUrl,
    apiPublicUrl,
  };
}
