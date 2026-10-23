import { isUnsplashConfigured, searchUnsplashPhotos } from "./unsplash.js";
import { copyRemoteImageToStorage, isStorageConfigured } from "./index.js";

export interface DocumentElement {
  id: string;
  type: string;
  name?: string | undefined;
  props: Record<string, any>;
  [key: string]: any;
}

export interface DocumentWithAssets {
  elements: Record<string, any>;
  assets: Record<string, any>;
  [key: string]: any;
}

export interface FillStockPhotosOptions {
  doc: DocumentWithAssets;
  workspaceId: string;
  siteId?: string | undefined;
  onImageFilled?: (log: string) => void;
  onProgress?: (message: string) => void;
}

export interface FillStockPhotosResult {
  filledCount: number;
  failedCount: number;
  logs: string[];
}

/**
 * Simplifies a search query down to 2-3 essential nouns/keywords
 * when a specific query (e.g. "florist boutique interior flowers") returns no results.
 */
export function simplifyQuery(query: string): string {
  if (!query) return "business";
  // Filter out filler words, adjectives, prepositions, descriptors
  const stopWords = new Set([
    "a", "an", "the", "in", "on", "at", "by", "for", "with", "about", "against", "between",
    "into", "through", "during", "before", "after", "above", "below", "to", "from", "up",
    "down", "of", "off", "over", "under", "again", "further", "then", "once", "here", "there",
    "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "s", "t", "can", "will", "just", "don", "should", "now", "and", "or", "but",
    "interior", "exterior", "modern", "aesthetic", "background", "photo", "image", "picture",
    "shot", "photography", "professional", "clean", "beautiful", "high", "quality", "minimalist"
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (words.length === 0) {
    // If everything was filtered, try fallback to original words > 3 chars
    const fallback = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
    return fallback.slice(0, 2).join(" ") || "business";
  }

  // Keep up to 2-3 main nouns
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

/**
 * Searches Unsplash for stock photography matching AI imageQuery,
 * copies chosen photos into configured storage (Cloudinary or S3),
 * sets element props (src, alt, imageQuery, attribution) and registers in doc.assets.
 * Respects Unsplash rate limits: if search fails, leaves slot empty and records reason.
 */
export async function fillSiteStockPhotos(
  options: FillStockPhotosOptions
): Promise<FillStockPhotosResult> {
  const { doc, workspaceId, onImageFilled, onProgress } = options;
  const logs: string[] = [];
  let filledCount = 0;
  let failedCount = 0;

  const imageElements: DocumentElement[] = [];
  const elements = Object.values(doc.elements || {}) as DocumentElement[];
  for (const el of elements) {
    if (el && el.type === "Image" && (!el.props?.["src"] || String(el.props["src"]).trim() === "")) {
      imageElements.push(el);
    }
  }

  if (imageElements.length === 0) {
    return { filledCount: 0, failedCount: 0, logs: [] };
  }

  if (!isUnsplashConfigured()) {
    const reason = "Unsplash is not configured (UNSPLASH_ACCESS_KEY missing)";
    for (const el of imageElements) {
      const q =
        (el.props["imageQuery"] as string) ||
        (el.props["alt"] as string) ||
        el.name ||
        "business";
      const logLine = `Image fill failed for "${q}": ${reason}`;
      logs.push(logLine);
      onImageFilled?.(logLine);
      failedCount++;
    }
    return { filledCount, failedCount, logs };
  }

  let isRateLimited = false;
  let rateLimitReason = "";

  for (let idx = 0; idx < imageElements.length; idx++) {
    const el = imageElements[idx]!;
    const rawQuery =
      (el.props["imageQuery"] as string) ||
      (el.props["alt"] as string) ||
      el.name ||
      "modern business";
    const query = String(rawQuery).replace(/^\[Chart\]\s*/i, "").trim() || "modern business";

    if (isRateLimited) {
      const logLine = `Image fill failed for "${query}": ${rateLimitReason}`;
      logs.push(logLine);
      onImageFilled?.(logLine);
      failedCount++;
      continue;
    }

    onProgress?.(`Searching stock photo for "${query}" (${idx + 1}/${imageElements.length})...`);

    try {
      let searchRes = await searchUnsplashPhotos(query, 1, 5);

      if (searchRes.rateLimited) {
        isRateLimited = true;
        rateLimitReason = searchRes.error || "Rate limit exceeded (HTTP 429)";
        const logLine = `Image fill failed for "${query}": ${rateLimitReason}`;
        logs.push(logLine);
        onImageFilled?.(logLine);
        failedCount++;
        continue;
      }

      // If no photos found on initial query, retry once with simplified query (2-3 main nouns)
      if (!searchRes.photos || searchRes.photos.length === 0) {
        const simplifiedQuery = simplifyQuery(query);
        if (simplifiedQuery && simplifiedQuery !== query.toLowerCase()) {
          onProgress?.(`Retrying stock photo search with simplified query "${simplifiedQuery}"...`);
          const fallbackRes = await searchUnsplashPhotos(simplifiedQuery, 1, 5);
          if (fallbackRes.photos && fallbackRes.photos.length > 0) {
            searchRes = fallbackRes;
          }
        }
      }

      if (!searchRes.photos || searchRes.photos.length === 0) {
        const reason = searchRes.error || `No photos found on Unsplash for query "${query}"`;
        const logLine = `Image fill failed for "${query}": ${reason}`;
        logs.push(logLine);
        onImageFilled?.(logLine);
        failedCount++;
        continue;
      }

      const photo = searchRes.photos[0]!;
      onProgress?.(`Copying stock photo for "${query}" to storage...`);

      // Copy remote image into storage (Cloudinary or S3)
      let publicUrl = photo.url;
      let assetKey = `unsplash_${photo.id}`;

      if (isStorageConfigured()) {
        const copied = await copyRemoteImageToStorage({
          workspaceId,
          imageUrl: photo.url,
        });
        if (copied) {
          publicUrl = copied.publicUrl;
          assetKey = copied.key;
        } else {
          const reason = "Failed to copy photo into storage";
          const logLine = `Image fill failed for "${query}": ${reason}`;
          logs.push(logLine);
          onImageFilled?.(logLine);
          failedCount++;
          continue;
        }
      }

      // Update element props
      el.props["src"] = publicUrl;
      el.props["alt"] = photo.alt || (el.props["alt"] as string) || query;
      el.props["imageQuery"] = query;
      el.props["unsplashAuthor"] = photo.author;
      el.props["unsplashAuthorUrl"] = photo.authorUrl;
      el.props["unsplashPhotoId"] = photo.id;
      el.props["unsplashAttribution"] = `Photo by ${photo.author} on Unsplash (${photo.authorUrl})`;

      // Store in document assets dictionary
      const assetId = `ast_unsplash_${photo.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      doc.assets[assetId] = {
        id: assetId,
        name: `Unsplash — ${photo.author}`,
        key: assetKey,
        url: publicUrl,
        type: "image/jpeg",
        size: 0,
        width: photo.width,
        height: photo.height,
      };
      el.props["asset"] = { asset: assetId };

      const logLine = `Image fill: "${query}" -> photo ${photo.id} by ${photo.author} (${publicUrl})`;
      logs.push(logLine);
      onImageFilled?.(logLine);
      filledCount++;
    } catch (err: any) {
      const reason = err?.message || "Unexpected error during image fill";
      const logLine = `Image fill failed for "${query}": ${reason}`;
      logs.push(logLine);
      onImageFilled?.(logLine);
      failedCount++;
    }
  }

  return { filledCount, failedCount, logs };
}
