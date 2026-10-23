import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { schema, saveSiteDocument, ensureYjsStateMatchesSnapshot } from "@builder/db";
import { enqueueJob } from "@builder/jobs";
import {
  createBlankDocument,
  type SiteDocument,
  migrateDocument,
  repairLegacyHomeSlugs,
} from "@builder/document";
import { TRPCError } from "@trpc/server";
import { isAiConfigured, importFromScreenshot } from "@builder/ai";
import { fillSiteStockPhotos } from "@builder/storage";
import {
  router,
  workspaceProcedure,
  siteProcedure,
  requireRole,
  requirePlanLimit,
} from "../trpc";

export const sitesRouter = router({
  /**
   * List all sites for a workspace.
   */
  list: workspaceProcedure
    .input(
      z.object({
        includeTrash: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(schema.sites.workspaceId, ctx.workspace.id)];
      if (!input.includeTrash) {
        conditions.push(isNull(schema.sites.deletedAt));
      }

      const siteRows = await ctx.db
        .select({
          site: schema.sites,
          doc: schema.siteDocuments.snapshot,
        })
        .from(schema.sites)
        .leftJoin(schema.siteDocuments, eq(schema.siteDocuments.siteId, schema.sites.id))
        .where(and(...conditions));

      return siteRows.map(({ site, doc }) => {
        let previewImage: string | null = null;
        let previewHeading: string | null = null;
        if (doc && (doc as any).elements) {
          const elements = Object.values((doc as any).elements) as any[];
          const imgEl = elements.find((el) => el.type === "Image" && el.props?.src);
          if (imgEl?.props?.src) {
            previewImage = imgEl.props.src;
          } else if ((doc as any).assets) {
            const asset = Object.values((doc as any).assets).find((a: any) => a.url);
            if (asset && (asset as any).url) previewImage = (asset as any).url;
          }
          const headingEl = elements.find((el) => el.type === "Heading" && el.props?.text);
          if (headingEl?.props?.text) {
            previewHeading = String(headingEl.props.text);
          }
        }
        return {
          ...site,
          previewImage,
          previewHeading,
        };
      });
    }),

  /**
   * Get single site by ID along with its document snapshot and Yjs state.
   */
  get: siteProcedure.query(async ({ ctx }) => {
    const [doc] = await ctx.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, ctx.site.id));

    let finalDoc = doc?.snapshot ?? null;
    let yjsBase64: string | null = null;
    if (doc?.snapshot) {
      finalDoc = migrateDocument(doc.snapshot);
      const slugRepaired = repairLegacyHomeSlugs(finalDoc);
      if (slugRepaired || doc.schemaVersion !== finalDoc.schemaVersion) {
        await saveSiteDocument(ctx.db, {
          siteId: ctx.site.id,
          document: finalDoc,
        });
      }

      const yjsBuffer = await ensureYjsStateMatchesSnapshot(
        ctx.db,
        ctx.site.id,
        finalDoc,
        doc.yjsState
      );
      yjsBase64 = yjsBuffer ? Buffer.from(yjsBuffer).toString("base64") : null;
    }

    return {
      site: ctx.site,
      document: finalDoc,
      yjsState: yjsBase64,
      schemaVersion: finalDoc?.schemaVersion ?? doc?.schemaVersion ?? 1,
      role: ctx.role,
    };
  }),

  /**
   * Create a new site with initial blank document and Yjs state.
   */
  create: workspaceProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        name: z.string().min(1, "Site name cannot be empty").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const siteId = `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32) || "site";

      // 1. Insert site record
      const [newSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: siteId,
          workspaceId: ctx.workspace.id,
          name: input.name,
          slug,
        })
        .returning();

      // 2. Insert initial blank site document with matching binary Yjs state via saveSiteDocument
      const blankDoc = createBlankDocument(input.name);
      await saveSiteDocument(ctx.db, {
        siteId,
        document: blankDoc,
      });

      return newSite;
    }),

  /**
   * Import site from a URL.
   * Requirement E3:
   * - Rights confirmation recorded in audit_log.
   * - Enqueues background worker job import:url.
   */
  importUrl: workspaceProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        url: z.string().url("Must be a valid URL"),
        rightsConfirmed: z.boolean().refine((val) => val === true, {
          message: "You must confirm you have the right to copy this design and its assets",
        }),
        siteName: z.string().optional(),
        allowLocal: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const siteId = `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      let parsedHostname = "website";
      try {
        parsedHostname = new URL(input.url).hostname;
      } catch {}
      const name = input.siteName || `Imported ${parsedHostname}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32) || "site";

      // 1. Record confirmation in audit_log
      await ctx.db.insert(schema.auditLog).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        workspaceId: ctx.workspace.id,
        actor: ctx.user.id,
        action: "site.import_url",
        target: siteId,
        data: {
          url: input.url,
          rightsConfirmed: true,
        },
      });

      // 2. Create target site row
      const [newSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: siteId,
          workspaceId: ctx.workspace.id,
          name,
          slug,
        })
        .returning();

      // 3. Initialize blank document before worker populates it
      const blankDoc = createBlankDocument(name);
      await saveSiteDocument(ctx.db, {
        siteId,
        document: blankDoc,
      });

      // 4. Enqueue background import job
      const job = await enqueueJob({
        workspaceId: ctx.workspace.id,
        type: "import:url",
        input: {
          siteId,
          siteName: name,
          url: input.url,
          allowLocal: input.allowLocal,
        },
      });

      return {
        site: newSite,
        jobId: job.job.id,
      };
    }),

  /**
   * Rename a site.
   */
  rename: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        name: z.string().min(1, "Site name cannot be empty").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(schema.sites)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(schema.sites.id, ctx.site.id))
        .returning();

      // Also update document title in snapshot & yjsState
      const [doc] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (doc?.snapshot) {
        const updatedSnapshot: SiteDocument = {
          ...doc.snapshot,
          site: { ...doc.snapshot.site, name: input.name },
        };
        await saveSiteDocument(ctx.db, {
          siteId: ctx.site.id,
          document: updatedSnapshot,
        });
      }

      return updated;
    }),

  /**
   * Duplicate a site.
   * Creates a clone of the site and its document tree with new IDs.
   */
  duplicate: siteProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        newName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const newSiteId = `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const cloneName = input.newName || `${ctx.site.name} (Copy)`;
      const cloneSlug = `${ctx.site.slug || "site"}-copy`;

      // 1. Insert new cloned site
      const [clonedSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: newSiteId,
          workspaceId: ctx.workspace.id,
          name: cloneName,
          slug: cloneSlug,
          thumbnail: ctx.site.thumbnail,
        })
        .returning();

      // 2. Fetch original document
      const [originalDoc] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      const snapshotToClone: SiteDocument = originalDoc?.snapshot
        ? {
            ...originalDoc.snapshot,
            site: { ...originalDoc.snapshot.site, name: cloneName },
          }
        : createBlankDocument(cloneName);

      // 3. Save new cloned document with matching Yjs state
      await saveSiteDocument(ctx.db, {
        siteId: newSiteId,
        document: snapshotToClone,
      });

      return clonedSite;
    }),

  /**
   * Move site to trash (soft delete).
   */
  trash: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      const [trashed] = await ctx.db
        .update(schema.sites)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.sites.id, ctx.site.id))
        .returning();

      return trashed;
    }),

  /**
   * Restore a site from trash.
   */
  restore: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      const [restored] = await ctx.db
        .update(schema.sites)
        .set({
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.sites.id, ctx.site.id))
        .returning();

      return restored;
    }),

  /**
   * Permanently delete a site (hard delete, requires ADMIN or OWNER).
   */
  deleteForever: siteProcedure
    .use(requireRole("ADMIN"))
    .mutation(async ({ ctx }) => {
      await ctx.db
        .delete(schema.sites)
        .where(eq(schema.sites.id, ctx.site.id));

      return { success: true, deletedId: ctx.site.id };
    }),

  /**
   * Check if a vision-capable AI provider is configured in environment.
   */
  checkVisionConfigured: workspaceProcedure.query(() => {
    return { configured: isAiConfigured("vision") };
  }),

  /**
   * Import a site from screenshot(s) using a vision-capable AI provider.
   * Section G
   */
  importScreenshot: workspaceProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        desktopScreenshot: z.string().min(1, "Desktop screenshot is required"),
        mobileScreenshot: z.string().optional(),
        siteName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured("vision")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No vision-capable AI provider is configured. Configure an AI provider with vision enabled (AI_PROVIDER_<NAME>_VISION=true or set AI_MODEL_CHAIN_VISION in .env).",
        });
      }

      const siteId = `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const name = input.siteName?.trim() || "Screenshot Import";
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32) || "site";

      // 1. Run vision pipeline
      const { document, report } = await importFromScreenshot({
        desktopScreenshot: input.desktopScreenshot,
        mobileScreenshot: input.mobileScreenshot,
        siteName: name,
      });

      // 2. Audit log
      await ctx.db.insert(schema.auditLog).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        workspaceId: ctx.workspace.id,
        actor: ctx.user.id,
        action: "site.import_screenshot",
        target: siteId,
        data: {
          imported: report.imported,
          approximated: report.approximated,
          hasMobile: Boolean(input.mobileScreenshot),
        },
      });

      // 3. Create site row
      const [newSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: siteId,
          workspaceId: ctx.workspace.id,
          name,
          slug,
        })
        .returning();

      // 4. Save site document (snapshot + matching yjs_state in one transaction)
      await saveSiteDocument(ctx.db, {
        siteId,
        document,
      });

      return {
        site: newSite,
        report,
      };
    }),

  /**
   * Fill empty image slots with stock photos from Unsplash.
   */
  fillStockPhotos: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      const [docRow] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (!docRow?.snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site document snapshot not found",
        });
      }

      const doc = docRow.snapshot as SiteDocument;
      const filledResult = await fillSiteStockPhotos({
        doc,
        workspaceId: ctx.site.workspaceId,
        siteId: ctx.site.id,
      });

      await saveSiteDocument(ctx.db, {
        siteId: ctx.site.id,
        document: doc,
      });

      return {
        filled: filledResult.filledCount,
        errors: filledResult.failedCount,
        rateLimited: false,
      };
    }),
});
