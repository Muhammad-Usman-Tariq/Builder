import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@builder/db";
import {
  router,
  protectedProcedure,
  workspaceProcedure,
  requireRole,
} from "../trpc";

export const workspacesRouter = router({
  /**
   * List all workspaces where the current user is a member.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        workspace: schema.workspaces,
        role: schema.workspaceMembers.role,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaces.id, schema.workspaceMembers.workspaceId)
      )
      .where(eq(schema.workspaceMembers.userId, ctx.user.id));

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    }));
  }),

  /**
   * Get single workspace details.
   */
  get: workspaceProcedure.query(async ({ ctx }) => {
    return {
      workspace: ctx.workspace,
      role: ctx.role,
    };
  }),

  /**
   * Create a new workspace.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Workspace name is required").max(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wsId = `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20) || "workspace";
      const slug = `${safeName}-${crypto.randomUUID().slice(0, 6)}`;

      const [newWs] = await ctx.db
        .insert(schema.workspaces)
        .values({
          id: wsId,
          name: input.name,
          slug,
          ownerId: ctx.user.id,
          plan: "free",
        })
        .returning();

      await ctx.db.insert(schema.workspaceMembers).values({
        id: `wsm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        workspaceId: wsId,
        userId: ctx.user.id,
        role: "OWNER",
      });

      return newWs;
    }),

  /**
   * List members of a workspace.
   */
  members: workspaceProcedure.query(async ({ ctx }) => {
    const members = await ctx.db
      .select({
        membershipId: schema.workspaceMembers.id,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.workspaceMembers.role,
        createdAt: schema.workspaceMembers.createdAt,
      })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, ctx.workspace.id));

    return members;
  }),

  /**
   * Rename workspace (requires ADMIN or OWNER).
   */
  update: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        name: z.string().min(1).max(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(schema.workspaces)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaces.id, ctx.workspace.id))
        .returning();

      return updated;
    }),
});
