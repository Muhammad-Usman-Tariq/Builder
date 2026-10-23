if (typeof window !== "undefined") {
  throw new Error("CRITICAL: @builder/config/env cannot be imported in client-side code.");
}
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import postgres from "postgres";
import { Redis } from "ioredis";
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import path from "node:path";
import fs from "node:fs";

// Ensure .env is loaded (walk up to find monorepo root .env if in subpackage)
function findEnvFile(startDir: string): string | undefined {
  let curr = startDir;
  while (true) {
    const candidate = path.join(curr, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return undefined;
}

const envPath = findEnvFile(process.cwd());
if (envPath) {
  loadDotenv({ path: envPath });
} else {
  loadDotenv();
}

export class EnvValidationError extends Error {
  public readonly errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]>) {
    super(message);
    this.name = "EnvValidationError";
    this.errors = errors;
  }
}

/**
 * List of recognized legacy AI providers and their required environment variables.
 */
export const SUPPORTED_AI_PROVIDERS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  cohere: "COHERE_API_KEY",
};

export type UniversalAiProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "groq"
  | "mistral"
  | "deepseek"
  | "openrouter"
  | "openai-compatible";

export const UNIVERSAL_AI_PROVIDER_TYPES: readonly UniversalAiProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "groq",
  "mistral",
  "deepseek",
  "openrouter",
  "openai-compatible",
] as const;

export type AiStructuredMode = "json_schema" | "json_mode" | "prompt";
export const VALID_STRUCTURED_MODES: readonly AiStructuredMode[] = [
  "json_schema",
  "json_mode",
  "prompt",
] as const;

export interface UniversalAiProviderConfig {
  name: string;
  type: UniversalAiProviderType;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  headers?: Record<string, string> | undefined;
  structured: AiStructuredMode;
  vision: boolean;
  timeoutMs?: number | undefined;
  maxConcurrency?: number | undefined;
  maxRpm?: number | undefined;
}

/**
 * Checks if a given URL points to a local loopback address (Ollama, LM Studio, etc.).
 */
export function isLocalUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const h = parsed.hostname.toLowerCase();
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h === "0.0.0.0" ||
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Resolves configuration for an AI provider by short name, checking explicit
 * AI_PROVIDER_<NAME>_* env variables first, and falling back to built-in legacy definitions.
 */
export function resolveProviderConfig(
  providerName: string,
  rawInput: Record<string, string | undefined> = process.env
): UniversalAiProviderConfig | null {
  if (!providerName || typeof providerName !== "string") return null;
  const trimmed = providerName.trim().toLowerCase();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const typeKey = `AI_PROVIDER_${upper}_TYPE`;
  const rawType = rawInput[typeKey]?.trim().toLowerCase();

  if (rawType) {
    const apiKey = rawInput[`AI_PROVIDER_${upper}_API_KEY`]?.trim() || undefined;
    const baseUrl = rawInput[`AI_PROVIDER_${upper}_BASE_URL`]?.trim() || undefined;
    const headersRaw = rawInput[`AI_PROVIDER_${upper}_HEADERS`]?.trim();
    let headers: Record<string, string> | undefined;
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          headers = parsed as Record<string, string>;
        } else {
          throw new Error("AI_PROVIDER headers must be a JSON object");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid JSON in AI_PROVIDER_${upper}_HEADERS: ${msg}`);
      }
    }

    const structuredRaw = rawInput[`AI_PROVIDER_${upper}_STRUCTURED`]?.trim().toLowerCase();
    const structured: AiStructuredMode =
      structuredRaw === "json_mode" || structuredRaw === "prompt" ? structuredRaw : "json_schema";

    const visionRaw = rawInput[`AI_PROVIDER_${upper}_VISION`]?.trim().toLowerCase();
    const vision = visionRaw === "true" || visionRaw === "1";

    const timeoutRaw = rawInput[`AI_PROVIDER_${upper}_TIMEOUT_MS`]?.trim();
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;

    const concurrencyRaw = rawInput[`AI_PROVIDER_${upper}_MAX_CONCURRENCY`]?.trim();
    const maxConcurrency = concurrencyRaw ? Math.max(1, Number(concurrencyRaw)) : 2;

    const rpmRaw = rawInput[`AI_PROVIDER_${upper}_MAX_RPM`]?.trim();
    const maxRpm = rpmRaw && Number(rpmRaw) > 0 ? Number(rpmRaw) : undefined;

    return {
      name: trimmed,
      type: rawType as UniversalAiProviderType,
      apiKey,
      baseUrl,
      headers,
      structured,
      vision,
      timeoutMs: Number.isFinite(timeoutMs) && (timeoutMs as number) > 0 ? timeoutMs : undefined,
      maxConcurrency,
      maxRpm,
    };
  }

  // Backward compatibility: check if name is one of the built-ins
  const BUILTIN_PROVIDERS: Record<
    string,
    { type: UniversalAiProviderType; keyVar: string; vision: boolean }
  > = {
    openai: { type: "openai", keyVar: "OPENAI_API_KEY", vision: true },
    anthropic: { type: "anthropic", keyVar: "ANTHROPIC_API_KEY", vision: true },
    google: { type: "google", keyVar: "GOOGLE_API_KEY", vision: true },
    xai: { type: "xai", keyVar: "XAI_API_KEY", vision: false },
    groq: { type: "groq", keyVar: "GROQ_API_KEY", vision: false },
    mistral: { type: "mistral", keyVar: "MISTRAL_API_KEY", vision: false },
    deepseek: { type: "deepseek", keyVar: "DEEPSEEK_API_KEY", vision: false },
    openrouter: { type: "openrouter", keyVar: "OPENROUTER_API_KEY", vision: false },
  };

  const builtin = BUILTIN_PROVIDERS[trimmed];
  if (builtin) {
    const apiKey = rawInput[builtin.keyVar]?.trim() || undefined;
    return {
      name: trimmed,
      type: builtin.type,
      apiKey,
      structured: "json_schema",
      vision: builtin.vision,
      maxConcurrency: 2,
    };
  }

  return null;
}

/**
 * Parses and returns providers from model chain strings: "provider:model-id,provider:model-id,..."
 */
export function extractProvidersFromChain(chain: string): string[] {
  if (!chain || typeof chain !== "string") return [];
  const providers: string[] = [];
  const entries = chain.split(",").map((entry) => entry.trim()).filter(Boolean);

  for (const entry of entries) {
    const colonIndex = entry.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid model chain entry "${entry}". Expected format is "provider:model-id".`);
    }
    const provider = entry.slice(0, colonIndex).trim().toLowerCase();
    if (!provider) {
      throw new Error(`Invalid model chain entry "${entry}": missing provider name.`);
    }
    if (!providers.includes(provider)) {
      providers.push(provider);
    }
  }

  return providers;
}

const booleanFromUnknown = z.preprocess((val) => {
  if (typeof val === "string") {
    const lower = val.toLowerCase().trim();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  if (typeof val === "boolean") return val;
  return val;
}, z.boolean());

export const rawEnvSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url("APP_URL must be a valid URL (e.g. http://localhost:3000)"),
  API_PUBLIC_URL: z.string().url("API_PUBLIC_URL must be a valid URL (e.g. http://localhost:3000 or tunnel URL)"),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((url) => url.startsWith("postgres://") || url.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a PostgreSQL connection URL (postgres:// or postgresql://)",
    }),
  DATABASE_URL_DIRECT: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),
  DATABASE_PREPARE: booleanFromUnknown.default(true),

  // Redis
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .refine((url) => url.startsWith("redis://") || url.startsWith("rediss://"), {
      message: "REDIS_URL must be a Redis TCP connection URL starting with redis:// or rediss://",
    }),

  // File Storage (S3 / Cloudflare R2 / Cloudinary) — Optional (cleanly OFF when STORAGE_PROVIDER is unset or empty)
  STORAGE_PROVIDER: z.enum(["s3", "cloudinary"]).optional().or(z.literal("")),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_URL: z.string().url("S3_PUBLIC_URL must be a valid public URL").optional().or(z.literal("")),
  S3_FORCE_PATH_STYLE: booleanFromUnknown.default(false),

  // Cloudinary Storage
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Auth
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters long"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // AI Model Chains — Optional (cleanly OFF when omitted)
  AI_MODEL_CHAIN: z.string().optional(),
  AI_MODEL_CHAIN_PLAN: z.string().optional(),
  AI_MODEL_CHAIN_SECTIONS: z.string().optional(),
  AI_MODEL_CHAIN_TEXT: z.string().optional(),
  AI_MODEL_CHAIN_VISION: z.string().optional(),
  AI_GENERATION_MODE: z.enum(["page", "section"]).default("page"),

  // Email
  EMAIL_PROVIDER: z.enum(["none", "resend", "smtp"]).default("none"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional().default("noreply@example.com"),

  // Stock Images
  UNSPLASH_ACCESS_KEY: z.string().optional(),

  // Security
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required")
    .refine(
      (key) => {
        try {
          const b64 = Buffer.from(key, "base64");
          if (b64.length === 32) return true;
          const hex = Buffer.from(key, "hex");
          if (hex.length === 32) return true;
          return false;
        } catch {
          return false;
        }
      },
      {
        message: "ENCRYPTION_KEY must be a 32-byte key encoded in base64 (44 chars) or hex (64 chars)",
      }
    ),
  SENTRY_DSN: z.union([z.string().url(), z.literal("")]).optional(),
}).passthrough();

export type RawEnv = z.infer<typeof rawEnvSchema>;

/**
 * Validates cross-field dependencies and provider-specific keys.
 */
export function validateEnvironment(rawInput: Record<string, string | undefined> = process.env): RawEnv {
  const parseResult = rawEnvSchema.safeParse(rawInput);
  const errors: Record<string, string[]> = {};

  if (!parseResult.success) {
    const formatted = parseResult.error.flatten().fieldErrors;
    for (const [key, msgs] of Object.entries(formatted)) {
      if (msgs && msgs.length > 0) {
        errors[key] = msgs;
      }
    }
  }

  const data = parseResult.success ? parseResult.data : null;

  // 1. Google OAuth cross-check: both or neither
  const googleId = rawInput["GOOGLE_CLIENT_ID"];
  const googleSecret = rawInput["GOOGLE_CLIENT_SECRET"];
  if ((googleId && !googleSecret) || (!googleId && googleSecret)) {
    errors["GOOGLE_OAUTH"] = ["Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set, or neither."];
  }

  // 2. Storage cross-check:
  const storageProvider = rawInput["STORAGE_PROVIDER"]?.trim();
  const s3Endpoint = rawInput["S3_ENDPOINT"]?.trim();
  const s3KeyId = rawInput["S3_ACCESS_KEY_ID"]?.trim();
  const s3Secret = rawInput["S3_SECRET_ACCESS_KEY"]?.trim();
  const s3Bucket = rawInput["S3_BUCKET"]?.trim();
  const s3PublicUrl = rawInput["S3_PUBLIC_URL"]?.trim();

  const anyS3Provided = Boolean(s3Endpoint || s3KeyId || s3Secret || s3Bucket || s3PublicUrl);
  const isS3Target = storageProvider === "s3" || (storageProvider !== "cloudinary" && anyS3Provided);

  if (isS3Target) {
    if (!s3KeyId) errors["S3_ACCESS_KEY_ID"] = ["S3_ACCESS_KEY_ID is required when STORAGE_PROVIDER is 's3'."];
    if (!s3Secret) errors["S3_SECRET_ACCESS_KEY"] = ["S3_SECRET_ACCESS_KEY is required when STORAGE_PROVIDER is 's3'."];
    if (!s3Bucket) errors["S3_BUCKET"] = ["S3_BUCKET is required when STORAGE_PROVIDER is 's3'."];
    if (!s3PublicUrl) errors["S3_PUBLIC_URL"] = ["S3_PUBLIC_URL is required when STORAGE_PROVIDER is 's3'."];
  } else if (storageProvider === "cloudinary") {
    const cloudName = rawInput["CLOUDINARY_CLOUD_NAME"]?.trim();
    const apiKey = rawInput["CLOUDINARY_API_KEY"]?.trim();
    const apiSecret = rawInput["CLOUDINARY_API_SECRET"]?.trim();

    if (!cloudName) errors["CLOUDINARY_CLOUD_NAME"] = ["CLOUDINARY_CLOUD_NAME is required when STORAGE_PROVIDER is 'cloudinary'."];
    if (!apiKey) errors["CLOUDINARY_API_KEY"] = ["CLOUDINARY_API_KEY is required when STORAGE_PROVIDER is 'cloudinary'."];
    if (!apiSecret) errors["CLOUDINARY_API_SECRET"] = ["CLOUDINARY_API_SECRET is required when STORAGE_PROVIDER is 'cloudinary'."];
  } else if (storageProvider && storageProvider !== "") {
    errors["STORAGE_PROVIDER"] = ["STORAGE_PROVIDER must be 's3' or 'cloudinary'."];
  }

  // 3. Email provider requirements
  const emailProvider = rawInput["EMAIL_PROVIDER"] || "none";
  if (emailProvider === "resend" && !rawInput["RESEND_API_KEY"]) {
    errors["RESEND_API_KEY"] = ["RESEND_API_KEY is required when EMAIL_PROVIDER is set to 'resend'."];
  } else if (emailProvider === "smtp") {
    const smtpFields = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;
    for (const field of smtpFields) {
      if (!rawInput[field]) {
        errors[field] = [`${field} is required when EMAIL_PROVIDER is set to 'smtp'.`];
      }
    }
  }

  // 4. Universal AI provider chains check
  const chains = [
    { name: "AI_MODEL_CHAIN", val: rawInput["AI_MODEL_CHAIN"] },
    { name: "AI_MODEL_CHAIN_PLAN", val: rawInput["AI_MODEL_CHAIN_PLAN"] },
    { name: "AI_MODEL_CHAIN_SECTIONS", val: rawInput["AI_MODEL_CHAIN_SECTIONS"] },
    { name: "AI_MODEL_CHAIN_TEXT", val: rawInput["AI_MODEL_CHAIN_TEXT"] },
    { name: "AI_MODEL_CHAIN_VISION", val: rawInput["AI_MODEL_CHAIN_VISION"] },
  ].filter((c): c is { name: string; val: string } => Boolean(c.val && c.val.trim() !== ""));

  const referencedProviders = new Set<string>();
  for (const { name: chainName, val: chainVal } of chains) {
    try {
      const providers = extractProvidersFromChain(chainVal);
      for (const p of providers) {
        referencedProviders.add(p);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors[chainName] = [...(errors[chainName] || []), msg];
    }
  }

  for (const provider of referencedProviders) {
    const upper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    try {
      const config = resolveProviderConfig(provider, rawInput);
      if (!config) {
        errors[`AI_PROVIDER_${upper}`] = [
          `AI provider "${provider}" referenced in chain is not defined. Set AI_PROVIDER_${upper}_TYPE in your .env.`,
        ];
        continue;
      }

      if (!UNIVERSAL_AI_PROVIDER_TYPES.includes(config.type)) {
        errors[`AI_PROVIDER_${upper}_TYPE`] = [
          `Invalid AI_PROVIDER_${upper}_TYPE "${config.type}". Supported types: ${UNIVERSAL_AI_PROVIDER_TYPES.join(", ")}.`,
        ];
      }

      if (!VALID_STRUCTURED_MODES.includes(config.structured)) {
        errors[`AI_PROVIDER_${upper}_STRUCTURED`] = [
          `Invalid AI_PROVIDER_${upper}_STRUCTURED "${config.structured}". Allowed modes: ${VALID_STRUCTURED_MODES.join(", ")}.`,
        ];
      }

      if (config.type === "openai-compatible" && (!config.baseUrl || config.baseUrl.trim() === "")) {
        errors[`AI_PROVIDER_${upper}_BASE_URL`] = [
          `AI_PROVIDER_${upper}_BASE_URL is required when AI_PROVIDER_${upper}_TYPE is 'openai-compatible'.`,
        ];
      }

      if (config.type !== "openai-compatible" && (!config.apiKey || config.apiKey.trim() === "")) {
        const isBuiltin = Boolean(SUPPORTED_AI_PROVIDERS[provider]);
        const keyVar = isBuiltin ? SUPPORTED_AI_PROVIDERS[provider]! : `AI_PROVIDER_${upper}_API_KEY`;
        errors[keyVar] = [
          `Missing API key for AI provider "${provider}": ${keyVar} is required because "${provider}" appears in your AI model chains.`,
        ];
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors[`AI_PROVIDER_${upper}`] = [msg];
    }
  }

  // Vision chain check: AI_MODEL_CHAIN_VISION may only contain providers where VISION=true
  const visionChain = rawInput["AI_MODEL_CHAIN_VISION"]?.trim();
  if (visionChain) {
    try {
      const visionProviders = extractProvidersFromChain(visionChain);
      for (const vp of visionProviders) {
        const upper = vp.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        try {
          const config = resolveProviderConfig(vp, rawInput);
          if (config && !config.vision) {
            errors["AI_MODEL_CHAIN_VISION"] = [
              ...(errors["AI_MODEL_CHAIN_VISION"] || []),
              `Provider "${vp}" in AI_MODEL_CHAIN_VISION does not support vision (AI_PROVIDER_${upper}_VISION is false or unset).`,
            ];
          }
        } catch {
          // Handled in provider check above
        }
      }
    } catch {
      // Handled in chain parser check above
    }
  }

  if (Object.keys(errors).length > 0 || !data) {
    const errorLines: string[] = [];
    for (const [key, msgs] of Object.entries(errors)) {
      for (const msg of msgs) {
        errorLines.push(`  - ${key}: ${msg}`);
      }
    }

    const message = [
      "===========================================================",
      "CRITICAL: Builder failed to start due to invalid configuration.",
      "Please fix the following environment variable(s) in your .env:",
      ...errorLines,
      "===========================================================",
    ].join("\n");

    throw new EnvValidationError(message, errors);
  }

  return data;
}

/**
 * Resolves the configured storage provider ('s3' | 'cloudinary' | null).
 */
export function getStorageProvider(envObj: Partial<RawEnv> = process.env as any): "s3" | "cloudinary" | null {
  const prov = envObj.STORAGE_PROVIDER?.trim();
  if (prov === "s3" || prov === "cloudinary") return prov;
  return null;
}

/**
 * Checks whether storage credentials are fully configured for the active provider.
 */
export function isStorageConfigured(envObj: Partial<RawEnv> = process.env as any): boolean {
  const prov = getStorageProvider(envObj);
  if (prov === "s3") {
    return Boolean(
      envObj.S3_ACCESS_KEY_ID?.trim() &&
      envObj.S3_SECRET_ACCESS_KEY?.trim() &&
      envObj.S3_BUCKET?.trim() &&
      envObj.S3_PUBLIC_URL?.trim()
    );
  }
  if (prov === "cloudinary") {
    return Boolean(
      envObj.CLOUDINARY_CLOUD_NAME?.trim() &&
      envObj.CLOUDINARY_API_KEY?.trim() &&
      envObj.CLOUDINARY_API_SECRET?.trim()
    );
  }
  return false;
}

/**
 * Checks whether AI models and provider keys are configured in the environment.
 */
export function isAiConfigured(
  envObj: Partial<RawEnv> = process.env as any,
  task?: string
): boolean {
  let chainKey = "AI_MODEL_CHAIN";
  if (task === "plan" && (envObj as any).AI_MODEL_CHAIN_PLAN) chainKey = "AI_MODEL_CHAIN_PLAN";
  else if (task === "sections" && (envObj as any).AI_MODEL_CHAIN_SECTIONS) chainKey = "AI_MODEL_CHAIN_SECTIONS";
  else if (task === "text" && (envObj as any).AI_MODEL_CHAIN_TEXT) chainKey = "AI_MODEL_CHAIN_TEXT";
  else if (task === "vision" && (envObj as any).AI_MODEL_CHAIN_VISION) chainKey = "AI_MODEL_CHAIN_VISION";

  const chain = ((envObj as any)[chainKey] || envObj.AI_MODEL_CHAIN)?.trim();
  if (!chain) return false;

  try {
    const providers = extractProvidersFromChain(chain);
    if (providers.length === 0) return false;
    const checkProvider = (p: string) => {
      const config = resolveProviderConfig(p, envObj as Record<string, string | undefined>);
      if (!config) return false;
      if (!UNIVERSAL_AI_PROVIDER_TYPES.includes(config.type)) return false;
      if (config.type === "openai-compatible") {
        if (!config.baseUrl) return false;
      } else {
        if (!config.apiKey?.trim()) return false;
      }
      if (task === "vision" && !config.vision) return false;
      return true;
    };

    if (task === "vision" && !(envObj as any).AI_MODEL_CHAIN_VISION) {
      return providers.some(checkProvider);
    }
    return providers.every(checkProvider);
  } catch {
    return false;
  }
}

/**
 * Redacts secrets from connection strings for safe logging.
 */
function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Prints a clean startup summary of active providers without revealing any secrets.
 */
export function printStartupSummary(env: RawEnv): void {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const unsplashEnabled = Boolean(env.UNSPLASH_ACCESS_KEY);
  const sentryEnabled = Boolean(env.SENTRY_DSN);

  const storageProv = getStorageProvider(env);
  let storageSummary = "OFF (set STORAGE_PROVIDER='s3' or 'cloudinary' in .env)";
  if (isStorageConfigured(env)) {
    if (storageProv === "s3") {
      storageSummary = `S3 (bucket: ${env.S3_BUCKET})`;
    } else if (storageProv === "cloudinary") {
      storageSummary = `Cloudinary (cloud: ${env.CLOUDINARY_CLOUD_NAME})`;
    }
  }

  const aiActive = isAiConfigured(env);
  let aiSummary = "OFF (add AI_MODEL_CHAIN and provider keys to .env)";
  if (aiActive && env.AI_MODEL_CHAIN) {
    try {
      const rawChain = env.AI_MODEL_CHAIN;
      const entries = rawChain.split(",").map((s) => s.trim()).filter(Boolean);
      const lines: string[] = [];
      for (const entry of entries) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) continue;
        const providerName = entry.slice(0, colonIdx).trim().toLowerCase();
        const modelId = entry.slice(colonIdx + 1).trim();
        const cfg = resolveProviderConfig(providerName, env as any);
        if (cfg) {
          let hostInfo = "";
          if (cfg.baseUrl) {
            try {
              const u = new URL(cfg.baseUrl);
              hostInfo = `, host: ${u.host}`;
            } catch {
              hostInfo = `, host: ${cfg.baseUrl}`;
            }
          }
          lines.push(`${cfg.name} (${cfg.type}${hostInfo}): ${modelId}`);
        }
      }
      aiSummary = lines.length > 0 ? lines.join("\n                      ") : env.AI_MODEL_CHAIN;
    } catch {
      aiSummary = env.AI_MODEL_CHAIN;
    }
  }

  const dbRedacted = redactUrl(env.DATABASE_URL);
  const redisRedacted = redactUrl(env.REDIS_URL);

  const banner = [
    "-------------------------------------------------------------",
    "                   BUILDER SYSTEM STARTUP                    ",
    "-------------------------------------------------------------",
    ` Environment:       ${env.NODE_ENV}`,
    ` App URL:           ${env.APP_URL}`,
    ` Public API URL:    ${env.API_PUBLIC_URL}`,
    ` Database:          ${dbRedacted}`,
    ` Prepared Stmts:    ${env.DATABASE_PREPARE ? "enabled" : "disabled"}`,
    ` Redis:             ${redisRedacted}`,
    ` Storage:           ${storageSummary}`,
    ` Auth Providers:    Email/Password${googleEnabled ? ", Google OAuth" : " (Google disabled)"}`,
    ` Email Service:     ${env.EMAIL_PROVIDER}${env.EMAIL_PROVIDER === "none" ? " (emails printed to stdout)" : ""}`,
    ` AI Model Chain:    ${aiSummary}`,
    ` AI Gen Mode:       ${env.AI_GENERATION_MODE || "page"}`,
    ` Stock Images:      ${unsplashEnabled ? "Unsplash active" : "disabled (placeholder slots)"}`,
    ` Sentry Error Log:  ${sentryEnabled ? "enabled" : "disabled"}`,
    "-------------------------------------------------------------",
  ].join("\n");

  console.log(banner);
}

export interface AiPingResult {
  provider: string;
  type: UniversalAiProviderType;
  host?: string | undefined;
  reachable: boolean;
  latencyMs: number;
  statusCode?: number | undefined;
  error?: string | undefined;
}

/**
 * Pings an AI provider endpoint to verify connectivity and measure latency.
 */
export async function pingAiProvider(
  config: UniversalAiProviderConfig
): Promise<AiPingResult> {
  const start = Date.now();
  let host = "";
  try {
    let pingUrl = "";
    const headers: Record<string, string> = { ...(config.headers || {}) };

    if (config.type === "openai") {
      const baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "anthropic") {
      const baseUrl = (config.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (config.type === "google") {
      const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/v1beta/models?key=${encodeURIComponent(config.apiKey || "")}`;
    } else if (config.type === "xai") {
      const baseUrl = (config.baseUrl || "https://api.x.ai/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "groq") {
      const baseUrl = (config.baseUrl || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "mistral") {
      const baseUrl = (config.baseUrl || "https://api.mistral.ai/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "deepseek") {
      const baseUrl = (config.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "openrouter") {
      const baseUrl = (config.baseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
      pingUrl = `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.type === "openai-compatible") {
      const baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
      pingUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/models`;
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    try {
      const u = new URL(pingUrl);
      host = u.host;
    } catch {
      host = pingUrl;
    }

    const timeout = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 5000;
    const res = await fetch(pingUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { provider: config.name, type: config.type, host, reachable: true, latencyMs, statusCode: res.status };
    } else {
      return {
        provider: config.name,
        type: config.type,
        host,
        reachable: false,
        latencyMs,
        statusCode: res.status,
        error: `HTTP ${res.status} (${res.statusText})`,
      };
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      provider: config.name,
      type: config.type,
      host,
      reachable: false,
      latencyMs,
      error: msg,
    };
  }
}

/**
 * Verifies connectivity to PostgreSQL, Redis, Storage, and Configured AI Providers.
 * Throws actionable errors if any core service is unreachable.
 */
export async function verifyConnectivity(env: RawEnv): Promise<void> {
  console.log("Verifying service connectivity...");

  // 1. PostgreSQL check
  try {
    const sql = postgres(env.DATABASE_URL, {
      prepare: env.DATABASE_PREPARE,
      max: 1,
      connect_timeout: 5,
      idle_timeout: 1,
    });
    await sql`SELECT 1 as connected`;
    await sql.end({ timeout: 2 });
    console.log("  [PostgreSQL] Connection verified successfully.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[PostgreSQL] Cannot reach database at ${redactUrl(env.DATABASE_URL)}: ${msg}\nEnsure PostgreSQL is running and credentials in DATABASE_URL are correct.`
    );
  }

  // 2. Redis check
  try {
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
    if (typeof (redis as any).on === "function") {
      (redis as any).on("error", () => {}); // Prevent unhandled error event during ping
    }
    await redis.connect();
    const pong = await redis.ping();
    redis.disconnect();
    if (pong !== "PONG") {
      throw new Error(`Unexpected PING response: ${pong}`);
    }
    console.log("  [Redis] Connection verified successfully.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[Redis] Cannot reach Redis at ${redactUrl(env.REDIS_URL)}: ${msg}\nEnsure Redis is running (e.g. Upstash, Memurai, local Redis) and REDIS_URL is correct.`
    );
  }

  // 3. Storage check (S3 or Cloudinary)
  const storageProv = getStorageProvider(env);
  if (!storageProv || !isStorageConfigured(env)) {
    console.log("  [Storage] Skipped (storage not configured in .env).");
  } else if (storageProv === "s3") {
    try {
      const s3 = new S3Client({
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        region: env.S3_REGION,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        },
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });

      try {
        await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET! }));
      } catch {
        // Fallback: some S3-compatible providers require ListObjectsV2 instead of HeadBucket
        await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET!, MaxKeys: 1 }));
      }
      console.log(`  [Storage] S3 Bucket "${env.S3_BUCKET}" verified successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[Storage] Cannot reach S3 bucket "${env.S3_BUCKET}" at ${env.S3_ENDPOINT}: ${msg}\nCheck S3_ENDPOINT, credentials, and S3_BUCKET permissions.`
      );
    }
  } else if (storageProv === "cloudinary") {
    try {
      const authHeader =
        "Basic " +
        Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString("base64");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/ping`,
        {
          headers: { Authorization: authHeader },
        }
      );
      if (!res.ok) {
        throw new Error(`Cloudinary ping returned status ${res.status} (${res.statusText})`);
      }
      console.log(`  [Storage] Cloudinary "${env.CLOUDINARY_CLOUD_NAME}" verified successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[Storage] Cannot reach Cloudinary "${env.CLOUDINARY_CLOUD_NAME}": ${msg}\nCheck CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.`
      );
    }
  }

  // 4. AI check (pings only warn, never stop startup)
  if (!isAiConfigured(env)) {
    console.log("  [AI] Skipped (AI model chain not configured in .env).");
  } else {
    try {
      const chains = [
        env.AI_MODEL_CHAIN,
        env.AI_MODEL_CHAIN_PLAN,
        env.AI_MODEL_CHAIN_SECTIONS,
        env.AI_MODEL_CHAIN_TEXT,
        env.AI_MODEL_CHAIN_VISION,
      ].filter((c): c is string => Boolean(c?.trim()));

      const allProviders = new Set<string>();
      for (const c of chains) {
        try {
          for (const p of extractProvidersFromChain(c)) {
            allProviders.add(p);
          }
        } catch {
          // Handled during env validation
        }
      }

      for (const p of allProviders) {
        const config = resolveProviderConfig(p, env as any);
        if (config) {
          const pingResult = await pingAiProvider(config);
          const hostLabel = pingResult.host ? `, host: ${pingResult.host}` : "";
          if (pingResult.reachable) {
            console.log(`  [AI] Provider "${config.name}" (${config.type}${hostLabel}): reachable (${pingResult.latencyMs}ms).`);
          } else {
            console.warn(
              `  [AI WARNING] Provider "${config.name}" (${config.type}${hostLabel}) is unreachable: ${
                pingResult.error || "status " + pingResult.statusCode
              }. The app will start, but requests to this model will fail over to the next provider in the chain.`
            );
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [AI WARNING] Failed to ping AI providers: ${msg}`);
    }
  }

  console.log("All configured services connected and ready.\n");
}

let cachedEnv: RawEnv | null = null;

/**
 * Validates environment and exits process if fatal configuration error occurs.
 */
export function validateEnv(exitOnError = true): RawEnv {
  if (cachedEnv) return cachedEnv;

  try {
    cachedEnv = validateEnvironment(process.env);
    return cachedEnv;
  } catch (err) {
    if (err instanceof EnvValidationError) {
      if (exitOnError) {
        console.error(err.message);
        process.exit(1);
      }
    }
    throw err;
  }
}

/**
 * Returns validated env without process.exit if possible (or throws).
 */
export function getEnv(): RawEnv {
  return validateEnv(false);
}

/**
 * Default lazy export of validated environment.
 */
export const env = new Proxy({} as RawEnv, {
  get(_target, prop: string | symbol) {
    if (!cachedEnv) {
      cachedEnv = validateEnv(true);
    }
    return (cachedEnv as unknown as Record<string | symbol, unknown>)[prop];
  },
});
