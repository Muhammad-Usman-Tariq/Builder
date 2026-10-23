/**
 * @builder/storage
 * Unified Storage Interface supporting S3-compatible providers (R2, AWS, MinIO)
 * and Cloudinary signed direct uploads, plus Unsplash stock photography.
 * Milestones M6 and BATCH A2.
 */

import { S3StorageAdapter, type S3Config } from "./adapters/s3.js";
import { CloudinaryStorageAdapter } from "./adapters/cloudinary.js";
import type {
  StorageAdapter,
  StorageProviderType,
  CreateUploadParams,
  UploadDescription,
  ConfirmUploadParams,
  ConfirmUploadResult,
  DeleteAssetParams,
  ImageTransformOptions,
} from "./types.js";

export * from "./types.js";
export * from "./adapters/s3.js";
export * from "./adapters/cloudinary.js";
export * from "./unsplash.js";
export * from "./stock-photos.js";


export function getActiveStorageProvider(): StorageProviderType | null {
  const prov = process.env["STORAGE_PROVIDER"]?.trim().toLowerCase();
  if (prov === "s3" || prov === "cloudinary") {
    return prov;
  }
  return null;
}

export function resetStorageAdapters(): void {
  // Provided for lifecycle resets
}

export function getStorageAdapter(
  provider?: StorageProviderType | string | null
): StorageAdapter | null {
  const targetProvider = (provider ?? getActiveStorageProvider()) as StorageProviderType | null;

  if (targetProvider === "s3") {
    return new S3StorageAdapter();
  }

  if (targetProvider === "cloudinary") {
    return new CloudinaryStorageAdapter();
  }

  return null;
}

export function isStorageConfigured(): boolean {
  const adapter = getStorageAdapter();
  if (!adapter) return false;
  if (adapter instanceof S3StorageAdapter) return adapter.isConfigured();
  if (adapter instanceof CloudinaryStorageAdapter) return adapter.isConfigured();
  return false;
}

export async function createUpload(params: CreateUploadParams): Promise<UploadDescription> {
  const adapter = getStorageAdapter();
  if (!adapter) {
    throw new Error("Storage is not configured — add STORAGE_PROVIDER to .env");
  }
  return adapter.createUpload(params);
}

export async function confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult> {
  const adapter = getStorageAdapter(params.provider);
  if (!adapter) {
    throw new Error(`Storage adapter for provider '${params.provider}' is not available`);
  }
  return adapter.confirmUpload(params);
}

export function getAssetUrl(
  params: {
    key: string;
    provider?: string | null;
    providerFileId?: string | null;
  },
  transform?: ImageTransformOptions
): string {
  const provider = (params.provider as StorageProviderType) || getActiveStorageProvider() || "s3";
  const adapter = getStorageAdapter(provider) ?? new S3StorageAdapter();
  return adapter.getUrl(
    { key: params.key, providerFileId: params.providerFileId },
    transform
  );
}

export async function deleteAsset(params: DeleteAssetParams): Promise<boolean> {
  const adapter = getStorageAdapter(params.provider);
  if (!adapter) return false;
  return adapter.delete(params);
}

// -------------------------------------------------------------
// Backwards-compatible helpers for existing callers and tests
// -------------------------------------------------------------
export function getPublicAssetUrl(
  key: string,
  customConfig?: Partial<S3Config>
): string {
  if (customConfig) {
    const adapter = new S3StorageAdapter(customConfig);
    return adapter.getUrl({ key });
  }
  return getAssetUrl({ key });
}

export async function getPresignedUploadUrl(options: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  customConfig?: Partial<S3Config>;
}): Promise<{
  uploadUrl: string;
  publicUrl: string;
  key: string;
  headers: Record<string, string>;
}> {
  const adapter = new S3StorageAdapter(options.customConfig);
  const pathParts = options.key.split("/");
  const filename = pathParts[pathParts.length - 1] || "file";
  const upload = await adapter.createUpload({
    workspaceId: "default",
    filename,
    mimeType: options.contentType,
    fileSize: 1024,
  });

  if (upload.method !== "PUT") {
    throw new Error("Unexpected non-PUT upload from S3 adapter");
  }

  // Preserve explicit key if requested in options
  return {
    uploadUrl: upload.url,
    publicUrl: adapter.getUrl({ key: options.key }),
    key: options.key,
    headers: upload.headers,
  };
}

/**
 * Uploads an in-memory buffer or file payload directly to the active storage provider.
 */
export async function uploadBufferToStorage(options: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer | Uint8Array;
}): Promise<{
  publicUrl: string;
  key: string;
  providerFileId: string;
  provider: StorageProviderType;
} | null> {
  const adapter = getStorageAdapter();
  if (!adapter || !isStorageConfigured()) {
    return null;
  }

  const upload = await adapter.createUpload({
    workspaceId: options.workspaceId,
    filename: options.filename,
    mimeType: options.mimeType,
    fileSize: options.buffer.byteLength,
  });

  if (upload.provider === "s3") {
    const res = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: options.buffer as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`S3 upload failed with status ${res.status}`);
    }
  } else if (upload.provider === "cloudinary") {
    const formData = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) {
      formData.append(k, v);
    }
    const blob = new Blob([options.buffer as unknown as BlobPart], { type: options.mimeType });
    formData.append("file", blob, options.filename);
    const res = await fetch(upload.url, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
    }
  }

  await adapter.confirmUpload({
    key: upload.key,
    providerFileId: upload.providerFileId,
    provider: upload.provider,
  });

  return {
    publicUrl: upload.publicUrl,
    key: upload.key,
    providerFileId: upload.providerFileId,
    provider: upload.provider,
  };
}

/**
 * Downloads a remote public image and saves it to configured storage (Cloudinary or S3),
 * returning the new storage public URL.
 */
export async function copyRemoteImageToStorage(options: {
  workspaceId: string;
  imageUrl: string;
  timeoutMs?: number;
}): Promise<{
  publicUrl: string;
  key: string;
  providerFileId: string;
  provider: StorageProviderType;
} | null> {
  if (!isStorageConfigured()) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
    const res = await fetch(options.imageUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const mimeType = res.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) return null;

    const ext = mimeType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "png";
    const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    return await uploadBufferToStorage({
      workspaceId: options.workspaceId,
      filename,
      mimeType,
      buffer,
    });
  } catch (err) {
    console.warn(`[Storage] Could not copy remote image ${options.imageUrl} to storage:`, err);
    return null;
  }
}

