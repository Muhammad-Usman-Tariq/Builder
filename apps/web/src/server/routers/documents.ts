import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { schema, saveSiteDocument, ensureYjsStateMatchesSnapshot } from "@builder/db";
import {
  siteDocumentSchema,
  migrateDocument,
  repairLegacyHomeSlugs,
  type SiteDocument,
} from "@builder/document";
import {
  router,
  siteProcedure,
  requireRole,
} from "../trpc";

export const documentsRouter = router({
  /**
   * Get the current site document and Yjs state.
   */
  get: siteProcedure.query(async ({ ctx }) => {
    const [doc] = await ctx.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, ctx.site.id));

    if (!doc) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Site document not found.",
      });
    }

    const migrated = migrateDocument(doc.snapshot);
    const slugRepaired = repairLegacyHomeSlugs(migrated);
    if (slugRepaired || doc.schemaVersion !== migrated.schemaVersion) {
      await saveSiteDocument(ctx.db, {
        siteId: ctx.site.id,
        document: migrated,
      });
    }

    const yjsBuffer = await ensureYjsStateMatchesSnapshot(
      ctx.db,
      ctx.site.id,
      migrated,
      doc.yjsState
    );

    return {
      document: migrated,
      yjsState: yjsBuffer ? Buffer.from(yjsBuffer).toString("base64") : null,
      schemaVersion: migrated.schemaVersion,
      updatedAt: doc.updatedAt,
    };
  }),

  /**
   * Save an updated site document snapshot and binary Yjs state.
   * Architecture Section 7.5:
   * "The JSON snapshot is validated on the server; an invalid change is rejected and the editor shows an error."
   */
  save: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        document: siteDocumentSchema,
        yjsUpdate: z.string().optional(), // base64-encoded Yjs binary update
        createVersion: z.boolean().optional().default(false),
        versionReason: z.string().optional().default("manual"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await saveSiteDocument(ctx.db, {
          siteId: ctx.site.id,
          document: input.document as SiteDocument,
          yjsUpdate: input.yjsUpdate,
          createVersion: input.createVersion,
          versionReason: input.versionReason,
          userId: ctx.user?.id,
        });

        return {
          success: true,
          updatedAt: result.updatedAt,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errMsg,
        });
      }
    }),
});
