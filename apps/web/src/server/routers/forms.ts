import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { schema } from "@builder/db";
import { router, siteProcedure, requireRole } from "../trpc";

export const formsRouter = router({
  /**
   * List form submissions for a site.
   */
  listSubmissions: siteProcedure
    .input(
      z.object({
        formId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(schema.formSubmissions.siteId, ctx.site.id)];

      if (input.formId) {
        conditions.push(eq(schema.formSubmissions.formId, input.formId));
      }

      const submissions = await ctx.db
        .select()
        .from(schema.formSubmissions)
        .where(and(...conditions))
        .orderBy(desc(schema.formSubmissions.createdAt))
        .limit(input.limit);

      return submissions;
    }),

  /**
   * Delete a form submission.
   */
  deleteSubmission: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        submissionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(schema.formSubmissions)
        .where(
          and(
            eq(schema.formSubmissions.id, input.submissionId),
            eq(schema.formSubmissions.siteId, ctx.site.id)
          )
        );

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Form submission not found",
        });
      }

      await ctx.db
        .delete(schema.formSubmissions)
        .where(eq(schema.formSubmissions.id, input.submissionId));

      return { success: true };
    }),
});
