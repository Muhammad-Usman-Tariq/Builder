import { initTRPC, TRPCError } from "@trpc/server";
import { auth, hasMinRole, type WorkspaceRole } from "@builder/auth";
import { db, schema } from "@builder/db";
import { getPlanConfig } from "@builder/config";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

/**
 * Context creation for every tRPC procedure.
 * Extracts Better Auth session and user from request headers.
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: opts.headers });
  } catch {
    // Unauthenticated or invalid token
  }

  return {
    db,
    auth,
    headers: opts.headers,
    session: session?.session ?? null,
    user: session?.user ?? null,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const middleware = t.middleware;

/**
 * 1. Public procedure (accessible by anyone)
 */
export const publicProcedure = t.procedure;

/**
 * 2. Protected procedure (requires logged-in user)
 */
export const protectedProcedure = t.procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.user || !ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be signed in to access this resource.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        session: ctx.session,
      },
    });
  })
);

/**
 * Helper to require a minimum workspace role.
 * Architecture Section 9.2: 3. Role is high enough (OWNER > ADMIN > MEMBER > VIEWER).
 */
export function requireRole(requiredRole: WorkspaceRole) {
  return middleware(async ({ ctx, next }) => {
    const role = (ctx as Record<string, unknown>)["role"] as string | undefined;
    if (!role || !hasMinRole(role, requiredRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Insufficient permissions. Required role: ${requiredRole}. Your role: ${role || "none"}.`,
      });
    }
    return next();
  });
}

/**
 * Helper to check plan limits against usage.
 * Architecture Section 9.2: 4. Plan allows it.
 */
export function requirePlanLimit(metric: string) {
  return middleware(async ({ ctx, next }) => {
    const workspace = (ctx as Record<string, unknown>)["workspace"] as
      | typeof schema.workspaces.$inferSelect
      | undefined;
    if (workspace && metric === "sites") {
      const planConfig = getPlanConfig(workspace.plan);
      // Soft-deleted sites count toward the limit until permanently removed (30 days anti-abuse)
      const existingSites = await ctx.db
        .select()
        .from(schema.sites)
        .where(eq(schema.sites.workspaceId, workspace.id));

      if (existingSites.length >= planConfig.maxSites) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${planConfig.name} plan: ${planConfig.maxSites} sites. Deleted sites count until they are permanently removed after ${planConfig.softDeleteRetentionDays} days. Upgrade for more sites.`,
        });
      }
    }
    return next();
  });
}

/**
 * 3. Workspace procedure:
 * Validates that the logged-in user is a member of the requested workspace.
 * Resolves ctx.workspace, ctx.membership, and ctx.role.
 */
export const workspaceProcedure = protectedProcedure
  .input(z.object({ workspaceId: z.string().min(1) }))
  .use(
    middleware(async ({ ctx, input, next }) => {
      const user = ctx.user!;
      const rawInput = input as { workspaceId: string };
      const [membership] = await ctx.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, rawInput.workspaceId),
            eq(schema.workspaceMembers.userId, user.id)
          )
        );

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace.",
        });
      }

      const [workspace] = await ctx.db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, rawInput.workspaceId));

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found.",
        });
      }

      return next({
        ctx: {
          ...ctx,
          user,
          workspace,
          membership,
          role: membership.role as WorkspaceRole,
        },
      });
    })
  );

/**
 * 4. Site procedure:
 * Architecture Section 9.2:
 * "The site ID always resolves to its workspace on the server;
 * a user can never reach another workspace's data by changing an ID."
 * Resolves ctx.site, ctx.workspace, ctx.membership, and ctx.role.
 */
export const siteProcedure = protectedProcedure
  .input(z.object({ siteId: z.string().min(1) }))
  .use(
    middleware(async ({ ctx, input, next }) => {
      const user = ctx.user!;
      const rawInput = input as { siteId: string };
      const [site] = await ctx.db
        .select()
        .from(schema.sites)
        .where(eq(schema.sites.id, rawInput.siteId));

      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found.",
        });
      }

      // Check user membership in the site's workspace
      const [membership] = await ctx.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, site.workspaceId),
            eq(schema.workspaceMembers.userId, user.id)
          )
        );

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to access sites in this workspace.",
        });
      }

      const [workspace] = await ctx.db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, site.workspaceId));

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Associated workspace not found.",
        });
      }

      return next({
        ctx: {
          ...ctx,
          user,
          site,
          workspace,
          membership,
          role: membership.role as WorkspaceRole,
        },
      });
    })
  );
