import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { schema } from "@builder/db";
import { enqueueJob } from "@builder/jobs";
import {
  createUpload,
  confirmUpload,
  getAssetUrl,
  isStorageConfigured,
  getActiveStorageProvider,
  searchUnsplashPhotos,
} from "@builder/storage";
import { router, workspaceProcedure, requireRole } from "../trpc";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const assetsRouter = router({
  /**
   * Reports storage configuration status and active provider.
   */
  status: workspaceProcedure.query(() => {
    return {
      configured: isStorageConfigured(),
      provider: getActiveStorageProvider(),
    };
  }),

  /**
   * Generates upload instructions (presigned S3 PUT or signed Cloudinary POST)
   * for direct browser-to-storage upload.
   */
  presign: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        filename: z.string().min(1),
        mimeType: z.string().refine((m) => ALLOWED_MIME_TYPES.includes(m), {
          message: "Unsupported file type. Only JPEG, PNG, WebP, GIF, and SVG are allowed.",
        }),
        size: z.number().max(MAX_FILE_SIZE_BYTES, "Maximum file size is 25MB"),
        siteId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Storage is not configured — add STORAGE_PROVIDER (s3 or cloudinary) to .env",
        });
      }

      const uploadDesc = await createUpload({
        workspaceId: ctx.workspace.id,
        filename: input.filename,
        mimeType: input.mimeType,
        fileSize: input.size,
      });

      const assetId = `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      // Register asset record with status "pending"
      const [asset] = await ctx.db
        .insert(schema.assets)
        .values({
          id: assetId,
          workspaceId: ctx.workspace.id,
          siteId: input.siteId ?? null,
          key: uploadDesc.key,
          type: input.mimeType,
          size: input.size,
          provider: uploadDesc.provider,
          providerFileId: uploadDesc.providerFileId,
          status: "pending",
        })
        .returning();

      return {
        asset,
        upload: uploadDesc,
        uploadUrl: uploadDesc.url,
        publicUrl: uploadDesc.publicUrl,
        configured: true,
      };
    }),

  /**
   * Confirms upload completion: verifies the file actually exists at the provider
   * before marking the asset row as "ready".
   */
  confirm: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        assetId: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Storage is not configured — add STORAGE_PROVIDER (s3 or cloudinary) to .env",
        });
      }

      const [asset] = await ctx.db
        .select()
        .from(schema.assets)
        .where(
          and(
            eq(schema.assets.id, input.assetId),
            eq(schema.assets.workspaceId, ctx.workspace.id)
          )
        );

      if (!asset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Asset not found in workspace",
        });
      }

      // Verify file presence at the storage provider
      const verification = await confirmUpload({
        key: asset.key,
        providerFileId: asset.providerFileId || asset.key,
        provider: (asset.provider as "s3" | "cloudinary") || "s3",
      });

      if (!verification.exists) {
        // Purge pending unverified row so no phantom records exist
        await ctx.db.delete(schema.assets).where(eq(schema.assets.id, asset.id));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File was not found at storage provider. Upload may have failed or expired.",
        });
      }

      // Update asset record to ready state with actual dimensions
      const finalWidth = verification.width ?? input.width ?? null;
      const finalHeight = verification.height ?? input.height ?? null;

      const [updatedAsset] = await ctx.db
        .update(schema.assets)
        .set({
          status: "ready",
          width: finalWidth,
          height: finalHeight,
        })
        .where(eq(schema.assets.id, asset.id))
        .returning();

      let jobId: string | undefined = undefined;

      // S3 uses worker for metadata & sharp jobs; Cloudinary handles transforms on CDN
      if (asset.provider === "s3") {
        const { job } = await enqueueJob({
          workspaceId: ctx.workspace.id,
          type: "media:process-image",
          input: {
            assetId: asset.id,
            key: asset.key,
            width: finalWidth ?? 1920,
            height: finalHeight ?? 1080,
          },
        });
        jobId = job.id;
      }

      return {
        success: true,
        asset: updatedAsset,
        jobId,
      };
    }),

  /**
   * Lists verified assets for workspace/site. Only "ready" assets are returned.
   */
  list: workspaceProcedure
    .input(
      z.object({
        siteId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        return [];
      }

      const conditions = [
        eq(schema.assets.workspaceId, ctx.workspace.id),
        eq(schema.assets.status, "ready"),
      ];
      if (input.siteId) {
        conditions.push(eq(schema.assets.siteId, input.siteId));
      }

      const items = await ctx.db
        .select()
        .from(schema.assets)
        .where(and(...conditions))
        .orderBy(desc(schema.assets.createdAt))
        .limit(100);

      return items.map((ast) => ({
        ...ast,
        publicUrl: getAssetUrl({
          key: ast.key,
          provider: ast.provider,
          providerFileId: ast.providerFileId,
        }),
      }));
    }),

  /**
   * Search stock photos on Unsplash.
   */
  searchUnsplash: workspaceProcedure
    .input(
      z.object({
        query: z.string().min(1),
        page: z.number().default(1),
        perPage: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      return searchUnsplashPhotos(input.query, input.page, input.perPage);
    }),

  /**
   * Delete an asset from storage and database.
   */
  delete: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [asset] = await ctx.db
        .select()
        .from(schema.assets)
        .where(
          and(
            eq(schema.assets.id, input.assetId),
            eq(schema.assets.workspaceId, ctx.workspace.id)
          )
        );

      if (!asset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Asset not found in workspace",
        });
      }

      const { deleteAsset } = await import("@builder/storage");
      await deleteAsset({
        key: asset.key,
        provider: (asset.provider as "s3" | "cloudinary") || undefined,
        providerFileId: asset.providerFileId ?? undefined,
      });

      await ctx.db.delete(schema.assets).where(eq(schema.assets.id, asset.id));

      return { success: true };
    }),
});
