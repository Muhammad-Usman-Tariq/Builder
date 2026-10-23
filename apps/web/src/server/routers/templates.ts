import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { schema, saveSiteDocument } from "@builder/db";
import { instantiateTemplateDocument } from "@builder/document";
import { TEMPLATES, getTemplateById, getTemplateBySlug, getTemplatesByCategory } from "@builder/templates";
import {
  router,
  publicProcedure,
  workspaceProcedure,
  requireRole,
  requirePlanLimit,
} from "../trpc";

export const templatesRouter = router({
  /**
   * List all available certified templates with optional category filtering.
   */
  list: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const category = input?.category;
      const list = category ? getTemplatesByCategory(category) : TEMPLATES;

      return list.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        description: t.description,
        tags: t.tags,
        preview: t.preview,
        pageCount: t.pageCount,
        style: t.style,
      }));
    }),

  /**
   * Retrieve full template definition by slug or ID, including the SiteDocument for live canvas preview.
   */
  get: publicProcedure
    .input(
      z.object({
        slugOrId: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const template =
        getTemplateById(input.slugOrId) ||
        getTemplateBySlug(input.slugOrId) ||
        TEMPLATES.find((t) => t.id === input.slugOrId || t.slug === input.slugOrId);

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Template "${input.slugOrId}" not found.`,
        });
      }

      return template;
    }),

  /**
   * Create a new site from a certified template with fresh unique IDs and brand tokens applied.
   * Enforces role and plan limits.
   */
  createSiteFromTemplate: workspaceProcedure
    .use(requireRole("MEMBER"))
    .use(requirePlanLimit("sites"))
    .input(
      z.object({
        templateSlugOrId: z.string().min(1),
        name: z.string().min(1, "Site name cannot be empty").max(100),
        brandTokens: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template =
        getTemplateById(input.templateSlugOrId) ||
        getTemplateBySlug(input.templateSlugOrId) ||
        TEMPLATES.find((t) => t.id === input.templateSlugOrId || t.slug === input.templateSlugOrId);

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Template "${input.templateSlugOrId}" not found.`,
        });
      }

      // Clone and instantiate template with new IDs
      const newDoc = instantiateTemplateDocument(template.document, {
        siteName: input.name,
        brandTokens: input.brandTokens as any,
        origin: "template",
      });

      const siteId = `site_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const slug =
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 32) || "site";

      // 1. Create site record
      const [newSite] = await ctx.db
        .insert(schema.sites)
        .values({
          id: siteId,
          workspaceId: ctx.workspace.id,
          name: input.name,
          slug,
        })
        .returning();

      // 2. Save document record and initial version via canonical saveSiteDocument
      await saveSiteDocument(ctx.db, {
        siteId,
        document: newDoc,
        createVersion: true,
        versionReason: "template",
        userId: ctx.user.id,
      });

      return {
        site: newSite,
        siteId,
      };
    }),
});
