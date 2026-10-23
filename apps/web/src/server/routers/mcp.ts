import { z } from "zod";
import { and, desc, eq, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { schema } from "@builder/db";
import { hashToken, handleCreateSection, recordMcpAudit } from "@builder/mcp";
import { encryptSecret } from "@builder/publish";
import { router, workspaceProcedure, requireRole } from "../trpc";

export const mcpRouter = router({
  /**
   * List all MCP API keys for this workspace.
   * Returns only safe metadata (prefix, permission, timestamps) - NEVER the raw key or hash.
   */
  listApiKeys: workspaceProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        prefix: schema.apiKeys.prefix,
        permission: schema.apiKeys.permission,
        createdAt: schema.apiKeys.createdAt,
        lastUsedAt: schema.apiKeys.lastUsedAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.workspaceId, ctx.workspace.id))
      .orderBy(desc(schema.apiKeys.createdAt));

    return keys.map((k) => ({
      ...k,
      prefix: k.prefix || "bld_…",
      permission: (k.permission as "read-only" | "read-write") || "read-write",
    }));
  }),

  /**
   * Generate a new MCP API key for the workspace.
   * Computes SHA-256 hash, stores only the hash, returns the raw token ONCE.
   */
  createApiKey: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        name: z.string().min(1).default("MCP Token"),
        permission: z.enum(["read-only", "read-write"]).default("read-write"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const keyId = randomUUID();
      const rawToken = `bld_${randomUUID().replace(/-/g, "")}`;
      const prefix = `${rawToken.slice(0, 10)}…`;
      const keyHash = hashToken(rawToken);

      await ctx.db.insert(schema.apiKeys).values({
        id: keyId,
        workspaceId: ctx.workspace.id,
        key: keyHash, // Never store the raw token in plaintext
        keyHash: keyHash,
        prefix: prefix,
        permission: input.permission,
        name: input.name,
      });

      return {
        id: keyId,
        token: rawToken, // Returned ONCE upon creation
        key: rawToken, // Backward compatible alias
        prefix,
        permission: input.permission,
        name: input.name,
      };
    }),

  /**
   * Revoke/delete an API key.
   */
  revokeApiKey: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        keyId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(schema.apiKeys)
        .where(
          and(
            eq(schema.apiKeys.id, input.keyId),
            eq(schema.apiKeys.workspaceId, ctx.workspace.id)
          )
        );

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found in this workspace",
        });
      }

      await ctx.db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, input.keyId));

      return { success: true };
    }),

  /**
   * List configured external MCP servers.
   */
  listExternalServers: workspaceProcedure.query(async ({ ctx }) => {
    const servers = await ctx.db
      .select({
        id: schema.externalMcpServers.id,
        name: schema.externalMcpServers.name,
        url: schema.externalMcpServers.url,
        encryptedToken: schema.externalMcpServers.encryptedToken,
        createdAt: schema.externalMcpServers.createdAt,
      })
      .from(schema.externalMcpServers)
      .where(eq(schema.externalMcpServers.workspaceId, ctx.workspace.id))
      .orderBy(desc(schema.externalMcpServers.createdAt));

    return servers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      hasToken: !!s.encryptedToken,
      createdAt: s.createdAt,
      tools: [
        { name: "remote_tool_query", description: "Query remote service data" },
        { name: "remote_tool_mutate", description: "Send mutations to remote service" },
      ],
    }));
  }),

  /**
   * Add a new external MCP server.
   */
  addExternalServer: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        url: z.string().url("Must be a valid MCP server URL"),
        token: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const serverId = randomUUID();
      const encryptedToken = input.token ? encryptSecret(input.token) : null;

      await ctx.db.insert(schema.externalMcpServers).values({
        id: serverId,
        workspaceId: ctx.workspace.id,
        name: input.name,
        url: input.url,
        encryptedToken,
      });

      return {
        id: serverId,
        name: input.name,
        url: input.url,
      };
    }),

  /**
   * Remove an external MCP server.
   */
  removeExternalServer: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        serverId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input?.serverId) {
        await ctx.db
          .delete(schema.externalMcpServers)
          .where(
            and(
              eq(schema.externalMcpServers.id, input.serverId),
              eq(schema.externalMcpServers.workspaceId, ctx.workspace.id)
            )
          );
      } else {
        await ctx.db
          .delete(schema.externalMcpServers)
          .where(eq(schema.externalMcpServers.workspaceId, ctx.workspace.id));
      }

      return { success: true };
    }),

  /**
   * Backward-compatible alias: get primary external MCP server.
   */
  getExternalServer: workspaceProcedure.query(async ({ ctx }) => {
    const [server] = await ctx.db
      .select({
        id: schema.externalMcpServers.id,
        name: schema.externalMcpServers.name,
        url: schema.externalMcpServers.url,
        encryptedToken: schema.externalMcpServers.encryptedToken,
        createdAt: schema.externalMcpServers.createdAt,
      })
      .from(schema.externalMcpServers)
      .where(eq(schema.externalMcpServers.workspaceId, ctx.workspace.id))
      .orderBy(desc(schema.externalMcpServers.createdAt));

    if (!server) {
      return { configured: false, server: null };
    }

    return {
      configured: true,
      server: {
        id: server.id,
        url: server.url,
        tools: [
          { name: "remote_tool_query", description: "Query remote service data" },
          { name: "remote_tool_mutate", description: "Send mutations to remote service" },
        ],
        createdAt: server.createdAt,
      },
    };
  }),

  /**
   * Backward-compatible alias: configure external MCP server.
   */
  configureExternalServer: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        url: z.string().url("Must be a valid MCP server URL"),
        token: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const serverId = randomUUID();
      const encryptedToken = input.token ? encryptSecret(input.token) : null;

      const [existing] = await ctx.db
        .select()
        .from(schema.externalMcpServers)
        .where(eq(schema.externalMcpServers.workspaceId, ctx.workspace.id));

      if (existing) {
        await ctx.db
          .update(schema.externalMcpServers)
          .set({
            url: input.url,
            encryptedToken,
            updatedAt: new Date(),
          })
          .where(eq(schema.externalMcpServers.id, existing.id));
      } else {
        await ctx.db.insert(schema.externalMcpServers).values({
          id: serverId,
          workspaceId: ctx.workspace.id,
          name: "External Server",
          url: input.url,
          encryptedToken,
        });
      }

      return {
        success: true,
        url: input.url,
      };
    }),

  /**
   * Test connection to an external MCP server.
   */
  testExternalServer: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        serverId: z.string().optional(),
        url: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let targetUrl = input.url;

      if (!targetUrl && input.serverId) {
        const [server] = await ctx.db
          .select()
          .from(schema.externalMcpServers)
          .where(
            and(
              eq(schema.externalMcpServers.id, input.serverId),
              eq(schema.externalMcpServers.workspaceId, ctx.workspace.id)
            )
          );
        if (server) {
          targetUrl = server.url;
        }
      }

      if (!targetUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No server URL provided for testing",
        });
      }

      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: { Accept: "application/json, text/event-stream" },
          signal: AbortSignal.timeout(4000),
        });

        if (response.ok || response.status === 405 || response.status === 401) {
          return {
            success: true,
            status: response.status,
            message: `Endpoint reachable (HTTP ${response.status})`,
            tools: [
              { name: "remote_tool_query", description: "Query remote service data" },
              { name: "remote_tool_mutate", description: "Send mutations to remote service" },
            ],
          };
        }

        return {
          success: false,
          status: response.status,
          message: `Endpoint returned HTTP ${response.status}`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Connection failed: ${err?.message || "Network error"}`,
        };
      }
    }),

  /**
   * List recent MCP activity from audit_log table.
   */
  listActivity: workspaceProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, ctx.workspace.id),
            or(
              like(schema.auditLog.actor, "mcp:%"),
              like(schema.auditLog.action, "mcp:%")
            )
          )
        )
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Collect all confirmationTokens that were executed or denied in this workspace
      const allActionLogs = await ctx.db
        .select({
          action: schema.auditLog.action,
          data: schema.auditLog.data,
        })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, ctx.workspace.id),
            or(
              like(schema.auditLog.action, "%:executed"),
              like(schema.auditLog.action, "%:denied")
            )
          )
        );

      const resolvedTokens = new Set<string>();
      for (const al of allActionLogs) {
        const d = (al.data as Record<string, any>) || {};
        if (d.confirmationToken) {
          resolvedTokens.add(d.confirmationToken);
        }
      }

      // Fetch key names for actor mapping
      const keys = await ctx.db
        .select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.workspaceId, ctx.workspace.id));

      const keyMap = new Map(keys.map((k) => [k.id, k.name || k.prefix || "MCP Token"]));

      return logs.map((log) => {
        const rawActor = log.actor || "";
        const keyId = rawActor.replace(/^mcp:/, "");
        const tokenName = keyMap.get(keyId) || rawActor || "MCP Client";

        let tool = log.action.replace(/^mcp:/, "");
        let result: "success" | "waiting for confirmation" | "denied" | "error" = "success";

        if (tool.endsWith(":denied")) {
          tool = tool.replace(/:denied$/, "");
          result = "denied";
        } else if (tool.endsWith(":approval_requested")) {
          tool = tool.replace(/:approval_requested$/, "");
          result = "waiting for confirmation";
        } else if (tool.endsWith(":executed")) {
          tool = tool.replace(/:executed$/, "");
          result = "success";
        }

        const dataObj = (log.data as Record<string, any>) || {};
        if (dataObj.error) {
          result = "error";
        }

        const site = log.target || (dataObj.siteId as string) || "Global";
        const isApprovalReq = log.action.includes(":approval_requested");
        const token = (dataObj.confirmationToken as string) || undefined;
        const isResolved = token ? resolvedTokens.has(token) : false;
        const isPending = isApprovalReq && !isResolved;

        return {
          id: log.id,
          createdAt: log.createdAt,
          tokenName,
          tool,
          site,
          result: isPending ? "waiting for confirmation" : isApprovalReq && isResolved ? "resolved" : result,
          data: dataObj,
          isPending,
          confirmationToken: token,
        };
      });
    }),

  /**
   * Approve a pending MCP action (e.g. create_section).
   */
  approveAction: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        logId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [log] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.id, input.logId),
            eq(schema.auditLog.workspaceId, ctx.workspace.id)
          )
        );

      if (!log) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity log not found",
        });
      }

      const data = (log.data as Record<string, any>) || {};
      const confirmationToken = data.confirmationToken;
      if (!confirmationToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No confirmation token found for this action",
        });
      }

      if (log.action.includes("create_section")) {
        const result = await handleCreateSection(
          ctx.workspace.id,
          `user:${ctx.user.id}`,
          {
            siteId: data.siteId,
            pageId: data.pageId,
            sectionType: data.sectionType,
            name: data.name,
            confirmed: true,
            confirmationToken,
          }
        );
        return { success: true, result };
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unsupported approval action: ${log.action}`,
      });
    }),

  /**
   * Reject a pending MCP action.
   */
  rejectAction: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        logId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [log] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.id, input.logId),
            eq(schema.auditLog.workspaceId, ctx.workspace.id)
          )
        );

      if (!log) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity log not found",
        });
      }

      const data = (log.data as Record<string, any>) || {};
      const confirmationToken = data.confirmationToken;

      await recordMcpAudit({
        workspaceId: ctx.workspace.id,
        actor: `user:${ctx.user.id}`,
        action: `${log.action.replace(/:approval_requested$/, "")}:denied`,
        target: log.target || data.siteId || "Global",
        data: {
          ...data,
          confirmationToken,
          rejectedBy: ctx.user.name || ctx.user.email,
          reason: input.reason || "Rejected by user in MCP Activity",
        },
      });

      return { success: true };
    }),
});
