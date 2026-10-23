import type { UnsplashPhoto, UnsplashSearchResult } from "./types.js";

/**
 * Checks whether the Unsplash API access key is configured.
 */
export function isUnsplashConfigured(customKey?: string): boolean {
  const key = customKey || process.env["UNSPLASH_ACCESS_KEY"];
  return Boolean(key && key.trim().length > 0);
}

/**
 * Searches Unsplash for stock photography matching user or AI prompt queries.
 * Gracefully returns empty results if Unsplash is unconfigured (Rule 6).
 */
export async function searchUnsplashPhotos(
  query: string,
  page = 1,
  perPage = 20,
  customKey?: string
): Promise<UnsplashSearchResult> {
  const accessKey = customKey || process.env["UNSPLASH_ACCESS_KEY"];

  if (!accessKey || accessKey.trim().length === 0) {
    return {
      photos: [],
      total: 0,
      totalPages: 0,
      configured: false,
    };
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("orientation", "landscape");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey.trim()}`,
        "Accept-Version": "v1",
      },
    });

    if (!res.ok) {
      const isRateLimited = res.status === 429 || res.headers.get("x-ratelimit-remaining") === "0";
      const errorMsg = isRateLimited
        ? "Rate limit exceeded (HTTP 429)"
        : `Unsplash API request failed with status ${res.status}`;
      console.warn(`[Unsplash] ${errorMsg}`);
      return {
        photos: [],
        total: 0,
        totalPages: 0,
        configured: true,
        error: errorMsg,
        rateLimited: isRateLimited,
      };
    }

    const data = (await res.json()) as {
      total: number;
      total_pages: number;
      results: Array<{
        id: string;
        width: number;
        height: number;
        alt_description: string | null;
        description: string | null;
        urls: {
          regular: string;
          thumb: string;
          small: string;
        };
        user: {
          name: string;
          links: {
            html: string;
          };
        };
      }>;
    };

    const photos: UnsplashPhoto[] = (data.results || []).map((item) => ({
      id: item.id,
      url: item.urls.regular,
      thumb: item.urls.thumb || item.urls.small,
      alt: item.alt_description || item.description || query,
      author: item.user.name,
      authorUrl: item.user.links.html,
      width: item.width,
      height: item.height,
    }));

    return {
      photos,
      total: data.total || 0,
      totalPages: data.total_pages || 0,
      configured: true,
    };
  } catch (err: any) {
    const errorMsg = err?.message || "Unsplash search request failed";
    console.error("[Unsplash] Search request failed:", err);
    return { photos: [], total: 0, totalPages: 0, configured: true, error: errorMsg };
  }
}
