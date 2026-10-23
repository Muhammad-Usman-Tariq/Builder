export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv, printStartupSummary, verifyConnectivity } = await import("./server/env");

    console.log("[Web] Starting Builder Next.js web application...");
    const env = validateEnv(true);
    printStartupSummary(env);
    await verifyConnectivity(env);

    const { initSentry } = await import("./server/env");
    initSentry({ serviceName: "web" });

    console.log("[Web] Startup checks completed successfully.");
  }
}
