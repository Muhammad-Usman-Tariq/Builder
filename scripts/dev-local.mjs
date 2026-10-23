#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import process from "node:process";
import readline from "node:readline";

const isWin = process.platform === "win32";

console.log("=============================================================");
console.log("             BUILDER LOCAL DEV RUNNER (NO TURBO)             ");
console.log("=============================================================");
console.log("Starting Web app (Next.js) and Worker (BullMQ) in parallel...\n");

function killPid(pid) {
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
      // Ignored
    }
  }
}

let isTerminating = false;

function spawnChild(command, args, prefix, colorCode) {
  const child = isWin
    ? spawn(`${command} ${args.join(" ")}`, {
        cwd: process.cwd(),
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "1" },
      })
    : spawn(command, args, {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "1" },
      });

  function streamLines(stream, isError = false) {
    const rl = readline.createInterface({ input: stream });
    rl.on("line", (line) => {
      const reset = "\x1b[0m";
      const tag = `${colorCode}[${prefix}]${reset}`;
      if (isError) {
        console.error(`${tag} ${line}`);
      } else {
        console.log(`${tag} ${line}`);
      }
    });
  }

  streamLines(child.stdout, false);
  streamLines(child.stderr, true);

  return child;
}

const pnpmCmd = isWin ? "pnpm.cmd" : "pnpm";

const webProc = spawnChild(
  pnpmCmd,
  ["--filter", "@builder/web", "dev"],
  "web",
  "\x1b[36m" // cyan
);

const workerProc = spawnChild(
  pnpmCmd,
  ["--filter", "@builder/worker", "dev"],
  "worker",
  "\x1b[35m" // magenta
);

function shutdown(exitCode = 0) {
  if (isTerminating) return;
  isTerminating = true;

  console.log("\n[dev:local] Stopping all processes...");
  killPid(webProc.pid);
  killPid(workerProc.pid);

  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

webProc.on("exit", (code) => {
  if (!isTerminating) {
    console.error(`\n[web] exited with code ${code ?? 0}`);
    shutdown(code || 1);
  }
});

workerProc.on("exit", (code) => {
  if (!isTerminating) {
    console.error(`\n[worker] exited with code ${code ?? 0}`);
    shutdown(code || 1);
  }
});
