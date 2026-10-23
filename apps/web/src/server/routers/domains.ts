import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { schema } from "@builder/db";
import {
  decryptSecret,
  addProjectDomain,
  verifyProjectDomain,
  removeProjectDomain,
} from "@builder/publish";
import { router, siteProcedure, requireRole } from "../trpc";

export const domainsRouter = router({
  /**
   * Get custom domain and Vercel integration status for the site.
   */
  get: siteProcedure.query(async ({ ctx }) => {
    // 1. Check if workspace has an active Vercel integration
    const [vercel] = await ctx.db
      .select({ id: schema.integrations.id, scopes: schema.integrations.scopes })
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "vercel"),
          eq(schema.integrations.status, "active")
        )
      );

    // 2. Fetch custom domain configured for this site
    const [domain] = await ctx.db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.siteId, ctx.site.id));

    // 3. Check if the site was ever published
    const [latestDeployment] = await ctx.db
      .select({ id: schema.deployments.id })
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.siteId, ctx.site.id),
          eq(schema.deployments.status, "ready")
        )
      )
      .limit(1);

    const isPublished = !!latestDeployment || !!ctx.site.vercelProjectId;

    return {
      hasVercel: !!vercel,
      isPublished,
      domain: domain || null,
    };
  }),

  /**
   * Add a custom domain to the site and configure it on Vercel.
   */
  add: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        hostname: z
          .string()
          .min(3, "Domain name is required")
          .regex(
            /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
            "Please enter a valid domain (e.g. mybrand.com or www.mybrand.com)"
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Check if site is published
      const [latestDeployment] = await ctx.db
        .select({ id: schema.deployments.id })
        .from(schema.deployments)
        .where(
          and(
            eq(schema.deployments.siteId, ctx.site.id),
            eq(schema.deployments.status, "ready")
          )
        )
        .limit(1);

      if (!latestDeployment && !ctx.site.vercelProjectId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Publish the site first to connect a domain",
        });
      }

      // 2. Check Vercel integration
      const [vercel] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel"),
            eq(schema.integrations.status, "active")
          )
        );

      if (!vercel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Vercel account is not connected. Please connect your Vercel account in Workspace Settings before adding custom domains.",
        });
      }

      const token = decryptSecret(vercel.encryptedTokens);
      const cleanHost = input.hostname.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const teamId = (vercel.scopes as any)?.teamId as string | undefined;
      const projectIdOrName =
        ctx.site.vercelProjectId ||
        ctx.site.vercelProjectName ||
        ctx.site.slug ||
        ctx.site.name.toLowerCase().replace(/[^a-z0-9]/g, "-");

      // 3. Call Vercel API
      let vercelStatus;
      try {
        vercelStatus = await addProjectDomain(token, projectIdOrName, cleanHost, teamId);
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "Failed to add domain to Vercel.",
        });
      }

      // 4. Upsert domain in local DB
      const [existing] = await ctx.db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.siteId, ctx.site.id));

      if (existing) {
        const [updated] = await ctx.db
          .update(schema.domains)
          .set({
            hostname: cleanHost,
            verified: vercelStatus.verified,
            sslStatus: vercelStatus.sslStatus,
            verificationRecords: vercelStatus.records,
            updatedAt: new Date(),
          })
          .where(eq(schema.domains.id, existing.id))
          .returning();

        return {
          domain: updated,
          records: vercelStatus.records,
          verified: vercelStatus.verified,
          sslStatus: vercelStatus.sslStatus,
        };
      }

      const domainId = `dom_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const [created] = await ctx.db
        .insert(schema.domains)
        .values({
          id: domainId,
          siteId: ctx.site.id,
          hostname: cleanHost,
          verified: vercelStatus.verified,
          sslStatus: vercelStatus.sslStatus,
          verificationRecords: vercelStatus.records,
        })
        .returning();

      return {
        domain: created,
        records: vercelStatus.records,
        verified: vercelStatus.verified,
        sslStatus: vercelStatus.sslStatus,
      };
    }),

  /**
   * Re-verify custom domain ownership and SSL issuance against Vercel.
   */
  verify: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      // 1. Fetch domain
      const [domain] = await ctx.db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.siteId, ctx.site.id));

      if (!domain) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No custom domain configured for this site.",
        });
      }

      // 2. Check Vercel integration
      const [vercel] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel"),
            eq(schema.integrations.status, "active")
          )
        );

      if (!vercel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Vercel integration is not connected.",
        });
      }

      const token = decryptSecret(vercel.encryptedTokens);
      const teamId = (vercel.scopes as any)?.teamId as string | undefined;
      const projectIdOrName =
        ctx.site.vercelProjectId ||
        ctx.site.vercelProjectName ||
        ctx.site.slug ||
        ctx.site.name.toLowerCase().replace(/[^a-z0-9]/g, "-");

      // 3. Call Vercel verify endpoint (which checks verification and domain configuration)
      const vercelStatus = await verifyProjectDomain(token, projectIdOrName, domain.hostname, teamId);

      const isVerified = vercelStatus.verified;
      const sslStatus = vercelStatus.sslStatus;

      // 4. Update DB record
      const [updated] = await ctx.db
        .update(schema.domains)
        .set({
          verified: isVerified,
          sslStatus,
          verificationRecords: vercelStatus.records,
          updatedAt: new Date(),
        })
        .where(eq(schema.domains.id, domain.id))
        .returning();

      return {
        domain: updated,
        records: vercelStatus.records,
        verified: isVerified,
        sslStatus,
        status: vercelStatus.status,
        error: vercelStatus.error,
      };
    }),

  /**
   * Remove custom domain from Vercel and clear it from the site.
   */
  remove: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      const [domain] = await ctx.db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.siteId, ctx.site.id));

      if (!domain) {
        return { success: true };
      }

      // Try to remove from Vercel if token is present
      const [vercel] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel"),
            eq(schema.integrations.status, "active")
          )
        );

      if (vercel) {
        try {
          const token = decryptSecret(vercel.encryptedTokens);
          const teamId = (vercel.scopes as any)?.teamId as string | undefined;
          const projectIdOrName =
            ctx.site.vercelProjectId ||
            ctx.site.vercelProjectName ||
            ctx.site.slug ||
            ctx.site.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
          await removeProjectDomain(token, projectIdOrName, domain.hostname, teamId);
        } catch (err) {
          console.warn("[Domains] Error removing domain from Vercel:", err);
        }
      }

      // Delete from DB
      await ctx.db.delete(schema.domains).where(eq(schema.domains.id, domain.id));

      return { success: true };
    }),
});
