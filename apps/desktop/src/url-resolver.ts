import * as fs from "node:fs";
import * as path from "node:path";
import { EMBEDDED_APP_URL } from "./embedded-config";

export interface ResolveAppUrlOptions {
  env?: Record<string, string | undefined>;
  startDir?: string | null;
  isPackaged?: boolean;
  embeddedUrl?: string;
  readEnvFile?: ((filePath: string) => string | null) | null;
}

export interface ResolveAppUrlResult {
  appUrl: string | null;
  error?: string;
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function findRootEnvPath(startDir?: string | null): string | null {
  if (!startDir) return null;
  try {
    if (!fs.existsSync(startDir)) return null;
  } catch {
    return null;
  }
  let current = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(current, ".env");
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Ignore access errors
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function isValidAppUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveAppUrl(options?: ResolveAppUrlOptions): ResolveAppUrlResult {
  const env = options?.env ?? process.env;
  const isPackaged = options?.isPackaged ?? false;
  const embeddedUrl = options?.embeddedUrl ?? EMBEDDED_APP_URL;

  // 1. Direct environment variable (BUILDER_APP_URL or APP_URL)
  let candidate = env.BUILDER_APP_URL || env.APP_URL;

  // 2. Embedded build-time URL (for packaged builds)
  if (!candidate && isPackaged && embeddedUrl) {
    candidate = embeddedUrl;
  }

  // 3. In development / unpackaged, look for root .env
  if (!candidate && !isPackaged && options?.startDir !== null) {
    try {
      const startDir = options?.startDir ?? process.cwd();
      const envPath = findRootEnvPath(startDir);
      if (envPath) {
        const raw =
          typeof options?.readEnvFile === "function"
            ? options.readEnvFile(envPath)
            : options?.readEnvFile === null
            ? null
            : fs.readFileSync(envPath, "utf-8");
        if (raw) {
          const parsed = parseEnvFileContent(raw);
          candidate = parsed.BUILDER_APP_URL || parsed.APP_URL;
          if (candidate && !env.APP_URL) {
            // Expose to env so subsequent consumers find APP_URL
            env.APP_URL = candidate;
          }
        }
      }
    } catch {
      // Ignore file read errors
    }
  }

  // 4. Validate URL
  if (!candidate || typeof candidate !== "string" || !candidate.trim()) {
    return {
      appUrl: null,
      error: "Builder address is not configured — set APP_URL",
    };
  }

  const trimmed = candidate.trim().replace(/\/+$/, "");
  if (!isValidAppUrl(trimmed)) {
    return {
      appUrl: null,
      error: "Builder address is not configured — set APP_URL",
    };
  }

  return { appUrl: trimmed };
}
