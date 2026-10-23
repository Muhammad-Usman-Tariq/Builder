import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { schema } from "@builder/db";
import { enqueueJob } from "@builder/jobs";
import { isAiConfigured, rewriteText, convertMcpToolsToAiTools } from "@builder/ai";
import { callRemoteMcpHttp } from "@builder/mcp";
import { decryptSecret } from "@builder/publish";
import { router, workspaceProcedure, requireRole } from "../trpc";

const FREE_MONTHLY_AI_QUOTA = 100;

export const aiRouter = router({
  /**
   * Reports AI configuration status.
   */
  status: workspaceProcedure.query(() => {
    return { configured: isAiConfigured("default") };
  }),

  /**
   * Enqueues full site generation job.
   */
  generateSite: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        siteId: z.string(),
        prompt: z.string().min(3, "Prompt must be at least 3 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured("default")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env",
        });
      }

      // 1. Verify site belongs to workspace
      const [site] = await ctx.db
        .select()
        .from(schema.sites)
        .where(
          and(
            eq(schema.sites.id, input.siteId),
            eq(schema.sites.workspaceId, ctx.workspace.id)
          )
        );

      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found in this workspace",
        });
      }

      // 2. Check quota (used + reserved)
      const currentPeriod = new Date().toISOString().slice(0, 7);
      const [counter] = await ctx.db
        .select()
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.workspaceId, ctx.workspace.id),
            eq(schema.usageCounters.metric, "ai_units"),
            eq(schema.usageCounters.period, currentPeriod)
          )
        );

      const committed = (counter?.used ?? 0) + (counter?.reserved ?? 0);
      const quotaLimit = ctx.workspace.plan === "free" ? FREE_MONTHLY_AI_QUOTA : 1000;
      if (committed + 10 > quotaLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Monthly AI unit quota exceeded (100 units/mo on Free plan).",
        });
      }

      // Reserve units before job enqueue
      const { reserveUsage } = await import("@builder/db");
      await reserveUsage(ctx.db, {
        workspaceId: ctx.workspace.id,
        metric: "ai_units",
        units: 10,
        period: currentPeriod,
      });

      // 3. Enqueue background generation job
      const { job } = await enqueueJob({
        workspaceId: ctx.workspace.id,
        type: "ai:generate-site",
        input: {
          siteId: input.siteId,
          prompt: input.prompt,
          userId: ctx.user.id,
          reservedUnits: 10,
        },
      });

      return {
        success: true,
        jobId: job.id,
      };
    }),

  /**
   * Enqueues section regeneration job.
   */
  regenerateSection: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        siteId: z.string(),
        pageId: z.string(),
        sectionId: z.string(),
        prompt: z.string().min(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured("sections")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env",
        });
      }

      // 1. Verify section is not AI locked
      const [docRow] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, input.siteId));

      if (docRow?.snapshot) {
        const currentDoc = docRow.snapshot as {
          elements?: Record<string, { aiLocked?: boolean }>;
        };
        const section = currentDoc.elements?.[input.sectionId];
        if (section?.aiLocked) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This section is AI-locked and cannot be modified.",
          });
        }
      }

      // 2. Check quota and reserve units
      const currentPeriod = new Date().toISOString().slice(0, 7);
      const [counter] = await ctx.db
        .select()
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.workspaceId, ctx.workspace.id),
            eq(schema.usageCounters.metric, "ai_units"),
            eq(schema.usageCounters.period, currentPeriod)
          )
        );

      const committed = (counter?.used ?? 0) + (counter?.reserved ?? 0);
      const quotaLimit = ctx.workspace.plan === "free" ? FREE_MONTHLY_AI_QUOTA : 1000;
      if (committed + 2 > quotaLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Monthly AI unit quota exceeded.",
        });
      }

      const { reserveUsage } = await import("@builder/db");
      await reserveUsage(ctx.db, {
        workspaceId: ctx.workspace.id,
        metric: "ai_units",
        units: 2,
        period: currentPeriod,
      });

      const { job } = await enqueueJob({
        workspaceId: ctx.workspace.id,
        type: "ai:regenerate-section",
        input: {
          siteId: input.siteId,
          pageId: input.pageId,
          sectionId: input.sectionId,
          prompt: input.prompt,
          reservedUnits: 2,
        },
      });

      return {
        success: true,
        jobId: job.id,
      };
    }),

  /**
   * Synchronous text rewrite endpoint.
   */
  rewriteText: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        text: z.string().min(1),
        instruction: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured("text")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env",
        });
      }

      const currentPeriod = new Date().toISOString().slice(0, 7);
      const [counter] = await ctx.db
        .select()
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.workspaceId, ctx.workspace.id),
            eq(schema.usageCounters.metric, "ai_units"),
            eq(schema.usageCounters.period, currentPeriod)
          )
        );

      const committed = (counter?.used ?? 0) + (counter?.reserved ?? 0);
      const quotaLimit = ctx.workspace.plan === "free" ? FREE_MONTHLY_AI_QUOTA : 1000;
      if (committed + 1 > quotaLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Monthly AI unit quota exceeded.",
        });
      }

      const { reserveUsage, commitUsage, releaseUsage } = await import("@builder/db");
      await reserveUsage(ctx.db, {
        workspaceId: ctx.workspace.id,
        metric: "ai_units",
        units: 1,
        period: currentPeriod,
      });

      try {
        const rewritten = await rewriteText(input.text, input.instruction);
        await commitUsage(ctx.db, {
          workspaceId: ctx.workspace.id,
          metric: "ai_units",
          reservedUnits: 1,
          usedUnits: 1,
          period: currentPeriod,
        });

        return {
          text: rewritten,
          configured: true,
        };
      } catch (err) {
        await releaseUsage(ctx.db, {
          workspaceId: ctx.workspace.id,
          metric: "ai_units",
          units: 1,
          period: currentPeriod,
        });
        throw err;
      }
    }),

  /**
   * Retrieves workspace AI unit quota usage.
   */
  getQuota: workspaceProcedure.query(async ({ ctx }) => {
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const [counter] = await ctx.db
      .select()
      .from(schema.usageCounters)
      .where(
        and(
          eq(schema.usageCounters.workspaceId, ctx.workspace.id),
          eq(schema.usageCounters.metric, "ai_units"),
          eq(schema.usageCounters.period, currentPeriod)
        )
      );

    return {
      used: counter?.used ?? 0,
      reserved: counter?.reserved ?? 0,
      limit: ctx.workspace.plan === "free" ? FREE_MONTHLY_AI_QUOTA : 1000,
      period: currentPeriod,
      plan: ctx.workspace.plan,
    };
  }),

  /**
   * List external MCP tools connected to this workspace.
   */
  listExternalMcpTools: workspaceProcedure.query(async ({ ctx }) => {
    const [integration] = await ctx.db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "mcp"),
          eq(schema.integrations.status, "active")
        )
      );

    if (!integration) {
      return { configured: false, tools: [] as Array<{ name: string; description?: string }> };
    }

    const scopes =
      (integration.scopes as {
        url?: string;
        tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
      }) || {};

    return {
      configured: true,
      url: scopes.url || "",
      tools: scopes.tools || [],
    };
  }),

  /**
   * Copilot chat / execution wiring in external MCP tools via convertMcpToolsToAiTools.
   */
  copilotChat: workspaceProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        prompt: z.string().min(1),
        selectedElementId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured("default")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env",
        });
      }

      // 1. Fetch any configured MCP integration
      const [integration] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "mcp"),
            eq(schema.integrations.status, "active")
          )
        );

      let externalAiTools: Record<string, unknown> = {};
      if (integration) {
        const scopes =
          (integration.scopes as {
            url?: string;
            tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
          }) || {};
        const toolsList = scopes.tools || [];
        const token =
          integration.encryptedTokens && integration.encryptedTokens !== "none"
            ? decryptSecret(integration.encryptedTokens)
            : undefined;

        if (toolsList.length > 0 && scopes.url) {
          externalAiTools = convertMcpToolsToAiTools(toolsList, async (toolName, params) => {
            return await callRemoteMcpHttp(scopes.url!, token, "tools/call", {
              name: toolName,
              arguments: params,
            });
          });
        }
      }

      // Execute AI copilot text assist
      const reply = await rewriteText(
        input.prompt,
        `Act as an expert AI web designer copilot. Tools available: ${Object.keys(externalAiTools).join(", ") || "none"}`
      );

      return {
        reply,
        toolsLoaded: Object.keys(externalAiTools).length,
      };
    }),
});
