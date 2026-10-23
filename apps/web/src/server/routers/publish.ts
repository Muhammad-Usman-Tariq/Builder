import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { schema, saveSiteDocument } from "@builder/db";
import { enqueueJob } from "@builder/jobs";
import type { SiteDocument } from "@builder/document";
import {
  encryptSecret,
  decryptSecret,
  validatePreflight,
  verifyVercelToken,
  promoteDeployment,
} from "@builder/publish";
import { isUnsplashConfigured } from "@builder/storage";
import {
  router,
  workspaceProcedure,
  siteProcedure,
  requireRole,
} from "../trpc";

export const publishRouter = router({
  /**
   * Get active Vercel integration status for current workspace.
   */
  getIntegration: workspaceProcedure.query(async ({ ctx }) => {
    const [integration] = await ctx.db
      .select({
        id: schema.integrations.id,
        provider: schema.integrations.provider,
        encryptedTokens: schema.integrations.encryptedTokens,
        scopes: schema.integrations.scopes,
        status: schema.integrations.status,
        createdAt: schema.integrations.createdAt,
      })
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "vercel")
        )
      );

    const isExpiredOrRevoked =
      integration?.status === "expired" || integration?.status === "revoked";
    const authError = isExpiredOrRevoked
      ? "Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations."
      : null;

    return {
      connected: !!integration && integration.status === "active",
      isExpiredOrRevoked,
      authError,
      integration: isExpiredOrRevoked ? null : (integration ?? null),
    };
  }),

  /**
   * Connect or update Vercel integration with encrypted API token and detected team.
   */
  connect: workspaceProcedure
    .use(requireRole("ADMIN"))
    .input(
      z.object({
        token: z.string().min(1, "Vercel API token is required"),
        skipVerification: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify token unless skipVerification is true (e.g., in unit tests)
      let username: string | undefined;
      let teamId: string | undefined;
      let teamSlug: string | undefined;
      let teamName: string | undefined;
      if (!input.skipVerification) {
        const verify = await verifyVercelToken(input.token);
        if (!verify.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: verify.error || "Failed to verify Vercel access token.",
          });
        }
        username = verify.username;
        teamId = verify.teamId;
        teamSlug = verify.teamSlug;
        teamName = verify.teamName;
      }

      // 2. Encrypt token using AES-256-GCM
      const encryptedTokens = encryptSecret(input.token);
      const scopes = {
        username,
        teamId,
        teamSlug,
        teamName,
      };

      // 3. Upsert integration record
      const [existing] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel")
          )
        );

      if (existing) {
        await ctx.db
          .update(schema.integrations)
          .set({
            encryptedTokens,
            scopes,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(schema.integrations.id, existing.id));
      } else {
        await ctx.db.insert(schema.integrations).values({
          id: randomUUID(),
          workspaceId: ctx.workspace.id,
          provider: "vercel",
          encryptedTokens,
          scopes,
          status: "active",
        });
      }

      return {
        success: true,
        username: username || "connected",
        teamId,
        teamSlug,
      };
    }),

  /**
   * Get comprehensive publish status for the site.
   */
  getPublishStatus: siteProcedure.query(async ({ ctx }) => {
    // 1. Check Vercel integration
    const [vercel] = await ctx.db
      .select({
        id: schema.integrations.id,
        scopes: schema.integrations.scopes,
      })
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "vercel"),
          eq(schema.integrations.status, "active")
        )
      );

    // 2. Fetch latest ready deployment
    const [latestReady] = await ctx.db
      .select()
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.siteId, ctx.site.id),
          eq(schema.deployments.status, "ready")
        )
      )
      .orderBy(desc(schema.deployments.createdAt))
      .limit(1);

    // 3. Check custom domain if verified
    const [customDomain] = await ctx.db
      .select({ hostname: schema.domains.hostname })
      .from(schema.domains)
      .where(
        and(
          eq(schema.domains.siteId, ctx.site.id),
          eq(schema.domains.verified, true)
        )
      );

    if (!latestReady) {
      return {
        isPublished: false,
        isUpToDate: false,
        lastPublishedAt: null,
        liveUrl: null,
        deploymentUrl: null,
        activeDeploymentId: null,
        hasDeploymentProtection: false,
        vercelProjectId: ctx.site.vercelProjectId || null,
        hasVercel: !!vercel,
        scopes: (vercel?.scopes as any) || null,
      };
    }

    const liveUrl = customDomain?.hostname
      ? `https://${customDomain.hostname}`
      : latestReady.url;

    // Check if current draft snapshot equals deployed snapshot
    let isUpToDate = false;
    if (latestReady.versionId) {
      const [deployedVer] = await ctx.db
        .select({ snapshot: schema.siteVersions.snapshot })
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.id, latestReady.versionId));

      const [currentDoc] = await ctx.db
        .select({ snapshot: schema.siteDocuments.snapshot })
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (deployedVer?.snapshot && currentDoc?.snapshot) {
        isUpToDate =
          JSON.stringify(deployedVer.snapshot) === JSON.stringify(currentDoc.snapshot);
      }
    }

    let deploymentUrl = latestReady.url;
    if (latestReady.logs) {
      const match = latestReady.logs.match(/\(Deployment:\s*(https:\/\/[^)]+)\)/);
      if (match?.[1]) {
        deploymentUrl = match[1];
      }
    }

    return {
      isPublished: true,
      isUpToDate,
      lastPublishedAt: latestReady.createdAt,
      liveUrl,
      deploymentUrl,
      activeDeploymentId: latestReady.id,
      hasDeploymentProtection: false,
      vercelProjectId: ctx.site.vercelProjectId || null,
      hasVercel: !!vercel,
      scopes: (vercel?.scopes as any) || null,
    };
  }),

  /**
   * Disconnect Vercel integration.
   */
  disconnect: workspaceProcedure
    .use(requireRole("ADMIN"))
    .mutation(async ({ ctx }) => {
      await ctx.db
        .delete(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel")
          )
        );

      return { success: true };
    }),

  /**
   * Run preflight publishing checks against site document.
   */
  preflight: siteProcedure.query(async ({ ctx }) => {
    // 1. Fetch document
    const [docRecord] = await ctx.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, ctx.site.id));

    if (!docRecord?.snapshot) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Site document snapshot not found",
      });
    }

    // 2. Check Vercel integration
    const [vercel] = await ctx.db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.workspaceId, ctx.workspace.id),
          eq(schema.integrations.provider, "vercel")
        )
      );

    const isExpiredOrRevoked =
      vercel?.status === "expired" || vercel?.status === "revoked";
    const hasVercelConnection = !!vercel && vercel.status === "active";

    const doc = docRecord.snapshot as SiteDocument;
    const result = validatePreflight(doc, {
      hasVercelConnection,
      isVercelExpiredOrRevoked: isExpiredOrRevoked,
    });

    return {
      ...result,
      hasUnsplash: isUnsplashConfigured(),
    };
  }),

  /**
   * Enqueue a static build and Vercel deployment job.
   */
  publish: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      // 1. Fetch document
      const [docRecord] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (!docRecord?.snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site document snapshot not found",
        });
      }

      // 2. Check Vercel integration
      const [vercel] = await ctx.db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.workspaceId, ctx.workspace.id),
            eq(schema.integrations.provider, "vercel")
          )
        );

      const isExpiredOrRevoked =
        vercel?.status === "expired" || vercel?.status === "revoked";
      const hasVercelConnection = !!vercel && vercel.status === "active";

      const doc = docRecord.snapshot as SiteDocument;
      const preflight = validatePreflight(doc, {
        hasVercelConnection,
        isVercelExpiredOrRevoked: isExpiredOrRevoked,
      });

      if (!preflight.passed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Preflight checks failed: ${preflight.errors.map((e) => e.message).join("; ")}`,
        });
      }

      // 3. Enqueue job
      const job = await enqueueJob({
        workspaceId: ctx.workspace.id,
        type: "publish:build-deploy",
        input: {
          siteId: ctx.site.id,
          userId: ctx.user.id,
        },
      });

      return {
        jobId: job.job.id,
      };
    }),

  /**
   * List all deployments for the site.
   */
  listDeployments: siteProcedure.query(async ({ ctx }) => {
    const list = await ctx.db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.siteId, ctx.site.id))
      .orderBy(desc(schema.deployments.createdAt));

    return list;
  }),

  /**
   * Rollback site to a previous deployment version.
   */
  /**
   * Rollback live site to a previous deployment version.
   * Architecture Section 9.5 & Requirement C.1:
   * Rollback must NOT overwrite the user's current draft. It redeploys the selected older
   * published version to Vercel live edge.
   */
  rollback: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        deploymentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get deployment
      const [deployment] = await ctx.db
        .select()
        .from(schema.deployments)
        .where(
          and(
            eq(schema.deployments.id, input.deploymentId),
            eq(schema.deployments.siteId, ctx.site.id)
          )
        );

      if (!deployment || !deployment.versionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deployment or associated version not found",
        });
      }

      // 2. Verify target version snapshot exists
      const [version] = await ctx.db
        .select()
        .from(schema.siteVersions)
        .where(
          and(
            eq(schema.siteVersions.id, deployment.versionId),
            eq(schema.siteVersions.siteId, ctx.site.id)
          )
        );

      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target site version snapshot not found",
        });
      }

      // 3. Check Vercel integration and try instant promote
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

      const rollbackTimeStr = new Date(deployment.createdAt).toLocaleTimeString();
      const rollbackLabel = `Rollback to ${rollbackTimeStr} version`;

      let promoted = false;
      if (vercel) {
        try {
          const token = decryptSecret(vercel.encryptedTokens);
          const teamId = (vercel.scopes as any)?.teamId as string | undefined;
          const promoteResult = await promoteDeployment(token, deployment.id, teamId);
          if (promoteResult.success) {
            promoted = true;
            const newDeploymentId = randomUUID();
            await ctx.db.insert(schema.deployments).values({
              id: newDeploymentId,
              siteId: ctx.site.id,
              versionId: deployment.versionId,
              provider: "vercel",
              status: "ready",
              url: deployment.url,
              logs: rollbackLabel,
            });
          }
        } catch (promoteErr) {
          console.warn("[Rollback] Instant promote failed, falling back to rebuild:", promoteErr);
        }
      }

      // 4. Fallback to rebuilding the older version if instant promote didn't succeed
      let redeployJobId: string | undefined;
      if (!promoted) {
        try {
          const { job } = await enqueueJob({
            workspaceId: ctx.workspace.id,
            type: "publish:build-deploy",
            input: {
              siteId: ctx.site.id,
              versionId: deployment.versionId,
              userId: ctx.user.id,
              rollbackLabel,
            },
          });
          redeployJobId = job.id;
        } catch (err) {
          console.warn("[Rollback] Could not enqueue Vercel redeploy job:", err);
        }
      }

      return {
        success: true,
        promoted,
        redeployedVersionId: deployment.versionId,
        jobId: redeployJobId,
      };
    }),

  /**
   * Restoring an old version into the editor is a separate, explicit action
   * that first saves the current draft as a new version before overwriting.
   */
  restoreVersion: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        versionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch target version
      const [targetVersion] = await ctx.db
        .select()
        .from(schema.siteVersions)
        .where(
          and(
            eq(schema.siteVersions.id, input.versionId),
            eq(schema.siteVersions.siteId, ctx.site.id)
          )
        );

      if (!targetVersion?.snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target site version snapshot not found",
        });
      }

      // 2. Fetch current draft
      const [currentDoc] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      // 3. Save current draft as a new version before overwriting
      if (currentDoc?.snapshot) {
        await ctx.db.insert(schema.siteVersions).values({
          id: randomUUID(),
          siteId: ctx.site.id,
          snapshot: currentDoc.snapshot,
          reason: "manual",
          createdBy: ctx.user.id,
        });
      }

      // 4. Overwrite draft document with target version via canonical saveSiteDocument
      const targetDoc = targetVersion.snapshot as SiteDocument;
      await saveSiteDocument(ctx.db, {
        siteId: ctx.site.id,
        document: targetDoc,
      });

      return {
        success: true,
        restoredVersionId: input.versionId,
      };
    }),
});
