import { describe, it, expect, vi } from "vitest";
import {
  ProviderThrottleQueue,
  parse429RetryDelay,
  executeWithModelFallback,
  type ModelChainEntry,
} from "../models/chain.js";

describe("B.3 Provider Rate Limiting & 429 Handling", () => {
  it("parses 429 retry delay correctly from header or message", () => {
    // 1. From response headers (seconds string)
    const errWithHeader = {
      status: 429,
      response: {
        headers: {
          get: (name: string) => (name.toLowerCase() === "retry-after" ? "2" : null),
        },
      },
    };
    expect(parse429RetryDelay(errWithHeader)).toBe(2000);

    // 2. From error message "Retry-After: 2"
    const errWithMessage = new Error("Rate limit exceeded: 429 Too Many Requests. Retry-After: 2");
    expect(parse429RetryDelay(errWithMessage)).toBe(2000);

    // 3. From error message "try again in 1.5s"
    const errWithTryAgain = new Error("Provider rate limit reached. Please try again in 1.5s.");
    expect(parse429RetryDelay(errWithTryAgain)).toBe(1500);

    // 4. Fallback default for 429 error without explicit delay
    const errGeneric429 = new Error("HTTP 429: Too Many Requests");
    expect(parse429RetryDelay(errGeneric429)).toBe(2000);

    // 5. Non-429 error returns null
    const regularErr = new Error("Invalid API key or network timeout");
    expect(parse429RetryDelay(regularErr)).toBeNull();
  });

  it("throttles calls with a 5 RPM limiter queue", async () => {
    // With 5 RPM, at most 5 requests can execute immediately in the window.
    const queue = new ProviderThrottleQueue("test-provider", 5, 5);

    const executed: number[] = [];
    const runTask = async (id: number) => {
      return queue.run(async () => {
        executed.push(id);
      });
    };

    // First 5 tasks should execute right away
    await Promise.all([
      runTask(1),
      runTask(2),
      runTask(3),
      runTask(4),
      runTask(5),
    ]);
    expect(executed).toEqual([1, 2, 3, 4, 5]);
  });

  it("retries on 429 with Retry-After: 2 after waiting 2s", async () => {
    vi.useFakeTimers();

    const customChain: ModelChainEntry[] = [
      {
        provider: "mock-provider",
        modelId: "mock-model",
        raw: "mock-provider:mock-model",
        config: {
          name: "mock-provider",
          type: "openai-compatible",
          baseUrl: "http://localhost:11434/v1",
          structured: "json_schema",
          vision: false,
          maxConcurrency: 1,
        },
      },
    ];

    let attempts = 0;
    const runner = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("HTTP 429 Too Many Requests (Retry-After: 2)");
      }
      return { success: true };
    });

    const executionPromise = executeWithModelFallback(
      "default",
      runner,
      {
        customChain,
        modelResolver: () => ({} as any),
      }
    );

    // Advance time by 2000ms to resolve the sleep
    await vi.advanceTimersByTimeAsync(2000);

    const result = await executionPromise;
    expect(result).toEqual({ success: true });
    expect(attempts).toBe(2);

    vi.useRealTimers();
  });
});
