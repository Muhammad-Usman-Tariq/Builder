import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { z } from "zod";
import {
  createLanguageModel,
  type ModelChainEntry,
} from "../models/chain.js";
import {
  generateStructured,
  generateStructuredWithFallback,
  extractJsonFromText,
} from "../pipelines/structured.js";
import {
  pingAiProvider,
  type UniversalAiProviderConfig,
} from "@builder/config/env";

const TestSchema = z.object({
  title: z.string(),
  count: z.number(),
});

describe("Universal AI Providers with Local Fake OpenAI-Compatible Server", () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  // Track requests and responses for assertions
  let requestLogs: Array<{
    url: string;
    method: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  }> = [];

  // Handler hook to customize response behavior per test
  let responseHandler: (
    req: http.IncomingMessage,
    body: any,
    res: http.ServerResponse
  ) => boolean = () => false;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let parsedBody: any = null;
        if (raw) {
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            parsedBody = raw;
          }
        }

        requestLogs.push({
          url: req.url || "",
          method: req.method || "",
          headers: req.headers,
          body: parsedBody,
        });

        // Ping endpoint
        if (req.url === "/v1/models" || req.url === "/models") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [{ id: "mock-model" }],
            })
          );
          return;
        }

        // Custom test handler hook
        if (responseHandler(req, parsedBody, res)) {
          return;
        }

        // Default OpenAI completions response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify({ title: "Default Site", count: 1 }),
                },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
          baseUrl = `http://127.0.0.1:${serverPort}/v1`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function resetState() {
    requestLogs = [];
    responseHandler = () => false;
  }

  it("extractJsonFromText parses markdown blocks and raw text", () => {
    const rawFenced = "Here is the response:\n```json\n{\"title\": \"Fenced\", \"count\": 99}\n```\nEnjoy!";
    expect(extractJsonFromText(rawFenced)).toEqual({ title: "Fenced", count: 99 });

    const rawDirect = "   {\"title\": \"Direct\", \"count\": 42}   ";
    expect(extractJsonFromText(rawDirect)).toEqual({ title: "Direct", count: 42 });

    const rawInText = "Leading text {\"title\": \"Inside\", \"count\": 7} trailing notes";
    expect(extractJsonFromText(rawInText)).toEqual({ title: "Inside", count: 7 });

    expect(() => extractJsonFromText("No JSON here")).toThrow();
  });

  it("pings provider connectivity and measures latency", async () => {
    resetState();

    const config: UniversalAiProviderConfig = {
      name: "local_mock",
      type: "openai-compatible",
      baseUrl,
      structured: "json_schema",
      vision: false,
    };

    const ping = await pingAiProvider(config);
    expect(ping.reachable).toBe(true);
    expect(ping.latencyMs).toBeGreaterThanOrEqual(0);
    expect(ping.statusCode).toBe(200);
  });

  it("verifies structured output mode: json_schema with native schema and recovery", async () => {
    resetState();

    let attempts = 0;
    responseHandler = (_req, _body, res) => {
      attempts++;
      if (attempts === 1) {
        // First attempt fails schema validation: count is a string instead of number
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-1",
            object: "chat.completion",
            created: Date.now(),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify({ title: "Invalid", count: "not-a-number" }),
                },
                finish_reason: "stop",
              },
            ],
          })
        );
        return true;
      }

      // Second attempt (repair attempt): return valid schema
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-2",
          object: "chat.completion",
          created: Date.now(),
          model: "mock-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({ title: "Repaired Schema", count: 42 }),
              },
              finish_reason: "stop",
            },
          ],
        })
      );
      return true;
    };

    const entry: ModelChainEntry = {
      provider: "mock_provider",
      modelId: "mock-model",
      raw: "mock_provider:mock-model",
      config: {
        name: "mock_provider",
        type: "openai-compatible",
        baseUrl,
        structured: "json_schema",
        vision: false,
      },
    };

    const model = createLanguageModel(entry);
    const result = await generateStructured({
      model,
      entry,
      schema: TestSchema,
      system: "You are a test system.",
      prompt: "Generate test data",
    });

    expect(result).toEqual({ title: "Repaired Schema", count: 42 });
    expect(attempts).toBe(2);
  });

  it("verifies structured output mode: json_mode with repair attempt", async () => {
    resetState();

    let attempts = 0;
    responseHandler = (_req, _body, res) => {
      attempts++;
      if (attempts === 1) {
        // First attempt returns invalid JSON
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-json-1",
            object: "chat.completion",
            created: Date.now(),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Invalid raw JSON text",
                },
                finish_reason: "stop",
              },
            ],
          })
        );
        return true;
      }

      // Repair attempt returns valid JSON
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-json-2",
          object: "chat.completion",
          created: Date.now(),
          model: "mock-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({ title: "JSON Mode Valid", count: 100 }),
              },
              finish_reason: "stop",
            },
          ],
        })
      );
      return true;
    };

    const entry: ModelChainEntry = {
      provider: "mock_json_mode",
      modelId: "mock-model",
      raw: "mock_json_mode:mock-model",
      config: {
        name: "mock_json_mode",
        type: "openai-compatible",
        baseUrl,
        structured: "json_mode",
        vision: false,
      },
    };

    const model = createLanguageModel(entry);
    const result = await generateStructured({
      model,
      entry,
      schema: TestSchema,
      system: "You are a test system.",
      prompt: "Generate in json mode",
    });

    expect(result).toEqual({ title: "JSON Mode Valid", count: 100 });
    expect(attempts).toBe(2);
  });

  it("verifies structured output mode: prompt mode with markdown codeblock extraction and repair", async () => {
    resetState();

    let attempts = 0;
    responseHandler = (_req, _body, res) => {
      attempts++;
      if (attempts === 1) {
        // First attempt: returns conversational text without JSON
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-prompt-1",
            object: "chat.completion",
            created: Date.now(),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "I forgot to include the JSON in my answer.",
                },
                finish_reason: "stop",
              },
            ],
          })
        );
        return true;
      }

      // Repair attempt: returns markdown codeblock
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-prompt-2",
          object: "chat.completion",
          created: Date.now(),
          model: "mock-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Here is your JSON output:\n```json\n{\"title\": \"Prompt Mode Site\", \"count\": 77}\n```",
              },
              finish_reason: "stop",
            },
          ],
        })
      );
      return true;
    };

    const entry: ModelChainEntry = {
      provider: "mock_prompt_mode",
      modelId: "mock-model",
      raw: "mock_prompt_mode:mock-model",
      config: {
        name: "mock_prompt_mode",
        type: "openai-compatible",
        baseUrl,
        structured: "prompt",
        vision: false,
      },
    };

    const model = createLanguageModel(entry);
    const result = await generateStructured({
      model,
      entry,
      schema: TestSchema,
      system: "You are a test system.",
      prompt: "Generate with prompt schema",
    });

    expect(result).toEqual({ title: "Prompt Mode Site", count: 77 });
    expect(attempts).toBe(2);
  });

  it("fails over from primary provider to secondary provider when primary fails", async () => {
    resetState();

    const customChain: ModelChainEntry[] = [
      {
        provider: "primary_fail",
        modelId: "model-primary",
        raw: "primary_fail:model-primary",
        config: {
          name: "primary_fail",
          type: "openai-compatible",
          baseUrl: `${baseUrl}/primary`,
          structured: "json_schema",
          vision: false,
        },
      },
      {
        provider: "secondary_pass",
        modelId: "model-secondary",
        raw: "secondary_pass:model-secondary",
        config: {
          name: "secondary_pass",
          type: "openai-compatible",
          baseUrl: `${baseUrl}/secondary`,
          structured: "json_schema",
          vision: false,
        },
      },
    ];

    responseHandler = (req, _body, res) => {
      if (req.url?.includes("/primary")) {
        // Primary returns 400 client error (e.g. model decommissioned)
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "Model 'model-primary' not found or decommissioned" },
          })
        );
        return true;
      }

      if (req.url?.includes("/secondary")) {
        // Secondary returns valid response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-secondary",
            object: "chat.completion",
            created: Date.now(),
            model: "model-secondary",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify({ title: "Secondary Succeeded", count: 888 }),
                },
                finish_reason: "stop",
              },
            ],
          })
        );
        return true;
      }

      return false;
    };

    const result = await generateStructuredWithFallback({
      task: "default",
      schema: TestSchema,
      system: "Test failover",
      prompt: "Run failover test",
      customChain,
    });

    expect(result).toEqual({ title: "Secondary Succeeded", count: 888 });

    // Verify both endpoints were called in sequence
    const urls = requestLogs.map((l) => l.url);
    expect(urls.some((u) => u.includes("/primary"))).toBe(true);
    expect(urls.some((u) => u.includes("/secondary"))).toBe(true);
  });
});
