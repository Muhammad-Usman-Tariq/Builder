import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  S3StorageAdapter,
  CloudinaryStorageAdapter,
  getStorageAdapter,
  getActiveStorageProvider,
  createUpload,
  confirmUpload,
  getAssetUrl,
  isUnsplashConfigured,
  searchUnsplashPhotos,
} from "../index.js";

describe("Milestone M6 & BATCH A2: Storage Adapters (S3 and Cloudinary)", () => {
  const dummyS3Config = {
    endpoint: "https://my-account.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key-1234567890123456",
    bucket: "builder-assets",
    publicUrl: "https://cdn.example.com/assets",
    forcePathStyle: false,
  };

  const dummyCloudinaryConfig = {
    cloudName: "my-cloud",
    apiKey: "c-api-key-123",
    apiSecret: "c-secret-987654321",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("S3 Storage Adapter", () => {
    it("reports configured status accurately", () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      expect(adapter.isConfigured()).toBe(true);

      const unconfigured = new S3StorageAdapter({ accessKeyId: "", bucket: "" });
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it("constructs canonical public asset URLs and query transforms", () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const url = adapter.getUrl({ key: "images/hero.webp" });
      expect(url).toBe("https://cdn.example.com/assets/images/hero.webp");

      const transformed = adapter.getUrl(
        { key: "images/hero.webp" },
        { width: 800, height: 600, format: "webp" }
      );
      expect(transformed).toContain(
        "https://cdn.example.com/assets/images/hero.webp?w=800&h=600&f=webp"
      );
    });

    it("throws when getUrl is called without publicUrl or endpoint configured", () => {
      const adapter = new S3StorageAdapter({ ...dummyS3Config, publicUrl: "", endpoint: "" });
      expect(() => adapter.getUrl({ key: "test.png" })).toThrow(
        "Storage is not configured — add S3_* to .env"
      );
    });

    it("creates presigned PUT upload description", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const upload = await adapter.createUpload({
        workspaceId: "ws_123",
        filename: "test-image.png",
        mimeType: "image/png",
        fileSize: 1024,
      });

      expect(upload.provider).toBe("s3");
      expect(upload.method).toBe("PUT");
      expect(upload.url).toContain("builder-assets");
      expect(upload.url).toContain("test-image.png");
      expect(upload.url).toContain("X-Amz-Signature");
      if (upload.provider === "s3") {
        expect(upload.headers["Content-Type"]).toBe("image/png");
      }
      expect(upload.key).toMatch(/^workspaces\/ws_123\/assets\/ast_[a-f0-9]+\/test-image\.png$/);
    });

    it("throws when createUpload is called on unconfigured adapter", async () => {
      const adapter = new S3StorageAdapter({ accessKeyId: "" });
      await expect(
        adapter.createUpload({
          workspaceId: "ws_123",
          filename: "test.png",
          mimeType: "image/png",
          fileSize: 1024,
        })
      ).rejects.toThrow("Storage is not configured — add S3_* to .env");
    });

    it("confirms upload existence via HeadObject", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const mockSend = vi.fn().mockResolvedValue({ ContentLength: 2048 });
      (adapter as any).client = { send: mockSend };

      const result = await adapter.confirmUpload({
        key: "workspaces/ws_123/assets/ast_1/photo.jpg",
        providerFileId: "workspaces/ws_123/assets/ast_1/photo.jpg",
        provider: "s3",
      });

      expect(result.exists).toBe(true);
      expect(result.bytes).toBe(2048);
    });

    it("returns exists: false when HeadObject returns 404 NotFound", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const notFoundErr = new Error("NotFound");
      (notFoundErr as any).name = "NotFound";
      (adapter as any).client = { send: vi.fn().mockRejectedValue(notFoundErr) };

      const notFoundResult = await adapter.confirmUpload({
        key: "workspaces/ws_123/assets/ast_1/missing.jpg",
        providerFileId: "workspaces/ws_123/assets/ast_1/missing.jpg",
        provider: "s3",
      });

      expect(notFoundResult.exists).toBe(false);
    });

    it("rethrows non-404 errors during confirmUpload", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const serverErr = new Error("InternalServerError (500)");
      (adapter as any).client = { send: vi.fn().mockRejectedValue(serverErr) };

      await expect(
        adapter.confirmUpload({
          key: "workspaces/ws_123/assets/ast_1/photo.jpg",
          providerFileId: "workspaces/ws_123/assets/ast_1/photo.jpg",
          provider: "s3",
        })
      ).rejects.toThrow("InternalServerError");
    });

    it("throws when confirmUpload is called on unconfigured adapter", async () => {
      const adapter = new S3StorageAdapter({ bucket: "" });
      await expect(
        adapter.confirmUpload({
          key: "photo.jpg",
          provider: "s3",
        })
      ).rejects.toThrow("Storage is not configured — add S3_* to .env");
    });

    it("deletes objects from S3 and returns true", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      const mockSend = vi.fn().mockResolvedValue({});
      (adapter as any).client = { send: mockSend };

      const res = await adapter.delete({ key: "workspaces/ws_123/assets/photo.jpg" });
      expect(res).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it("returns false gracefully when S3 delete fails or adapter is unconfigured", async () => {
      const adapter = new S3StorageAdapter(dummyS3Config);
      (adapter as any).client = {
        send: vi.fn().mockRejectedValue(new Error("AccessDenied")),
      };

      const res = await adapter.delete({ key: "workspaces/ws_123/assets/photo.jpg" });
      expect(res).toBe(false);

      const unconfigured = new S3StorageAdapter({ bucket: "" });
      expect(await unconfigured.delete({ key: "photo.jpg" })).toBe(false);
    });
  });

  describe("Cloudinary Storage Adapter", () => {
    it("reports configured status accurately", () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);
      expect(adapter.isConfigured()).toBe(true);

      const unconfigured = new CloudinaryStorageAdapter({ cloudName: "", apiKey: "" });
      expect(adapter.isConfigured()).toBe(true);
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it("generates signed POST upload description with expires/timestamp and sha1 signature", async () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);
      const upload = await adapter.createUpload({
        workspaceId: "ws_abc",
        filename: "gallery photo.jpg",
        mimeType: "image/jpeg",
        fileSize: 5000,
      });

      expect(upload.provider).toBe("cloudinary");
      expect(upload.method).toBe("POST");
      expect(upload.url).toBe("https://api.cloudinary.com/v1_1/my-cloud/auto/upload");

      const fields = (upload as any).fields;
      expect(fields.api_key).toBe("c-api-key-123");
      expect(fields.timestamp).toBeDefined();
      expect(fields.folder).toBe("workspaces/ws_abc/assets");
      expect(fields.public_id).toMatch(/^gallery_photo_[a-f0-9]+$/);
      expect(fields.signature).toMatch(/^[a-f0-9]{40}$/); // SHA-1 hex is 40 characters
    });

    it("throws when createUpload is called on unconfigured Cloudinary adapter", async () => {
      const adapter = new CloudinaryStorageAdapter({ cloudName: "" });
      await expect(
        adapter.createUpload({
          workspaceId: "ws_abc",
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          fileSize: 1000,
        })
      ).rejects.toThrow("Storage is not configured — add CLOUDINARY_* to .env");
    });

    it("constructs URLs with Cloudinary transformation pipeline", () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);
      const base = adapter.getUrl({
        key: "photo.jpg",
        providerFileId: "workspaces/ws_abc/assets/photo_123",
      });
      expect(base).toBe(
        "https://res.cloudinary.com/my-cloud/image/upload/workspaces/ws_abc/assets/photo_123"
      );

      const transformed = adapter.getUrl(
        {
          key: "photo.jpg",
          providerFileId: "workspaces/ws_abc/assets/photo_123",
        },
        {
          width: 600,
          height: 400,
          format: "webp",
          quality: "auto",
        }
      );
      expect(transformed).toBe(
        "https://res.cloudinary.com/my-cloud/image/upload/c_limit,w_600,h_400,f_webp,q_auto/workspaces/ws_abc/assets/photo_123"
      );
    });

    it("throws when getUrl is called without cloudName configured", () => {
      const adapter = new CloudinaryStorageAdapter({ cloudName: "" });
      expect(() => adapter.getUrl({ key: "photo.jpg" })).toThrow(
        "Storage is not configured — add CLOUDINARY_* to .env"
      );
    });

    it("confirms upload existence and reads dimensions from Cloudinary Admin API", async () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            width: 1920,
            height: 1080,
            format: "jpg",
            bytes: 54321,
          }),
        })
      );

      const confirmRes = await adapter.confirmUpload({
        key: "photo.jpg",
        providerFileId: "workspaces/ws_abc/assets/photo_123",
        provider: "cloudinary",
      });

      expect(confirmRes.exists).toBe(true);
      expect(confirmRes.width).toBe(1920);
      expect(confirmRes.height).toBe(1080);
      expect(confirmRes.format).toBe("jpg");
    });

    it("returns exists: false on 404 from Cloudinary Admin API", async () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })
      );

      const missingRes = await adapter.confirmUpload({
        key: "photo.jpg",
        providerFileId: "workspaces/ws_abc/assets/missing_123",
        provider: "cloudinary",
      });

      expect(missingRes.exists).toBe(false);
    });

    it("throws error when Cloudinary Admin API returns non-404 failure", async () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        })
      );

      await expect(
        adapter.confirmUpload({
          key: "photo.jpg",
          providerFileId: "workspaces/ws_abc/assets/photo_123",
          provider: "cloudinary",
        })
      ).rejects.toThrow("Cloudinary resource check failed (401 Unauthorized)");
    });

    it("throws when confirmUpload is called on unconfigured Cloudinary adapter", async () => {
      const adapter = new CloudinaryStorageAdapter({ apiKey: "" });
      await expect(
        adapter.confirmUpload({
          key: "photo.jpg",
          provider: "cloudinary",
        })
      ).rejects.toThrow("Storage is not configured — add CLOUDINARY_* to .env");
    });

    it("deletes asset via Cloudinary Admin API and returns boolean", async () => {
      const adapter = new CloudinaryStorageAdapter(dummyCloudinaryConfig);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        })
      );

      const res = await adapter.delete({
        key: "photo.jpg",
        providerFileId: "workspaces/ws_abc/assets/photo_123",
      });
      expect(res).toBe(true);

      // Failure test
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("NetworkError"))
      );
      const failRes = await adapter.delete({
        key: "photo.jpg",
        providerFileId: "workspaces/ws_abc/assets/photo_123",
      });
      expect(failRes).toBe(false);

      const unconfigured = new CloudinaryStorageAdapter({ cloudName: "" });
      expect(await unconfigured.delete({ key: "photo.jpg" })).toBe(false);
    });
  });

  describe("Storage Factory & Lifecycle Delegation", () => {
    it("resolves active storage provider from environment", () => {
      const orig = process.env["STORAGE_PROVIDER"];
      try {
        process.env["STORAGE_PROVIDER"] = "s3";
        expect(getActiveStorageProvider()).toBe("s3");

        process.env["STORAGE_PROVIDER"] = "cloudinary";
        expect(getActiveStorageProvider()).toBe("cloudinary");

        delete process.env["STORAGE_PROVIDER"];
        expect(getActiveStorageProvider()).toBe(null);
      } finally {
        if (orig !== undefined) process.env["STORAGE_PROVIDER"] = orig;
        else delete process.env["STORAGE_PROVIDER"];
      }
    });

    it("returns appropriate adapter instance via getStorageAdapter", () => {
      const s3Adapter = getStorageAdapter("s3");
      expect(s3Adapter).toBeInstanceOf(S3StorageAdapter);

      const cloudAdapter = getStorageAdapter("cloudinary");
      expect(cloudAdapter).toBeInstanceOf(CloudinaryStorageAdapter);

      const nullAdapter = getStorageAdapter("unknown" as any);
      expect(nullAdapter).toBe(null);
    });

    it("throws when createUpload is called with unconfigured storage provider", async () => {
      const orig = process.env["STORAGE_PROVIDER"];
      try {
        delete process.env["STORAGE_PROVIDER"];
        await expect(
          createUpload({
            workspaceId: "ws_1",
            filename: "photo.jpg",
            mimeType: "image/jpeg",
            fileSize: 100,
          })
        ).rejects.toThrow("Storage is not configured — add STORAGE_PROVIDER to .env");
      } finally {
        if (orig !== undefined) process.env["STORAGE_PROVIDER"] = orig;
        else delete process.env["STORAGE_PROVIDER"];
      }
    });

    it("throws when confirmUpload is called with an invalid provider", async () => {
      await expect(
        confirmUpload({
          key: "photo.jpg",
          provider: "nonexistent" as any,
        })
      ).rejects.toThrow("Storage adapter for provider 'nonexistent' is not available");
    });
  });

  describe("Multi-provider Continuity & Switching", () => {
    it("resolves correct public URL based on stored asset provider", () => {
      const prevS3 = process.env["S3_PUBLIC_URL"];
      const prevCloud = process.env["CLOUDINARY_CLOUD_NAME"];
      process.env["S3_PUBLIC_URL"] = "https://s3.example.com";
      process.env["CLOUDINARY_CLOUD_NAME"] = "my-cloud";

      try {
        // Simulating an asset uploaded when S3 was active
        const s3Url = getAssetUrl({
          key: "workspaces/ws_1/assets/ast_1/photo.png",
          provider: "s3",
        });
        expect(s3Url).toBe("https://s3.example.com/workspaces/ws_1/assets/ast_1/photo.png");

        // Simulating an asset uploaded when Cloudinary was active
        const cloudUrl = getAssetUrl({
          key: "banner.png",
          provider: "cloudinary",
          providerFileId: "workspaces/ws_1/assets/banner_123",
        });
        expect(cloudUrl).toBe(
          "https://res.cloudinary.com/my-cloud/image/upload/workspaces/ws_1/assets/banner_123"
        );
      } finally {
        if (prevS3 !== undefined) process.env["S3_PUBLIC_URL"] = prevS3;
        else delete process.env["S3_PUBLIC_URL"];
        if (prevCloud !== undefined) process.env["CLOUDINARY_CLOUD_NAME"] = prevCloud;
        else delete process.env["CLOUDINARY_CLOUD_NAME"];
      }
    });
  });

  describe("Unsplash Stock Integration", () => {
    it("gracefully disables Unsplash search when UNSPLASH_ACCESS_KEY is empty", async () => {
      expect(isUnsplashConfigured("")).toBe(false);

      const res = await searchUnsplashPhotos("minimalist architecture", 1, 10, "");
      expect(res.configured).toBe(false);
      expect(res.photos).toEqual([]);
      expect(res.total).toBe(0);
    });

    it("simplifyQuery extracts 2-3 main nouns from detailed queries", async () => {
      const { simplifyQuery } = await import("../stock-photos.js");
      expect(simplifyQuery("florist boutique interior flowers")).toBe("florist boutique flowers");
      expect(simplifyQuery("modern aesthetic background for artisan bakery")).toBe("artisan bakery");
      expect(simplifyQuery("clean minimalist luxury dining restaurant")).toBe("luxury dining restaurant");
    });
  });
});
