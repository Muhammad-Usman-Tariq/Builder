#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import process from "node:process";

console.log("=============================================================");
console.log("             BUILDER DEV SMOKE CHECK RUNNER                  ");
console.log("=============================================================");
console.log("Starting web and worker using real 'pnpm dev' command...");

const isWin = process.platform === "win32";
const pnpmCmd = isWin ? "pnpm.cmd" : "pnpm";

let webReady = false;
let workerReady = false;
let isCleanedUp = false;

const outputBuffer = [];
const MAX_TIMEOUT_MS = 45000;

function killTree(pid) {
  if (!pid) return;
  try {
    if (isWin) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignored if process already ended
    }
  }
}

// Spawn real pnpm dev (runs turbo dev)
const devProc = isWin
  ? spawn("pnpm dev", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
    })
  : spawn("pnpm", ["dev"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // detached on POSIX for process-group kill
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
    });

function cleanup(exitCode = 0) {
  if (isCleanedUp) return;
  isCleanedUp = true;
  clearTimeout(timeoutId);

  killTree(devProc.pid);

  if (exitCode !== 0) {
    console.error("\n[Smoke Check] FAILED. Recent process logs:");
    console.error(outputBuffer.slice(-60).join("\n"));
  }

  process.exit(exitCode);
}

const timeoutId = setTimeout(() => {
  console.error(`\n[Smoke Check] TIMEOUT: Services did not report ready within ${MAX_TIMEOUT_MS / 1000}s.`);
  console.error(`Status -> Web ready: ${webReady}, Worker ready: ${workerReady}`);
  cleanup(1);
}, MAX_TIMEOUT_MS);

function handleOutput(chunk, streamName) {
  const text = chunk.toString();
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    outputBuffer.push(`[${streamName}] ${line}`);

    // Detect Web startup completion
    if (!webReady) {
      if (
        (line.includes("@builder/web") || line.includes("[Web]")) &&
        (line.includes("Startup checks completed successfully") || line.includes("Ready in"))
      ) {
        webReady = true;
        console.log("✓ Web service started and verified successfully.");
      }
    }

    // Detect Worker startup completion
    if (!workerReady) {
      if (
        (line.includes("@builder/worker") || line.includes("[Worker]")) &&
        (line.includes("Background worker initialized") || line.includes("listening for jobs"))
      ) {
        workerReady = true;
        console.log("✓ Worker service started and verified successfully.");
      }
    }

    // If both services are confirmed ready, smoke test has succeeded!
    if (webReady && workerReady) {
      console.log("\n=============================================================");
      console.log("✓ SUCCESS: Both web and worker booted cleanly in dev mode.");
      console.log("=============================================================");
      cleanup(0);
      return;
    }
  }
}

devProc.stdout.on("data", (data) => handleOutput(data, "stdout"));
devProc.stderr.on("data", (data) => handleOutput(data, "stderr"));

devProc.on("error", (err) => {
  console.error("[Smoke Check] Failed to spawn 'pnpm dev':", err);
  cleanup(1);
});

devProc.on("exit", (code) => {
  if (!isCleanedUp) {
    console.error(`[Smoke Check] 'pnpm dev' process exited prematurely with code ${code}.`);
    cleanup(code || 1);
  }
});

process.on("SIGINT", () => cleanup(1));
process.on("SIGTERM", () => cleanup(1));
