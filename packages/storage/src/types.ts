export type StorageProviderType = "s3" | "cloudinary";

export interface CreateUploadParams {
  workspaceId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export type UploadDescription =
  | {
      provider: "s3";
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      key: string;
      providerFileId: string;
      publicUrl: string;
    }
  | {
      provider: "cloudinary";
      method: "POST";
      url: string;
      fields: Record<string, string>;
      key: string;
      providerFileId: string;
      publicUrl: string;
    };

export interface ImageTransformOptions {
  width?: number | undefined;
  height?: number | undefined;
  format?: ("webp" | "auto" | "png" | "jpeg") | undefined;
  quality?: ("auto" | number) | undefined;
}

export interface ConfirmUploadParams {
  key: string;
  providerFileId?: string | null | undefined;
  provider: StorageProviderType;
}

export interface ConfirmUploadResult {
  exists: boolean;
  width?: number | undefined;
  height?: number | undefined;
  format?: string | undefined;
  bytes?: number | undefined;
}

export interface DeleteAssetParams {
  provider?: StorageProviderType | undefined;
  key: string;
  providerFileId?: string | null | undefined;
}

export interface StorageAdapter {
  readonly provider: StorageProviderType;
  createUpload(params: CreateUploadParams): Promise<UploadDescription>;
  confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult>;
  getUrl(
    params: { key: string; providerFileId?: string | null | undefined },
    transform?: ImageTransformOptions | undefined
  ): string;
  delete(params: DeleteAssetParams): Promise<boolean>;
}

export interface UnsplashPhoto {
  id: string;
  url: string;
  thumb: string;
  alt: string;
  author: string;
  authorUrl: string;
  width: number;
  height: number;
}

export interface UnsplashSearchResult {
  photos: UnsplashPhoto[];
  total: number;
  totalPages: number;
  configured: boolean;
  error?: string | undefined;
  rateLimited?: boolean | undefined;
}
