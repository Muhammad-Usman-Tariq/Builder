import { validateEnv, printStartupSummary, verifyConnectivity } from "@builder/config/env";
import { createWorker } from "@builder/jobs/worker";

async function main(): Promise<void> {
  console.log("[Worker] Booting Builder Worker service...");

  // Validate environment variables at boot
  const env = validateEnv(true);

  // Print startup summary
  printStartupSummary(env);

  // Verify PostgreSQL, Redis, and S3 connectivity
  await verifyConnectivity(env);

  // Initialize Sentry error reporting if configured
  const { initSentry } = await import("@builder/config/sentry");
  initSentry({ serviceName: "worker" });

  // Start BullMQ Worker
  const worker = createWorker();
  console.log("[Worker] Background worker initialized and listening for jobs on 'builder-jobs' queue.");

  // Keep worker process alive with graceful shutdown
  const shutdown = async () => {
    console.log("[Worker] Shutting down gracefully...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Worker] Fatal startup error:", err);
  process.exit(1);
});
