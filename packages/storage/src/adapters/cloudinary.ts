import crypto from "node:crypto";
import type {
  StorageAdapter,
  CreateUploadParams,
  UploadDescription,
  ConfirmUploadParams,
  ConfirmUploadResult,
  DeleteAssetParams,
  ImageTransformOptions,
} from "../types.js";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export class CloudinaryStorageAdapter implements StorageAdapter {
  public readonly provider = "cloudinary" as const;
  private config: CloudinaryConfig;

  constructor(customConfig?: Partial<CloudinaryConfig>) {
    this.config = {
      cloudName: customConfig?.cloudName ?? process.env["CLOUDINARY_CLOUD_NAME"] ?? "",
      apiKey: customConfig?.apiKey ?? process.env["CLOUDINARY_API_KEY"] ?? "",
      apiSecret: customConfig?.apiSecret ?? process.env["CLOUDINARY_API_SECRET"] ?? "",
    };
  }

  public isConfigured(): boolean {
    return Boolean(
      this.config.cloudName.trim() &&
        this.config.apiKey.trim() &&
        this.config.apiSecret.trim()
    );
  }

  public async createUpload(params: CreateUploadParams): Promise<UploadDescription> {
    if (!this.isConfigured()) {
      throw new Error("Storage is not configured — add CLOUDINARY_* to .env");
    }

    const folder = `workspaces/${params.workspaceId}/assets`;
    const uniqueSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const cleanBasename = params.filename
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const publicId = `${cleanBasename}_${uniqueSuffix}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature parameters must be in alphabetical order
    // Parameters to sign: folder, public_id, timestamp
    const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash("sha1")
      .update(paramsToSign + this.config.apiSecret)
      .digest("hex");

    const providerFileId = `${folder}/${publicId}`;
    const uploadUrl = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/auto/upload`;
    const publicUrl = this.getUrl({ key: params.filename, providerFileId });

    return {
      provider: "cloudinary",
      method: "POST",
      url: uploadUrl,
      fields: {
        api_key: this.config.apiKey,
        timestamp: String(timestamp),
        folder,
        public_id: publicId,
        signature,
      },
      key: providerFileId,
      providerFileId,
      publicUrl,
    };
  }

  public async confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult> {
    if (!this.isConfigured()) {
      throw new Error("Storage is not configured — add CLOUDINARY_* to .env");
    }

    const providerFileId = params.providerFileId || params.key;
    const authHeader =
      "Basic " +
      Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString("base64");

    try {
      // Query Cloudinary Admin API for resource existence & dimensions
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${this.config.cloudName}/resources/image/upload/${encodeURIComponent(
          providerFileId
        )}`,
        {
          headers: {
            Authorization: authHeader,
          },
        }
      );

      if (res.status === 404) {
        return { exists: false };
      }

      if (!res.ok) {
        throw new Error(
          `Cloudinary resource check failed (${res.status} ${res.statusText})`
        );
      }

      const data = (await res.json()) as {
        width?: number;
        height?: number;
        format?: string;
        bytes?: number;
      };

      return {
        exists: true,
        width: data.width,
        height: data.height,
        format: data.format,
        bytes: data.bytes,
      };
    } catch (err: any) {
      if (err?.message?.includes("404")) {
        return { exists: false };
      }
      throw err;
    }
  }

  public getUrl(
    params: { key: string; providerFileId?: string | null },
    transform?: ImageTransformOptions
  ): string {
    if (!this.config.cloudName) {
      throw new Error("Storage is not configured — add CLOUDINARY_* to .env");
    }

    const fileId = params.providerFileId || params.key;
    const cleanFileId = fileId.replace(/^\//, "");

    const transformSegments: string[] = [];
    if (transform?.width || transform?.height) {
      transformSegments.push("c_limit");
      if (transform.width) transformSegments.push(`w_${transform.width}`);
      if (transform.height) transformSegments.push(`h_${transform.height}`);
    }
    if (transform?.format) {
      transformSegments.push(`f_${transform.format}`);
    }
    if (transform?.quality) {
      transformSegments.push(`q_${transform.quality}`);
    }

    const transformPath =
      transformSegments.length > 0 ? `${transformSegments.join(",")}/` : "";

    return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${transformPath}${cleanFileId}`;
  }

  public async delete(params: DeleteAssetParams): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const fileId = params.providerFileId || params.key;
    const authHeader =
      "Basic " +
      Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString("base64");

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${this.config.cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(
          fileId
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: authHeader,
          },
        }
      );
      return res.ok;
    } catch (err) {
      console.warn(`[CloudinaryAdapter] Failed to delete asset ${fileId}:`, err);
      return false;
    }
  }
}
