import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { schema } from "@builder/db";
import { enqueueJob, cancelJob, retryJob } from "@builder/jobs";
import {
  router,
  protectedProcedure,
  workspaceProcedure,
  requireRole,
} from "../trpc";

export const jobsRouter = router({
  /**
   * Get job status and output.
   */
  get: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId));

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found.",
        });
      }

      // Verify user has access to job's workspace
      const [membership] = await ctx.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, job.workspaceId),
            eq(schema.workspaceMembers.userId, ctx.user.id)
          )
        );

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this job.",
        });
      }

      return job;
    }),

  /**
   * Cancel a running or queued job.
   */
  cancel: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId));

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
      }

      const [membership] = await ctx.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, job.workspaceId),
            eq(schema.workspaceMembers.userId, ctx.user.id)
          )
        );

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized." });
      }

      const success = await cancelJob(input.jobId);
      return { success };
    }),

  /**
   * Retry a failed or cancelled job.
   */
  retry: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId));

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
      }

      const [membership] = await ctx.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, job.workspaceId),
            eq(schema.workspaceMembers.userId, ctx.user.id)
          )
        );

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized." });
      }

      const success = await retryJob(input.jobId);
      return { success };
    }),

  /**
   * Create a dummy slow test job (Milestone M4 acceptance test).
   */
  createDummy: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        steps: z.number().int().min(1).max(50).optional().default(10),
        stepDelayMs: z.number().int().min(10).max(5000).optional().default(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (process.env.NODE_ENV === "production") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "createDummy is a development and testing procedure only.",
        });
      }

      const result = await enqueueJob({
        workspaceId: ctx.workspace.id,
        type: "dummy-slow",
        input: {
          steps: input.steps,
          stepDelayMs: input.stepDelayMs,
        },
      });

      return result.job;
    }),
});
