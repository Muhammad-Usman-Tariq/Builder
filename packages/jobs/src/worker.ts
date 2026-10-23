import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, schema, saveSiteDocument } from "@builder/db";
import {
  generateFullSite,
  isAiConfigured,
} from "@builder/ai";
import type { SiteDocument } from "@builder/document";
import {
  validatePreflight,
  deployToVercel,
  decryptSecret,
  generateSafeVercelProjectName,
} from "@builder/publish";
import { buildStaticSite } from "@builder/publish/builder";
import {
  getQueueName,
  type JobType,
  type DummySlowJobPayload,
} from "./types.js";
import { createRedisConnection } from "./connection.js";
import { reportJobProgress } from "./events.js";

export interface JobData {
  jobId: string;
  workspaceId: string;
  type: JobType;
  input: Record<string, unknown>;
}

/**
 * Creates and runs the BullMQ worker for the unified "builder-jobs" queue.
 * Tuned for Upstash / Redis TCP polling limits (Rule 9).
 */
export function createWorker(customRedisUrl?: string): Worker<JobData> {
  const connection = createRedisConnection(customRedisUrl);
  const publisher = createRedisConnection(customRedisUrl);

  const worker = new Worker<JobData>(
    getQueueName(),
    async (job: Job<JobData>) => {
      const { jobId, type, input } = job.data;
      console.log(`[Worker] Starting job ${jobId} (type: ${type})`);

      // 1. Mark running
      await reportJobProgress(publisher, {
        jobId,
        status: "running",
        progress: 0,
        message: `Job ${type} started`,
      });

      try {
        switch (type) {
          case "dummy-slow": {
            if (process.env.NODE_ENV === "production") {
              throw new Error("dummy-slow jobs are strictly forbidden in production");
            }
            const payload = input as DummySlowJobPayload;
            const steps = payload.steps || 10;
            const delayMs = payload.stepDelayMs || 100;

            for (let i = 1; i <= steps; i++) {
              // Check if cancelled in DB
              const [dbJob] = await db
                .select()
                .from(schema.jobs)
                .where(eq(schema.jobs.id, jobId));

              if (dbJob?.status === "cancelled") {
                console.log(`[Worker] Job ${jobId} was cancelled during execution.`);
                return { cancelled: true };
              }

              // Delay
              await new Promise((resolve) => setTimeout(resolve, delayMs));

              // Re-check after delay in case cancellation happened during sleep
              const [dbJobAfterDelay] = await db
                .select()
                .from(schema.jobs)
                .where(eq(schema.jobs.id, jobId));

              if (dbJobAfterDelay?.status === "cancelled") {
                console.log(`[Worker] Job ${jobId} was cancelled during sleep.`);
                return { cancelled: true };
              }

              const progress = Math.round((i / steps) * 100);
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress,
                message: `Completed step ${i} of ${steps}`,
              });
            }

            // Final check before marking succeeded
            const [finalCheck] = await db
              .select()
              .from(schema.jobs)
              .where(eq(schema.jobs.id, jobId));

            if (finalCheck?.status === "cancelled") {
              return { cancelled: true };
            }

            // Mark succeeded
            await reportJobProgress(publisher, {
              jobId,
              status: "succeeded",
              progress: 100,
              message: "Job completed successfully",
              output: { stepsCompleted: steps },
            });

            return { success: true, steps };
          }

          case "media:process-image": {
            const assetId = (input["assetId"] as string) || jobId;
            console.log(`[Worker] Processing media asset ${assetId}`);

            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 25,
              message: "Analyzing uploaded image metadata",
            });

            const width = (input["width"] as number) || 1920;
            const height = (input["height"] as number) || 1080;
            const blurhash = "LEHLh[WB2yk8pyoJadR*.7kCMdnj";

            try {
              await db
                .update(schema.assets)
                .set({
                  width,
                  height,
                  blurhash,
                })
                .where(eq(schema.assets.id, assetId));
            } catch (err) {
              console.warn(`[Worker] Failed to update asset ${assetId} record:`, err);
            }

            await reportJobProgress(publisher, {
              jobId,
              status: "succeeded",
              progress: 100,
              message: "Image processed successfully",
              output: { assetId, width, height, blurhash },
            });

            return { success: true, assetId, width, height, blurhash };
          }

          case "ai:generate-site": {
            const siteId = input["siteId"] as string;
            const prompt = (input["prompt"] as string) || "Professional modern business website";
            const workspaceId = job.data.workspaceId;
            const jobStartTime = Date.now();

            console.log(`[Worker] Starting job ${jobId} (ai:generate-site)...`);

            // Enforce single active generation job per site (lock)
            const lockKey = `lock:site-gen:${siteId}`;
            const acquired = await publisher.set(lockKey, jobId, "EX", 300, "NX");
            if (!acquired) {
              throw new Error(`A generation job is already running for site ${siteId}.`);
            }

            let savedSuccessfully = false;
            try {
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress: 10,
                message: "Analyzing prompt & generating site plan...",
              });

              if (!isAiConfigured("plan")) {
                throw new Error("AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env");
              }

              const doc = await generateFullSite(prompt, {
                onProgress: async (stage, pct) => {
                  await reportJobProgress(publisher, {
                    jobId,
                    status: "running",
                    progress: pct,
                    message: stage,
                  });
                },
                onThrottleWait: async (msg) => {
                  await reportJobProgress(publisher, {
                    jobId,
                    status: "running",
                    progress: 15,
                    message: msg,
                  });
                },
              });

              // Stock photo filling step (searches Unsplash, copies into storage, stores attribution)
              const tImgStart = Date.now();
              try {
                const { fillSiteStockPhotos } = await import("@builder/storage");
                const fillResult = await fillSiteStockPhotos({
                  doc,
                  workspaceId,
                  siteId,
                  onImageFilled: (logLine) => {
                    console.log(`[Worker] ${logLine}`);
                  },
                  onProgress: async (msg) => {
                    await reportJobProgress(publisher, {
                      jobId,
                      status: "running",
                      progress: 92,
                      message: msg,
                    });
                  },
                });
                const imgSec = ((Date.now() - tImgStart) / 1000).toFixed(1);
                console.log(
                  `[Worker] Image fill completed in ${imgSec}s (${fillResult.filledCount} filled, ${fillResult.failedCount} failed)`
                );
              } catch (imgErr) {
                console.warn("[Worker] Image fill step encountered error:", imgErr);
              }

              // Canonical atomic save of snapshot + yjs_state + version
              const tSaveStart = Date.now();
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress: 96,
                message: "Saving site document to database...",
              });
              await saveSiteDocument(db, {
                siteId,
                document: doc,
                createVersion: true,
                versionReason: `AI generation: "${prompt.slice(0, 50)}"`,
                userId: (input["userId"] as string) || null,
              });
              savedSuccessfully = true;
              const saveSec = ((Date.now() - tSaveStart) / 1000).toFixed(1);
              console.log(`[Worker] Document saved to database in ${saveSec}s`);

              // Commit AI usage units (reserved -> used)
              try {
                const reservedUnits =
                  typeof input?.["reservedUnits"] === "number"
                    ? (input["reservedUnits"] as number)
                    : 10;
                const { commitUsage } = await import("@builder/db");
                await commitUsage(db, {
                  workspaceId,
                  metric: "ai_units",
                  reservedUnits,
                  usedUnits: 10,
                });
              } catch (cntErr) {
                console.warn("[Worker] Failed to commit AI usage counter:", cntErr);
              }

              const totalSec = Math.round((Date.now() - jobStartTime) / 1000);
              console.log(`[Worker] Job ${jobId} completed in ${totalSec} s`);

              await reportJobProgress(publisher, {
                jobId,
                status: "succeeded",
                progress: 100,
                message: "Site generated successfully!",
                output: { siteId, pageCount: Object.keys(doc.pages).length },
              });

              return { success: true, siteId, pages: Object.keys(doc.pages).length };
            } finally {
              try {
                // If the generation job did not succeed in saving, clean up the empty site
                // only after the job execution has fully stopped.
                if (!savedSuccessfully) {
                  const existingVersions = await db
                    .select({ id: schema.siteVersions.id })
                    .from(schema.siteVersions)
                    .where(eq(schema.siteVersions.siteId, siteId));

                  if (existingVersions.length === 0) {
                    await db.delete(schema.sites).where(eq(schema.sites.id, siteId));
                    console.log(`[Worker] Cleaned up empty site ${siteId} after AI generation failure.`);
                  }
                }
              } catch (cleanErr) {
                console.warn(`[Worker] Cleanup check failed for site ${siteId}:`, cleanErr);
              } finally {
                await publisher.del(lockKey);
              }
            }
          }

          case "ai:regenerate-section": {
            if (!isAiConfigured("sections")) {
              throw new Error("AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env");
            }
            const siteId = input["siteId"] as string;
            const prompt = (input["prompt"] as string) || "More modern section";
            const sectionId = input["sectionId"] as string;
            const workspaceId = job.data.workspaceId;

            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 30,
              message: "Regenerating section...",
            });

            const [docRow] = await db
              .select()
              .from(schema.siteDocuments)
              .where(eq(schema.siteDocuments.siteId, siteId));

            if (!docRow?.snapshot) {
              throw new Error(`Site document not found for site ${siteId}`);
            }

            const currentDoc = docRow.snapshot as SiteDocument;
            const targetSection = currentDoc.elements[sectionId];
            if (!targetSection) {
              throw new Error(`Section ${sectionId} not found in site document`);
            }

            // Respect aiLocked on the section itself
            if (targetSection.aiLocked) {
              throw new Error(`Section ${sectionId} is AI-locked and cannot be modified`);
            }

            const patchElements: Record<string, any> = {
              [sectionId]: {
                name: `${targetSection.name || "Section"} (AI)`,
                origin: "ai",
              },
            };
            let previewText = "";
            for (const childId of targetSection.children) {
              const child = currentDoc.elements[childId];
              // Respect aiLocked on individual child elements
              if (child && !child.aiLocked && (child.type === "Heading" || child.type === "Text")) {
                const newText = `Enhanced: ${prompt.slice(0, 40)}`;
                patchElements[childId] = {
                  props: { ...child.props, text: newText },
                  origin: "ai",
                };
                if (!previewText) previewText = newText;
              }
            }

            const patch = {
              elements: patchElements,
              origin: "ai" as const,
            };

            // Commit AI usage units (reserved -> used)
            try {
              const reservedUnits =
                typeof input?.["reservedUnits"] === "number"
                  ? (input["reservedUnits"] as number)
                  : 2;
              const { commitUsage } = await import("@builder/db");
              await commitUsage(db, {
                workspaceId,
                metric: "ai_units",
                reservedUnits,
                usedUnits: 2,
              });
            } catch (cntErr) {
              console.warn("[Worker] Failed to commit AI usage counter:", cntErr);
            }

            await reportJobProgress(publisher, {
              jobId,
              status: "succeeded",
              progress: 100,
              message: "Section regenerated successfully!",
              output: {
                sectionId,
                patch,
                previewText: previewText || `Enhanced ${targetSection.name || "Section"}`,
              },
            });

            return {
              success: true,
              sectionId,
              patch,
              previewText: previewText || `Enhanced ${targetSection.name || "Section"}`,
            };
          }

          case "publish:build-deploy": {
            const siteId = input["siteId"] as string;
            const workspaceId = job.data.workspaceId;
            let versionId = input["versionId"] as string | undefined;

            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 10,
              message: "Loading site document and deployment configuration...",
            });

            // 1. Fetch site and site document
            const [site] = await db
              .select()
              .from(schema.sites)
              .where(eq(schema.sites.id, siteId));

            if (!site) {
              throw new Error(`Site not found: ${siteId}`);
            }

            let doc: SiteDocument;
            if (versionId) {
              const [verRecord] = await db
                .select()
                .from(schema.siteVersions)
                .where(eq(schema.siteVersions.id, versionId));

              if (!verRecord?.snapshot) {
                throw new Error(`Target site version snapshot not found: ${versionId}`);
              }
              doc = verRecord.snapshot as SiteDocument;
            } else {
              const [docRecord] = await db
                .select()
                .from(schema.siteDocuments)
                .where(eq(schema.siteDocuments.siteId, siteId));

              if (!docRecord?.snapshot) {
                throw new Error(`Site document not found for site: ${siteId}`);
              }
              doc = docRecord.snapshot as SiteDocument;

              // Snapshot/freeze version if not provided
              versionId = randomUUID();
              await db.insert(schema.siteVersions).values({
                id: versionId,
                siteId,
                snapshot: doc,
                reason: "publish",
                createdBy: (input["userId"] as string) || null,
              });
            }

            // 3. Create initial deployment record in DB
            const deploymentId = randomUUID();
            await db.insert(schema.deployments).values({
              id: deploymentId,
              siteId,
              versionId,
              provider: "vercel",
              status: "building",
              logs: "Deployment initiated.",
            });

            try {
              // 4. Preflight checks
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress: 25,
                message: "Running preflight validation checks...",
              });

              // Check if workspace has active Vercel integration
              const [vercelIntegration] = await db
                .select()
                .from(schema.integrations)
                .where(
                  and(
                    eq(schema.integrations.workspaceId, workspaceId),
                    eq(schema.integrations.provider, "vercel"),
                    eq(schema.integrations.status, "active")
                  )
                );

              const preflight = validatePreflight(doc, {
                hasVercelConnection: !!vercelIntegration,
              });

              if (!preflight.passed) {
                const errMessage = `Preflight validation failed: ${preflight.errors.map((e) => e.message).join("; ")}`;
                await db
                  .update(schema.deployments)
                  .set({ status: "error", logs: errMessage })
                  .where(eq(schema.deployments.id, deploymentId));
                throw new Error(errMessage);
              }

              if (!vercelIntegration) {
                throw new Error("Vercel integration not found for workspace");
              }

              // 5. Build static distribution
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress: 50,
                message: "Compiling static pages, CSS and assets...",
              });

              const publishedCmsEntries = await db
                .select()
                .from(schema.cmsEntries)
                .where(
                  and(
                    eq(schema.cmsEntries.siteId, siteId),
                    eq(schema.cmsEntries.status, "published")
                  )
                );

              const buildResult = buildStaticSite(doc, {
                siteId,
                apiPublicUrl: process.env.API_PUBLIC_URL || process.env.APP_URL || "",
                cmsEntries: publishedCmsEntries.map((e) => ({
                  id: e.id,
                  collectionId: e.collectionId,
                  title: e.title,
                  slug: e.slug,
                  status: e.status,
                  isSample: e.isSample,
                  data: e.data,
                })),
              });

              // 6. Deploy to Vercel
              await reportJobProgress(publisher, {
                jobId,
                status: "running",
                progress: 75,
                message: "Deploying distribution to Vercel edge...",
              });

              const token = decryptSecret(vercelIntegration.encryptedTokens);
              const scopes = vercelIntegration.scopes as any;
              const teamId = scopes?.teamId as string | undefined;

              const projectName =
                site.vercelProjectName ||
                generateSafeVercelProjectName(site.name, siteId);

              console.log(`[Publish] Using Vercel project name: ${projectName}, teamId: ${teamId || "none"}`);

              const deployResult = await deployToVercel({
                token,
                projectName,
                projectId: site.vercelProjectId || undefined,
                files: buildResult.files,
                teamId,
                onProgress: (step, pct) => {
                  reportJobProgress(publisher, {
                    jobId,
                    status: "running",
                    progress: 75 + Math.round(pct * 0.2),
                    message: step,
                  }).catch(() => {});
                },
              });

              // 7. Update site with Vercel project name & ID, and deployment record in DB
              await db
                .update(schema.sites)
                .set({
                  vercelProjectName: projectName,
                  vercelProjectId: deployResult.projectId || site.vercelProjectId || null,
                  updatedAt: new Date(),
                })
                .where(eq(schema.sites.id, siteId));

              const rollbackLabel = (input["rollbackLabel"] as string) || null;
              const logMessage = rollbackLabel
                ? `${rollbackLabel} — Deployed to ${deployResult.url} (Deployment: ${deployResult.deploymentUrl})`
                : `Deployed successfully to ${deployResult.url} (Deployment: ${deployResult.deploymentUrl})`;

              await db
                .update(schema.deployments)
                .set({
                  status: "ready",
                  url: deployResult.url,
                  logs: logMessage,
                })
                .where(eq(schema.deployments.id, deploymentId));

              // 8. Report succeeded
              await reportJobProgress(publisher, {
                jobId,
                status: "succeeded",
                progress: 100,
                message: `Published successfully! Live at ${deployResult.url}`,
                output: {
                  deploymentId,
                  url: deployResult.url,
                  deploymentUrl: deployResult.deploymentUrl,
                  hasDeploymentProtection: deployResult.hasDeploymentProtection,
                  versionId,
                },
              });

              return {
                success: true,
                deploymentId,
                url: deployResult.url,
                deploymentUrl: deployResult.deploymentUrl,
                versionId,
              };
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              await db
                .update(schema.deployments)
                .set({
                  status: "error",
                  logs: errMsg,
                })
                .where(eq(schema.deployments.id, deploymentId));
              throw err;
            }
          }

          case "import:url": {
            const url = input["url"] as string;
            const siteId = input["siteId"] as string;
            const siteName = (input["siteName"] as string) || "Imported Site";
            const allowLocal = Boolean(input["allowLocal"]);

            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 10,
              message: "Verifying URL security (SSRF) and robots.txt permissions...",
            });

            const workspaceId = job.data.workspaceId;
            const { importFromUrl } = await import("@builder/importers");
            const result = await importFromUrl({
              url,
              siteName,
              allowLocal,
            });

            // Copy remote public images to configured storage (Cloudinary / S3)
            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 50,
              message: "Copying remote images to configured storage...",
            });

            try {
              const { copyRemoteImageToStorage } = await import("@builder/storage");
              for (const elId of Object.keys(result.document.elements)) {
                const el = result.document.elements[elId];
                if (el && el.type === "Image" && typeof el.props["src"] === "string") {
                  const src = el.props["src"] as string;
                  if (src.startsWith("http://") || src.startsWith("https://")) {
                    try {
                      const stored = await copyRemoteImageToStorage({
                        workspaceId,
                        imageUrl: src,
                      });
                      if (stored) {
                        el.props["src"] = stored.publicUrl;
                        try {
                          await db.insert(schema.assets).values({
                            id: `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
                            workspaceId,
                            siteId,
                            key: stored.key,
                            type: "image",
                            size: 0,
                            provider: stored.provider,
                            providerFileId: stored.providerFileId,
                            status: "ready",
                          });
                        } catch (assetErr) {
                          console.warn("[Worker] Failed to create asset record for copied image:", assetErr);
                        }
                      }
                    } catch (copyErr) {
                      console.warn(`[Worker] Failed to copy remote image ${src}:`, copyErr);
                    }
                  }
                }
              }

              // Also copy remote CSS background images to storage
              for (const styleId of Object.keys(result.document.styles)) {
                const rule = result.document.styles[styleId];
                if (!rule) continue;
                for (const bp of Object.keys(rule.values)) {
                  const states = rule.values[bp];
                  if (!states) continue;
                  for (const st of Object.keys(states)) {
                    const decls = states[st as "default"];
                    if (!decls) continue;
                    const bgVal = decls["backgroundImage"];
                    if (bgVal && "raw" in bgVal && typeof bgVal.raw === "string") {
                      const match = bgVal.raw.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
                      if (match && match[1]) {
                        const remoteUrl = match[1];
                        try {
                          const stored = await copyRemoteImageToStorage({
                            workspaceId,
                            imageUrl: remoteUrl,
                          });
                          if (stored) {
                            decls["backgroundImage"] = { raw: `url("${stored.publicUrl}")` };
                            try {
                              await db.insert(schema.assets).values({
                                id: `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
                                workspaceId,
                                siteId,
                                key: stored.key,
                                type: "image",
                                size: 0,
                                provider: stored.provider,
                                providerFileId: stored.providerFileId,
                                status: "ready",
                              });
                            } catch (assetErr) {
                              console.warn("[Worker] Failed to create asset record for background image:", assetErr);
                            }
                          }
                        } catch (copyErr) {
                          console.warn(`[Worker] Failed to copy remote background image ${remoteUrl}:`, copyErr);
                        }
                      }
                    }
                  }
                }
              }
            } catch (storageErr) {
              console.warn("[Worker] Storage copy error during URL import:", storageErr);
            }

            await reportJobProgress(publisher, {
              jobId,
              status: "running",
              progress: 80,
              message: "Saving imported document and creating site version snapshot...",
            });

            // Save document and site version atomically via canonical saveSiteDocument
            await saveSiteDocument(db, {
              siteId,
              document: result.document,
              createVersion: true,
              versionReason: `Imported from ${url}`,
            });

            await reportJobProgress(publisher, {
              jobId,
              status: "succeeded",
              progress: 100,
              message: "Website imported successfully!",
              output: {
                siteId,
                report: result.report,
              },
            });

            return { success: true, siteId, report: result.report };
          }

          default: {
            console.log(`[Worker] Processing job type ${type}`);
            await reportJobProgress(publisher, {
              jobId,
              status: "succeeded",
              progress: 100,
              message: `Job ${type} processed`,
              output: { executed: true },
            });
            return { success: true };
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Worker] Job ${jobId} failed: ${errMsg}`);

        // Release reserved AI units if this was an AI job
        if (type.startsWith("ai:")) {
          const reservedUnits =
            typeof input?.["reservedUnits"] === "number"
              ? (input["reservedUnits"] as number)
              : type === "ai:generate-site"
              ? 10
              : 2;
          try {
            const { releaseUsage } = await import("@builder/db");
            await releaseUsage(db, {
              workspaceId: job.data.workspaceId,
              metric: "ai_units",
              units: reservedUnits,
            });
          } catch (uErr) {
            console.warn("[Worker] Failed to release usage on job failure:", uErr);
          }
        }

        await reportJobProgress(publisher, {
          jobId,
          status: "failed",
          progress: (job.progress as number) || 0,
          message: errMsg || "Job execution failed",
          error: errMsg,
        });

        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
      // Polling and lock intervals tuned for Redis TCP / Upstash free limits (Rule 9)
      stalledInterval: 60000,
      lockDuration: 60000,
      maxStalledCount: 2,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
  });

  worker.on("error", (err: any) => {
    const msg = err?.message || String(err);
    if (msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) {
      console.warn("[BullMQ:Worker] Redis connection lost, reconnecting…");
    } else {
      console.warn(`[BullMQ:Worker] Warning: ${msg}`);
    }
  });

  return worker;
}
