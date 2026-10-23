import { describe, it, expect, vi } from "vitest";
import {
  parseModelChain,
  executeWithModelFallback,
  AiChainExhaustedError,
  getModelUnavailableUntil,
  type ModelChainEntry,
} from "../models/chain.js";

describe("AI Model Fallback Chain", () => {
  it("parses comma-separated model chain strings", () => {
    const chainStr = "openai:gpt-4o, anthropic:claude-3-5-sonnet, google:gemini-1.5-pro";
    const entries = parseModelChain(chainStr);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      provider: "openai",
      modelId: "gpt-4o",
      raw: "openai:gpt-4o",
    });
    expect(entries[1]?.provider).toBe("anthropic");
    expect(entries[2]?.provider).toBe("google");
  });

  it("throws error for malformed chain entries", () => {
    expect(() => parseModelChain("openai")).toThrow("Invalid model chain entry");
    expect(() => parseModelChain("unsupported_vendor:model-x")).toThrow(
      "Unsupported AI provider"
    );
  });

  it("successfully falls back to subsequent model when previous model fails", async () => {
    const customChain: ModelChainEntry[] = [
      { provider: "openai", modelId: "gpt-4o", raw: "openai:gpt-4o" },
      { provider: "anthropic", modelId: "claude-3-5-sonnet", raw: "anthropic:claude-3-5-sonnet" },
    ];

    let attempts = 0;
    const runner = vi.fn().mockImplementation(async (_model, entry: ModelChainEntry) => {
      attempts++;
      if (entry.provider === "openai") {
        throw new Error("OpenAI Server Error (500)");
      }
      return { success: true, provider: entry.provider };
    });

    const mockModelResolver = vi.fn().mockImplementation((_entry: ModelChainEntry) => {
      return {} as any;
    });

    // Mock createLanguageModel so we don't need real API keys in this unit test
    const result = await executeWithModelFallback("default", runner, {
      customChain,
      modelResolver: mockModelResolver,
    });

    expect(result).toEqual({ success: true, provider: "anthropic" });
    expect(attempts).toBe(2);
  });

  it("throws AiChainExhaustedError when all models in the chain fail", async () => {
    const customChain: ModelChainEntry[] = [
      { provider: "openai", modelId: "gpt-4o", raw: "openai:gpt-4o" },
      { provider: "google", modelId: "gemini-1.5-pro", raw: "google:gemini-1.5-pro" },
    ];

    const mockModelResolver = vi.fn().mockImplementation((_entry: ModelChainEntry) => {
      return {} as any;
    });

    const runner = vi.fn().mockImplementation(async () => {
      throw new Error("Service Unavailable (503)");
    });

    await expect(
      executeWithModelFallback("default", runner, {
        customChain,
        modelResolver: mockModelResolver,
      })
    ).rejects.toThrow(AiChainExhaustedError);
  });

  it("times out and falls back to next model based on AI_REQUEST_TIMEOUT_MS", async () => {
    const origTimeout = process.env["AI_REQUEST_TIMEOUT_MS"];
    process.env["AI_REQUEST_TIMEOUT_MS"] = "50"; // 50ms timeout for test

    try {
      const customChain: ModelChainEntry[] = [
        { provider: "openai", modelId: "gpt-4o", raw: "openai:gpt-4o-timeout" },
        { provider: "anthropic", modelId: "claude-3-5-sonnet", raw: "anthropic:claude-timeout" },
      ];

      const mockModelResolver = vi.fn().mockReturnValue({} as any);

      const runner = vi.fn().mockImplementation(async (_model, entry: ModelChainEntry) => {
        if (entry.raw.includes("gpt-4o-timeout") || entry.modelId === "gpt-4o") {
          // Slow response exceeding timeout
          await new Promise((r) => setTimeout(r, 200));
          return { done: false, model: entry.modelId };
        }
        return { done: true, model: entry.modelId };
      });

      const res = await executeWithModelFallback("default", runner, {
        customChain,
        modelResolver: mockModelResolver,
      });

      expect(res).toEqual({ done: true, model: "claude-3-5-sonnet" });
    } finally {
      process.env["AI_REQUEST_TIMEOUT_MS"] = origTimeout;
    }
  });

  it("never retries daily quota errors and skips exhausted models in future requests", async () => {
    const customChain: ModelChainEntry[] = [
      { provider: "google", modelId: "gemini-flash", raw: "google:gemini-quota-test" },
      { provider: "groq", modelId: "llama-3", raw: "groq:llama-3-quota-test" },
    ];

    const mockModelResolver = vi.fn().mockReturnValue({} as any);
    let googleAttempts = 0;

    const runner = vi.fn().mockImplementation(async (_model, entry: ModelChainEntry) => {
      if (entry.modelId === "gemini-flash") {
        googleAttempts++;
        throw new Error("Resource has been exhausted (e.g. check quota): daily free tier limit reached");
      }
      return { success: true, model: entry.modelId };
    });

    // First execution: Google fails immediately without retry (googleAttempts === 1) and falls back to groq
    const result1 = await executeWithModelFallback("default", runner, {
      customChain,
      modelResolver: mockModelResolver,
    });
    expect(result1).toEqual({ success: true, model: "llama-3" });
    expect(googleAttempts).toBe(1);

    // Second execution: Google is marked unavailable until reset and skipped entirely (googleAttempts stays 1)
    const result2 = await executeWithModelFallback("default", runner, {
      customChain,
      modelResolver: mockModelResolver,
    });
    expect(result2).toEqual({ success: true, model: "llama-3" });
    expect(googleAttempts).toBe(1);
  });

  it("marks model unavailable until exact retry time when provider error states retry time", async () => {
    const customChain: ModelChainEntry[] = [
      { provider: "google", modelId: "gemini-flash-retry", raw: "google:gemini-flash-retry" },
      { provider: "anthropic", modelId: "claude-3-5-sonnet", raw: "anthropic:claude-3-5-sonnet" },
    ];

    const mockModelResolver = vi.fn().mockReturnValue({} as any);

    const runner = vi.fn().mockImplementation(async (_model, entry: ModelChainEntry) => {
      if (entry.modelId === "gemini-flash-retry") {
        throw new Error("Quota exceeded for quota metric 'Queries' and limit 'QUOTA_LIMIT_PER_DAY'. Please retry in 13h38m.");
      }
      return { success: true, model: entry.modelId };
    });

    const before = Date.now();
    const expectedDelayMs = (13 * 60 + 38) * 60 * 1000; // 13h 38m

    const res = await executeWithModelFallback("default", runner, {
      customChain,
      modelResolver: mockModelResolver,
    });
    expect(res).toEqual({ success: true, model: "claude-3-5-sonnet" });

    const until = getModelUnavailableUntil("google:gemini-flash-retry");
    expect(until).toBeDefined();
    // Verify until timestamp is approximately Date.now() + expectedDelayMs (within 5000ms window)
    expect(until).toBeGreaterThanOrEqual(before + expectedDelayMs - 1000);
    expect(until).toBeLessThanOrEqual(Date.now() + expectedDelayMs + 5000);
  });
});
