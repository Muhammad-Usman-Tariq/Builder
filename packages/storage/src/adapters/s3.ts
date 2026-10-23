import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  forcePathStyle: boolean;
}

export class S3StorageAdapter implements StorageAdapter {
  public readonly provider = "s3" as const;
  private client: S3Client;
  private config: S3Config;

  constructor(customConfig?: Partial<S3Config>) {
    const endpoint = customConfig?.endpoint ?? process.env["S3_ENDPOINT"] ?? "";
    const region = customConfig?.region ?? process.env["S3_REGION"] ?? "auto";
    const accessKeyId = customConfig?.accessKeyId ?? process.env["S3_ACCESS_KEY_ID"] ?? "";
    const secretAccessKey =
      customConfig?.secretAccessKey ?? process.env["S3_SECRET_ACCESS_KEY"] ?? "";
    const bucket = customConfig?.bucket ?? process.env["S3_BUCKET"] ?? "";
    const publicUrl = customConfig?.publicUrl ?? process.env["S3_PUBLIC_URL"] ?? "";
    const forcePathStyle =
      customConfig?.forcePathStyle ??
      (process.env["S3_FORCE_PATH_STYLE"] === "true" ||
        process.env["S3_FORCE_PATH_STYLE"] === "1");

    this.config = {
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicUrl,
      forcePathStyle,
    };

    const s3Config: S3ClientConfig = {
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: this.config.forcePathStyle,
    };
    if (this.config.endpoint) {
      s3Config.endpoint = this.config.endpoint;
    }

    this.client = new S3Client(s3Config);
  }

  public isConfigured(): boolean {
    return Boolean(
      this.config.accessKeyId.trim() &&
        this.config.secretAccessKey.trim() &&
        this.config.bucket.trim() &&
        this.config.publicUrl.trim()
    );
  }

  public async createUpload(params: CreateUploadParams): Promise<UploadDescription> {
    if (!this.isConfigured()) {
      throw new Error("Storage is not configured — add S3_* to .env");
    }

    const assetId = `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const cleanFilename = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `workspaces/${params.workspaceId}/assets/${assetId}/${cleanFilename}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: params.mimeType,
    });

    const expiresIn = 900; // 15 mins
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    const publicUrl = this.getUrl({ key, providerFileId: key });

    return {
      provider: "s3",
      method: "PUT",
      url: uploadUrl,
      headers: {
        "Content-Type": params.mimeType,
      },
      key,
      providerFileId: key,
      publicUrl,
    };
  }

  public async confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult> {
    if (!this.isConfigured()) {
      throw new Error("Storage is not configured — add S3_* to .env");
    }

    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: params.key,
        })
      );

      return {
        exists: true,
        bytes: res.ContentLength,
      };
    } catch (err: any) {
      if (
        err?.name === "NotFound" ||
        err?.$metadata?.httpStatusCode === 404 ||
        err?.message?.includes("404")
      ) {
        return { exists: false };
      }
      throw err;
    }
  }

  public getUrl(
    params: { key: string; providerFileId?: string | null },
    transform?: ImageTransformOptions
  ): string {
    const base = (this.config.publicUrl || this.config.endpoint || "").replace(/\/$/, "");
    if (!base) {
      throw new Error("Storage is not configured — add S3_* to .env");
    }
    const cleanKey = params.key.replace(/^\//, "");
    let url = `${base}/${cleanKey}`;

    if (transform && (transform.width || transform.height || transform.format)) {
      const qs = new URLSearchParams();
      if (transform.width) qs.set("w", String(transform.width));
      if (transform.height) qs.set("h", String(transform.height));
      if (transform.format) qs.set("f", transform.format);
      url += `?${qs.toString()}`;
    }

    return url;
  }

  public async delete(params: DeleteAssetParams): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: params.key,
        })
      );
      return true;
    } catch (err) {
      console.warn(`[S3Adapter] Failed to delete object ${params.key}:`, err);
      return false;
    }
  }
}
