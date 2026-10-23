import path from "node:path";
import fs from "node:fs";

function findEnvFile(startDir) {
  let curr = startDir;
  while (true) {
    const candidate = path.join(curr, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
}
const envPath = findEnvFile(process.cwd());
if (envPath && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

import { createRequire } from "node:module";

let yjsResolvedMjsPath = "";
try {
  const req = createRequire(import.meta.resolve("@builder/document"));
  const yjsEntry = req.resolve("yjs");
  const dir = path.dirname(yjsEntry);
  const candidateMjs = path.resolve(dir, "yjs.mjs");
  if (fs.existsSync(candidateMjs)) {
    yjsResolvedMjsPath = candidateMjs;
  } else {
    yjsResolvedMjsPath = path.resolve(dir, "..", "dist", "yjs.mjs");
  }
} catch {
  // fallback
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "@valkey/valkey-glide",
    "yjs",
    "playwright",
    "playwright-core",
  ],
  transpilePackages: [
    "@builder/config",
    "@builder/ui",
    "@builder/document",
    "@builder/elements",
    "@builder/renderer",
    "@builder/editor-core",
    "@builder/storage",
    "@builder/ai",
    "@builder/jobs",
    "@builder/publish",
    "@builder/mcp",
    "@builder/templates",
    "@builder/db",
    "@builder/auth",
  ],
  webpack: (config, { webpack, isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@valkey/valkey-glide": false,
      ...(yjsResolvedMjsPath
        ? {
            "yjs$": yjsResolvedMjsPath,
            "yjs": yjsResolvedMjsPath,
            "yjs/dist/yjs.cjs": yjsResolvedMjsPath,
            "yjs/dist/yjs.mjs": yjsResolvedMjsPath,
          }
        : {}),
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      "@valkey/valkey-glide": false,
    };
    if (isServer) {
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, "yjs"]
        : [config.externals, "yjs"].filter(Boolean);
    }
    if (webpack) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@valkey\/valkey-glide$/,
        })
      );
    }
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
