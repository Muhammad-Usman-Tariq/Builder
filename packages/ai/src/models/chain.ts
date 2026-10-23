import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  type UniversalAiProviderConfig,
  resolveProviderConfig,
  isAiConfigured as isAiEnvConfigured,
} from "@builder/config/env";

export type AiTaskType = "plan" | "sections" | "text" | "vision" | "default";

export interface ModelChainEntry {
  provider: string;
  modelId: string;
  raw: string;
  config?: UniversalAiProviderConfig | undefined;
}

export function isDailyQuotaError(err: Error | unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("daily") ||
    msg.includes("free tier") ||
    msg.includes("credit") ||
    msg.includes("billing") ||
    msg.includes("resource_exhausted") ||
    msg.includes("insufficient_quota") ||
    msg.includes("limit: 0") ||
    msg.includes("per day") ||
    (msg.includes("rate limit") && (msg.includes("day") || msg.includes("daily")))
  );
}

export function getHoursUntilDailyReset(): number {
  const now = new Date();
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  const diffMs = nextMidnightUtc.getTime() - now.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
}

export class AiChainExhaustedError extends Error {
  public readonly isDailyQuota: boolean;

  constructor(
    public readonly chainName: string,
    public readonly attemptsCount: number,
    public readonly errors: Error[]
  ) {
    const isQuota = errors.length > 0 && errors.every((e) => isDailyQuotaError(e));
    let message: string;
    if (isQuota) {
      const hours = getHoursUntilDailyReset();
      message = `Today's free AI limit is used up. It resets in about ${hours} hours. Add another provider in .env or try again later.`;
    } else {
      const errorDetails = errors.map((e, i) => `Attempt ${i + 1}: ${e.message}`).join("; ");
      message = `AI unavailable: all ${attemptsCount} models in ${chainName} failed. Details: ${errorDetails}`;
    }
    super(message);
    this.name = "AiChainExhaustedError";
    this.isDailyQuota = isQuota;
  }
}

/**
 * Creates an optional custom fetch handler that applies a timeout signal.
 */
function createCustomFetch(timeoutMs?: number): typeof fetch | undefined {
  if (!timeoutMs || timeoutMs <= 0) return undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeoutSignal])
        : init.signal
      : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
}

/**
 * Parses a comma-separated model chain string (e.g. "grok:grok-beta,local:llama3,nvidia:meta/llama-3.1-70b-instruct").
 */
export function parseModelChain(
  chainStr: string,
  envInput: Record<string, string | undefined> = process.env
): ModelChainEntry[] {
  if (!chainStr || !chainStr.trim()) return [];
  const entries: ModelChainEntry[] = [];

  for (const part of chainStr.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid model chain entry "${trimmed}". Expected format "provider:model-id".`);
    }
    const provider = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const modelId = trimmed.slice(colonIdx + 1).trim();

    if (!provider || !modelId) {
      throw new Error(`Invalid model chain entry "${trimmed}": both provider and model ID are required.`);
    }

    const config = resolveProviderConfig(provider, envInput);
    if (!config) {
      const upper = provider.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      throw new Error(
        `Unsupported AI provider "${provider}" in chain entry "${trimmed}". Define it with AI_PROVIDER_${upper}_TYPE in .env.`
      );
    }

    entries.push({
      provider,
      modelId,
      raw: trimmed,
      config,
    });
  }

  return entries;
}

/**
 * Resolves the chain string and parsed entries for a specific task type according to env priority.
 */
export function getChainConfigForTask(
  task: AiTaskType,
  envInput: Record<string, string | undefined> = process.env
): { chainName: string; entries: ModelChainEntry[] } {
  let envKey = "AI_MODEL_CHAIN";
  if (task === "plan" && envInput["AI_MODEL_CHAIN_PLAN"]) {
    envKey = "AI_MODEL_CHAIN_PLAN";
  } else if (task === "sections" && envInput["AI_MODEL_CHAIN_SECTIONS"]) {
    envKey = "AI_MODEL_CHAIN_SECTIONS";
  } else if (task === "text" && envInput["AI_MODEL_CHAIN_TEXT"]) {
    envKey = "AI_MODEL_CHAIN_TEXT";
  } else if (task === "vision" && envInput["AI_MODEL_CHAIN_VISION"]) {
    envKey = "AI_MODEL_CHAIN_VISION";
  }

  const rawChain = envInput[envKey] || envInput["AI_MODEL_CHAIN"] || "";
  let entries = parseModelChain(rawChain, envInput);
  if (task === "vision") {
    entries = entries.filter((e) => e.config?.vision === true);
  }
  return { chainName: envKey, entries };
}

/**
 * Checks whether AI models and provider keys are configured for the specified task.
 */
export function isAiConfigured(task: AiTaskType = "default"): boolean {
  return isAiEnvConfigured(process.env, task);
}

/**
 * Resolves an actual LanguageModel instance from a ModelChainEntry using universal providers.
 */
export function createLanguageModel(
  entry: ModelChainEntry,
  envInput: Record<string, string | undefined> = process.env
): LanguageModel {
  const config = entry.config || resolveProviderConfig(entry.provider, envInput);
  if (!config) {
    const upper = entry.provider.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    throw new Error(`Missing configuration for AI provider "${entry.provider}". Set AI_PROVIDER_${upper}_TYPE in .env.`);
  }

  if (config.type !== "openai-compatible" && !config.apiKey) {
    throw new Error(`Missing API key for AI provider "${entry.provider}" for model "${entry.raw}".`);
  }

  const customFetch = createCustomFetch(config.timeoutMs);

  switch (config.type) {
    case "openai": {
      const client = createOpenAI({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "anthropic": {
      const client = createAnthropic({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "google": {
      const client = createGoogleGenerativeAI({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "xai": {
      const client = createXai({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "groq": {
      const client = createGroq({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "mistral": {
      const client = createMistral({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "deepseek": {
      const client = createDeepSeek({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "openrouter": {
      const client = createOpenRouter({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    case "openai-compatible": {
      if (!config.baseUrl) {
        throw new Error(`Missing baseURL for openai-compatible provider "${config.name}".`);
      }
      const client = createOpenAICompatible({
        name: config.name,
        baseURL: config.baseUrl,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(customFetch ? { fetch: customFetch } : {}),
      });
      return client(entry.modelId);
    }
    default: {
      throw new Error(`Unsupported AI provider type: ${(config as any).type}`);
    }
  }
}

export type LanguageModelResolver = (entry: ModelChainEntry) => LanguageModel;

/**
 * Per-provider concurrency and rate limit throttle queues.
 * Section B.3
 */
export class ProviderThrottleQueue {
  private activeConcurrency = 0;
  private requestTimestamps: number[] = [];
  private queue: Array<() => void> = [];

  constructor(
    public readonly provider: string,
    public readonly maxConcurrency: number = 2,
    public readonly maxRpm?: number | undefined
  ) {}

  private pruneTimestamps(): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);
  }

  private getTimeUntilRpmSlot(): number {
    if (!this.maxRpm || this.maxRpm <= 0) return 0;
    this.pruneTimestamps();
    if (this.requestTimestamps.length < this.maxRpm) return 0;
    const oldest = this.requestTimestamps[0]!;
    const elapsed = Date.now() - oldest;
    return Math.max(0, 60000 - elapsed + 10);
  }

  async acquire(): Promise<void> {
    while (true) {
      this.pruneTimestamps();
      const waitTime = this.getTimeUntilRpmSlot();
      if (this.activeConcurrency < this.maxConcurrency && waitTime === 0) {
        this.activeConcurrency++;
        this.requestTimestamps.push(Date.now());
        return;
      }

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // Wait for next concurrency slot
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
  }

  release(): void {
    this.activeConcurrency = Math.max(0, this.activeConcurrency - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const providerQueues = new Map<string, ProviderThrottleQueue>();

export function getProviderThrottle(entry: ModelChainEntry): ProviderThrottleQueue {
  const key = entry.provider.toLowerCase();
  let queue = providerQueues.get(key);
  if (!queue) {
    const maxConcurrency = entry.config?.maxConcurrency ?? 2;
    const maxRpm = entry.config?.maxRpm;
    queue = new ProviderThrottleQueue(key, maxConcurrency, maxRpm);
    providerQueues.set(key, queue);
  }
  return queue;
}

/**
 * Extracts 429 retry delay in milliseconds from an error object or message.
 * Section B.3
 */
export function parse429RetryDelay(err: unknown): number | null {
  if (!err) return null;
  const is429Status =
    (err as any)?.status === 429 ||
    (err as any)?.statusCode === 429 ||
    (err as any)?.response?.status === 429;

  const errMsg = err instanceof Error ? err.message : String(err);
  const is429Text =
    is429Status ||
    errMsg.includes("429") ||
    /rate\s*limit/i.test(errMsg) ||
    /too many requests/i.test(errMsg);

  if (!is429Text) return null;

  // 1. Check Retry-After header on response
  const headers =
    (err as any)?.response?.headers ||
    (err as any)?.headers;

  let headerVal: string | null = null;
  if (headers) {
    if (typeof headers.get === "function") {
      headerVal = headers.get("retry-after") || headers.get("Retry-After");
    } else if (typeof headers === "object") {
      headerVal = headers["retry-after"] || headers["Retry-After"] || null;
    }
  }

  if (headerVal) {
    const num = parseFloat(headerVal);
    if (!isNaN(num) && num >= 0) {
      return Math.round(num * 1000);
    }
    const dateParsed = Date.parse(headerVal);
    if (!isNaN(dateParsed)) {
      return Math.max(0, dateParsed - Date.now());
    }
  }

  // 2. Parse from message (e.g. "Retry-After: 2" or "try again in 2s")
  const retryHeaderMatch = errMsg.match(/retry[-_ ]after[:\s]+(\d+(\.\d+)?)/i);
  if (retryHeaderMatch && retryHeaderMatch[1]) {
    return Math.round(parseFloat(retryHeaderMatch[1]) * 1000);
  }

  const secondsMatch = errMsg.match(/(?:try again in|wait|retry in)\s*(\d+(\.\d+)?)\s*(?:s|seconds)?/i);
  if (secondsMatch && secondsMatch[1]) {
    return Math.round(parseFloat(secondsMatch[1]) * 1000);
  }

  // Default to 2000ms if 429 detected without explicit delay
  return 2000;
}

// Track models unavailable due to daily quota until reset time (timestamp ms)
const unavailableModelsUntil = new Map<string, number>();

export function isModelTemporarilyUnavailable(modelKey: string): boolean {
  const until = unavailableModelsUntil.get(modelKey);
  if (!until) return false;
  if (Date.now() >= until) {
    unavailableModelsUntil.delete(modelKey);
    return false;
  }
  return true;
}

/**
 * Extracts retry duration in milliseconds from provider error message like "Please retry in 13h38m", "retry in 2h", "retry after 45m", etc.
 */
export function parseProviderRetryDurationMs(err: unknown): number | null {
  if (!err) return null;
  const msg = err instanceof Error ? err.message : String(err);

  // Look for patterns like "retry in 13h38m", "retry in 13h 38m 10s", "retry after 2h", "try again in 50m"
  const retryPattern = /(?:retry\s*(?:in|after)|try\s*again\s*in|wait)\s*([0-9\s\w]+)/i;
  const match = msg.match(retryPattern);
  if (!match || !match[1]) return null;

  const text = match[1].trim();

  // Match components: e.g. 13h, 38m, 20s
  let totalMs = 0;
  let matchedAny = false;

  const hMatch = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  if (hMatch && hMatch[1]) {
    totalMs += parseFloat(hMatch[1]) * 60 * 60 * 1000;
    matchedAny = true;
  }

  const mMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/i);
  if (mMatch && mMatch[1]) {
    totalMs += parseFloat(mMatch[1]) * 60 * 1000;
    matchedAny = true;
  }

  const sMatch = text.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  if (sMatch && sMatch[1]) {
    totalMs += parseFloat(sMatch[1]) * 1000;
    matchedAny = true;
  }

  if (matchedAny && totalMs > 0) {
    return totalMs;
  }

  return null;
}

export function markModelDailyQuotaExhausted(modelKey: string, err?: unknown): void {
  const retryDurationMs = parseProviderRetryDurationMs(err);
  if (retryDurationMs !== null && retryDurationMs > 0) {
    unavailableModelsUntil.set(modelKey, Date.now() + retryDurationMs);
    return;
  }

  const now = new Date();
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  unavailableModelsUntil.set(modelKey, nextMidnightUtc.getTime());
}

export function getModelUnavailableUntil(modelKey: string): number | undefined {
  return unavailableModelsUntil.get(modelKey);
}

/**
 * Executes an AI operation with fallback across the model chain.
 * Architecture Section 10.5
 */
export async function executeWithModelFallback<T>(
  task: AiTaskType,
  runner: (model: LanguageModel, entry: ModelChainEntry) => Promise<T>,
  options?: {
    customChain?: ModelChainEntry[] | undefined;
    modelResolver?: LanguageModelResolver | undefined;
    onThrottleWait?: ((message: string) => void) | undefined;
    onFallback?: ((failedModel: string, nextModel: string | undefined, error: string) => void) | undefined;
    onAttempt?: ((entry: ModelChainEntry, attemptIndex: number, total: number) => void) | undefined;
  }
): Promise<T> {
  const { chainName, entries: resolvedEntries } = getChainConfigForTask(task);
  const entries =
    options?.customChain && options.customChain.length > 0
      ? options.customChain
      : resolvedEntries;

  if (entries.length === 0) {
    if (task === "vision") {
      throw new Error(
        "No vision-capable AI provider is configured. Configure an AI provider with vision enabled (AI_PROVIDER_<NAME>_VISION=true or set AI_MODEL_CHAIN_VISION in .env)."
      );
    }
    throw new Error(`No AI models configured in chain ${chainName}. Set AI_MODEL_CHAIN in .env`);
  }

  const resolver = options?.modelResolver || createLanguageModel;
  const errors: Error[] = [];
  const requestTimeoutMs = Number(process.env["AI_REQUEST_TIMEOUT_MS"]) || 90000;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // Check if model is currently marked unavailable due to daily quota
    if (isModelTemporarilyUnavailable(entry.raw)) {
      console.log(
        `[AI:${task}] Skipping ${entry.raw} (index ${i + 1}/${entries.length}): daily quota previously exhausted until reset.`
      );
      continue;
    }

    options?.onAttempt?.(entry, i + 1, entries.length);
    const throttle = getProviderThrottle(entry);
    const attemptStartTime = Date.now();
    let attemptWaitTimeSec = 0;

    try {
      const result = await throttle.run(async () => {
        const model = resolver(entry);

        // Runner execution with per-request timeout
        const runWithTimeout = async (): Promise<T> => {
          let timeoutHandle: any;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(
                new Error(
                  `AI request timed out after ${requestTimeoutMs}ms (AI_REQUEST_TIMEOUT_MS)`
                )
              );
            }, requestTimeoutMs);
          });

          try {
            return await Promise.race([runner(model, entry), timeoutPromise]);
          } finally {
            clearTimeout(timeoutHandle);
          }
        };

        try {
          return await runWithTimeout();
        } catch (firstErr: unknown) {
          // Never retry daily quota errors: fail immediately to next model
          if (isDailyQuotaError(firstErr)) {
            markModelDailyQuotaExhausted(entry.raw, firstErr);
            throw firstErr;
          }

          // Short retries only for per-minute limits (<= 60s)
          const delayMs = parse429RetryDelay(firstErr);
          if (delayMs !== null && delayMs <= 60000) {
            const waitSeconds = Math.max(1, Math.round(delayMs / 1000));
            attemptWaitTimeSec += waitSeconds;
            const waitMessage = `Waiting for AI provider limit (about ${waitSeconds} seconds)…`;
            console.log(`[Worker] ${waitMessage}`);
            options?.onThrottleWait?.(waitMessage);
            await new Promise((r) => setTimeout(r, delayMs));
            // Retry once
            return await runWithTimeout();
          }
          throw firstErr;
        }
      });

      const durationSec = ((Date.now() - attemptStartTime) / 1000).toFixed(1);
      console.log(
        `[AI:${task}] Attempt ${i + 1}/${entries.length}: provider=${entry.provider}, model=${entry.modelId}, duration=${durationSec}s, wait=${attemptWaitTimeSec}s, error=none`
      );
      return result;
    } catch (err: unknown) {
      const durationSec = ((Date.now() - attemptStartTime) / 1000).toFixed(1);
      const msg = err instanceof Error ? err.message : String(err);
      const nextEntry = entries[i + 1];

      console.warn(
        `[AI:${task}] Attempt ${i + 1}/${entries.length}: provider=${entry.provider}, model=${entry.modelId}, duration=${durationSec}s, wait=${attemptWaitTimeSec}s, error=${msg}`
      );

      if (isDailyQuotaError(err)) {
        markModelDailyQuotaExhausted(entry.raw, err);
      }

      console.warn(
        `[Worker] Model ${entry.raw} (index ${i + 1}/${entries.length}) failed: ${msg}. ${nextEntry ? `Falling back to ${nextEntry.raw}...` : "No more models in chain."}`
      );
      options?.onFallback?.(entry.raw, nextEntry?.raw, msg);
      errors.push(err instanceof Error ? err : new Error(String(err)));
      // Continue to next model in chain
    }
  }

  throw new AiChainExhaustedError(chainName, entries.length, errors);
}
