import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { schema, saveSiteDocument } from "@builder/db";
import { encryptSecret, decryptSecret } from "@builder/publish";
import {
  fetchFigmaFile,
  listFigmaFrames,
  convertFigmaFrameToDocument,
  extractFigmaFileKey,
  collectVectorNodeIds,
  batchExportFigmaVectors,
} from "@builder/importers/figma";
import { router, workspaceProcedure, requireRole, requirePlanLimit } from "../trpc";

export const integrationsRouter = router({
  /**
   * Get Figma integration status for the current workspace.
   */
  getFigma: workspaceProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: schema.integrations.id,
        status: schema.integrations.status,
        updatedAt: schema.integrations.updatedAt,
      })
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "figma"),
          eq(schema.integrations.status, "active")
        )
      );

    return {
      connected: !!row,
      integration: row || null,
    };
  }),

  /**
   * Save / connect Figma Personal Access Token (PAT) stored encrypted.
   */
  connectFigma: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        token: z.string().min(1, "Figma Personal Access Token is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Encrypt token using AES-256-GCM
      const encryptedTokens = encryptSecret(input.token.trim());

      // 2. Upsert integration record
      const [existing] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "figma")
          )
        );

      if (existing) {
        const [updated] = await ctx.db
          .update(schema.integrations)
          .set({
            encryptedTokens,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(schema.integrations.id, existing.id))
          .returning();

        return { success: true, integration: updated };
      }

      const id = `int_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const [created] = await ctx.db
        .insert(schema.integrations)
        .values({
          id,
          workspaceId: ctx.workspace.id,
          provider: "figma",
          encryptedTokens,
          status: "active",
        })
        .returning();

      return { success: true, integration: created };
    }),

  /**
   * Disconnect Figma integration.
   */
  disconnectFigma: workspaceProcedure
    .use(requireRole("ADMIN"))
    .mutation(async ({ ctx }) => {
      await ctx.db
        .delete(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "figma")
          )
        );

      return { success: true };
    }),

  /**
   * List top-level frames in a Figma file for frame picker.
   */
  listFigmaFrames: workspaceProcedure
    .input(
      z.object({
        urlOrKey: z.string().min(1, "Figma file URL or key is required"),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1. Get decrypted PAT
      const [integration] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "figma"),
            eq(schema.integrations.status, "active")
          )
        );

      if (!integration) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Figma is not connected. Please add your Figma Personal Access Token in Settings.",
        });
      }

      const token = decryptSecret(integration.encryptedTokens);
      const fileKey = extractFigmaFileKey(input.urlOrKey);

      try {
        const fileJson = await fetchFigmaFile(fileKey, token);
        const frames = listFigmaFrames(fileJson);
        return {
          fileName: fileJson?.name || "Figma File",
          frames,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "Failed to fetch Figma file",
        });
      }
    }),

  /**
   * Import a single picked Figma frame into a new Site.
   */
  importFigmaFrame: workspaceProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        urlOrKey: z.string().min(1),
        frameId: z.string().min(1),
        siteName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get decrypted PAT
      const [integration] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "figma"),
            eq(schema.integrations.status, "active")
          )
        );

      if (!integration) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Figma is not connected. Please add your Figma Personal Access Token in Settings.",
        });
      }

      const token = decryptSecret(integration.encryptedTokens);
      const fileKey = extractFigmaFileKey(input.urlOrKey);

      // 2. Fetch file (uses session cache)
      const fileJson = await fetchFigmaFile(fileKey, token);

      // 3. Find the target frame in the file JSON
      let targetFrame: any = null;
      function findFrame(node: any) {
        if (!node) return;
        if (node.id === input.frameId) {
          targetFrame = node;
          return;
        }
        if (node.children) {
          for (const ch of node.children) {
            findFrame(ch);
            if (targetFrame) return;
          }
        }
      }
      findFrame(fileJson?.document);

      if (!targetFrame) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Frame with ID "${input.frameId}" not found in Figma file.`,
        });
      }

      // 4. Batch export vector/icon nodes in ONE request to save rate limits
      let imageMap: Record<string, string> = {};
      try {
        const vectorIds = collectVectorNodeIds(targetFrame);
        if (vectorIds.length > 0) {
          imageMap = await batchExportFigmaVectors(fileKey, token, vectorIds);
        }
      } catch (err) {
        console.warn("Figma vector batch export error:", err);
      }

      // 5. Convert frame to SiteDocument
      const name = input.siteName || targetFrame.name || "Figma Imported Site";
      const { document: doc, report } = convertFigmaFrameToDocument(targetFrame, {
        siteName: name,
        imageMap,
        fileKey,
        token,
      });

      // 6. Create new Site record in DB
      const siteId = `site_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32) || "site";

      const [newSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: siteId,
          workspaceId: ctx.workspace.id,
          name,
          slug,
        })
        .returning();

      // 6. Save site document snapshot & yjs state using canonical saveSiteDocument
      await saveSiteDocument(ctx.db, {
        siteId,
        document: doc,
        createVersion: true,
        versionReason: `Imported from Figma frame "${targetFrame.name}"`,
        userId: ctx.user.id,
      });

      return {
        site: newSite,
        report,
      };
    }),
});
