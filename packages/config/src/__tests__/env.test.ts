import { describe, it, expect } from "vitest";
import {
  validateEnvironment,
  extractProvidersFromChain,
  resolveProviderConfig,
  EnvValidationError,
} from "../env.js";

const VALID_KEY_32 = Buffer.alloc(32, 7).toString("base64");

const BASE_VALID_ENV: Record<string, string> = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  API_PUBLIC_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://test_user:password@localhost:5432/test_db",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "r2-access-key",
  S3_SECRET_ACCESS_KEY: "r2-secret-key",
  S3_BUCKET: "builder-dev",
  S3_PUBLIC_URL: "https://pub.r2.dev",
  AUTH_SECRET: "this-is-a-very-secure-auth-secret-123456",
  AI_MODEL_CHAIN: "openai:gpt-4o,anthropic:claude-3-5-sonnet-20241022",
  OPENAI_API_KEY: "sk-openai-test",
  ANTHROPIC_API_KEY: "sk-anthropic-test",
  EMAIL_PROVIDER: "none",
  ENCRYPTION_KEY: VALID_KEY_32,
};

describe("Environment Validation", () => {
  it("successfully parses valid configuration with defaults", () => {
    const env = validateEnvironment(BASE_VALID_ENV);

    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_PREPARE).toBe(true);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.EMAIL_PROVIDER).toBe("none");
    expect(env.EMAIL_FROM).toBe("noreply@example.com");
  });

  it("handles DATABASE_PREPARE boolean toggle correctly", () => {
    const envFalse = validateEnvironment({
      ...BASE_VALID_ENV,
      DATABASE_PREPARE: "false",
    });
    expect(envFalse.DATABASE_PREPARE).toBe(false);

    const envTrue = validateEnvironment({
      ...BASE_VALID_ENV,
      DATABASE_PREPARE: "true",
    });
    expect(envTrue.DATABASE_PREPARE).toBe(true);
  });

  it("fails when DATABASE_URL is missing or uses unsupported protocol", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        DATABASE_URL: undefined as unknown as string,
      })
    ).toThrow(EnvValidationError);

    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      })
    ).toThrow(EnvValidationError);
  });

  it("fails when REDIS_URL does not start with redis:// or rediss://", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        REDIS_URL: "http://localhost:6379",
      })
    ).toThrow(EnvValidationError);
  });

  it("fails when ENCRYPTION_KEY is not a 32-byte key", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        ENCRYPTION_KEY: "too-short",
      })
    ).toThrow(EnvValidationError);
  });

  it("fails when an AI model chain provider lacks an API key", () => {
    const envMissingKey = { ...BASE_VALID_ENV };
    delete envMissingKey["OPENAI_API_KEY"];

    expect(() => validateEnvironment(envMissingKey)).toThrow(EnvValidationError);
  });

  it("fails when Google OAuth variables are partially configured", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "",
      })
    ).toThrow(EnvValidationError);
  });

  it("fails when EMAIL_PROVIDER is resend and RESEND_API_KEY is missing", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        EMAIL_PROVIDER: "resend",
      })
    ).toThrow(EnvValidationError);
  });

  it("fails when EMAIL_PROVIDER is smtp and SMTP details are missing", () => {
    expect(() =>
      validateEnvironment({
        ...BASE_VALID_ENV,
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.example.com",
      })
    ).toThrow(EnvValidationError);
  });

  it("succeeds when S3 storage is completely omitted (cleanly OFF)", () => {
    const noS3Env = { ...BASE_VALID_ENV };
    delete noS3Env["S3_ENDPOINT"];
    delete noS3Env["S3_ACCESS_KEY_ID"];
    delete noS3Env["S3_SECRET_ACCESS_KEY"];
    delete noS3Env["S3_BUCKET"];
    delete noS3Env["S3_PUBLIC_URL"];

    const env = validateEnvironment(noS3Env);
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it("fails when S3 storage is partially configured", () => {
    const partialS3 = {
      ...BASE_VALID_ENV,
      S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      S3_ACCESS_KEY_ID: "", // empty
    };
    expect(() => validateEnvironment(partialS3)).toThrow(EnvValidationError);
  });

  it("succeeds when AI_MODEL_CHAIN is completely omitted (cleanly OFF)", () => {
    const noAiEnv = { ...BASE_VALID_ENV };
    delete noAiEnv["AI_MODEL_CHAIN"];
    delete noAiEnv["OPENAI_API_KEY"];
    delete noAiEnv["ANTHROPIC_API_KEY"];

    const env = validateEnvironment(noAiEnv);
    expect(env.AI_MODEL_CHAIN).toBeUndefined();
  });

  it("fails when an AI model chain provider key is an empty string", () => {
    const emptyKeyEnv = {
      ...BASE_VALID_ENV,
      AI_MODEL_CHAIN: "openai:gpt-4o",
      OPENAI_API_KEY: "", // empty string counts as missing
    };
    expect(() => validateEnvironment(emptyKeyEnv)).toThrow(EnvValidationError);
  });

  describe("Universal AI Providers (Dynamic env-based)", () => {
    it("successfully parses dynamic provider with custom name, type, and apiKey", () => {
      const dynamicEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "grok:grok-beta,fast:llama-3.3-70b",
        AI_PROVIDER_GROK_TYPE: "xai",
        AI_PROVIDER_GROK_API_KEY: "xai-test-key-123",
        AI_PROVIDER_FAST_TYPE: "groq",
        AI_PROVIDER_FAST_API_KEY: "gsk-test-key-456",
        AI_PROVIDER_FAST_STRUCTURED: "json_mode",
        AI_PROVIDER_FAST_TIMEOUT_MS: "15000",
      };

      const env = validateEnvironment(dynamicEnv);
      expect(env.AI_MODEL_CHAIN).toBe("grok:grok-beta,fast:llama-3.3-70b");

      const grokConfig = resolveProviderConfig("grok", dynamicEnv);
      expect(grokConfig).toEqual({
        name: "grok",
        type: "xai",
        apiKey: "xai-test-key-123",
        baseUrl: undefined,
        headers: undefined,
        structured: "json_schema",
        vision: false,
        timeoutMs: undefined,
        maxConcurrency: 2,
        maxRpm: undefined,
      });

      const fastConfig = resolveProviderConfig("fast", dynamicEnv);
      expect(fastConfig).toEqual({
        name: "fast",
        type: "groq",
        apiKey: "gsk-test-key-456",
        baseUrl: undefined,
        headers: undefined,
        structured: "json_mode",
        vision: false,
        timeoutMs: 15000,
        maxConcurrency: 2,
        maxRpm: undefined,
      });
    });

    it("allows openai-compatible local server without API key", () => {
      const localEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "ollama:llama3,lmstudio:qwen2.5",
        AI_PROVIDER_OLLAMA_TYPE: "openai-compatible",
        AI_PROVIDER_OLLAMA_BASE_URL: "http://localhost:11434/v1",
        AI_PROVIDER_LMSTUDIO_TYPE: "openai-compatible",
        AI_PROVIDER_LMSTUDIO_BASE_URL: "http://127.0.0.1:1234/v1",
      };

      const env = validateEnvironment(localEnv);
      expect(env.AI_MODEL_CHAIN).toBe("ollama:llama3,lmstudio:qwen2.5");

      const ollamaConfig = resolveProviderConfig("ollama", localEnv);
      expect(ollamaConfig?.type).toBe("openai-compatible");
      expect(ollamaConfig?.apiKey).toBeUndefined();
      expect(ollamaConfig?.baseUrl).toBe("http://localhost:11434/v1");
    });

    it("requires AI_PROVIDER_<NAME>_BASE_URL for openai-compatible providers", () => {
      const missingBaseUrlEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "local:llama3",
        AI_PROVIDER_LOCAL_TYPE: "openai-compatible",
        // Missing AI_PROVIDER_LOCAL_BASE_URL
      };

      expect(() => validateEnvironment(missingBaseUrlEnv)).toThrow(EnvValidationError);
    });

    it("allows openai-compatible remote or LAN endpoints without API key", () => {
      const remoteLanEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "lan:meta/llama-3.1,vps:qwen-2.5",
        AI_PROVIDER_LAN_TYPE: "openai-compatible",
        AI_PROVIDER_LAN_BASE_URL: "http://192.168.1.100:8000/v1",
        AI_PROVIDER_VPS_TYPE: "openai-compatible",
        AI_PROVIDER_VPS_BASE_URL: "https://vps.example.com/v1",
      };

      const env = validateEnvironment(remoteLanEnv);
      expect(env.AI_MODEL_CHAIN).toBe("lan:meta/llama-3.1,vps:qwen-2.5");
      const lanConfig = resolveProviderConfig("lan", remoteLanEnv);
      expect(lanConfig?.apiKey).toBeUndefined();
      expect(lanConfig?.baseUrl).toBe("http://192.168.1.100:8000/v1");
      const vpsConfig = resolveProviderConfig("vps", remoteLanEnv);
      expect(vpsConfig?.apiKey).toBeUndefined();
      expect(vpsConfig?.baseUrl).toBe("https://vps.example.com/v1");
    });

    it("strictly requires API key for native cloud providers", () => {
      const cloudTypes = ["openai", "anthropic", "google", "xai", "groq", "mistral", "deepseek", "openrouter"];
      for (const cType of cloudTypes) {
        const missingKeyEnv = {
          ...BASE_VALID_ENV,
          AI_MODEL_CHAIN: "mycloud:model-1",
          AI_PROVIDER_MYCLOUD_TYPE: cType,
          // Missing AI_PROVIDER_MYCLOUD_API_KEY
        };
        expect(() => validateEnvironment(missingKeyEnv)).toThrow(EnvValidationError);
      }
    });

    it("parses custom headers JSON for provider", () => {
      const headersEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "custom:my-model",
        AI_PROVIDER_CUSTOM_TYPE: "openai-compatible",
        AI_PROVIDER_CUSTOM_BASE_URL: "http://localhost:8000/v1",
        AI_PROVIDER_CUSTOM_HEADERS: JSON.stringify({ "X-Custom-Header": "value123" }),
      };

      const env = validateEnvironment(headersEnv);
      expect(env.AI_MODEL_CHAIN).toBe("custom:my-model");

      const config = resolveProviderConfig("custom", headersEnv);
      expect(config?.headers).toEqual({ "X-Custom-Header": "value123" });
    });

    it("fails when an undefined provider is listed in a chain", () => {
      const unknownEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "unknown_vendor:some-model",
      };

      expect(() => validateEnvironment(unknownEnv)).toThrow(EnvValidationError);
    });

    it("fails when a non-vision provider is listed in AI_MODEL_CHAIN_VISION", () => {
      const nonVisionEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "openai:gpt-4o",
        AI_MODEL_CHAIN_VISION: "fast:llama-3",
        AI_PROVIDER_FAST_TYPE: "groq",
        AI_PROVIDER_FAST_API_KEY: "gsk-123",
        AI_PROVIDER_FAST_VISION: "false", // or unset
      };

      expect(() => validateEnvironment(nonVisionEnv)).toThrow(EnvValidationError);
      try {
        validateEnvironment(nonVisionEnv);
      } catch (err: any) {
        expect(err.errors["AI_MODEL_CHAIN_VISION"]?.[0]).toContain("does not support vision");
      }
    });

    it("succeeds when vision provider in AI_MODEL_CHAIN_VISION has VISION=true", () => {
      const visionEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "openai:gpt-4o",
        AI_MODEL_CHAIN_VISION: "vision_llm:custom-vision",
        AI_PROVIDER_VISION_LLM_TYPE: "openai-compatible",
        AI_PROVIDER_VISION_LLM_BASE_URL: "http://localhost:11434/v1",
        AI_PROVIDER_VISION_LLM_VISION: "true",
      };

      const env = validateEnvironment(visionEnv);
      expect(env.AI_MODEL_CHAIN_VISION).toBe("vision_llm:custom-vision");
    });

    it("preserves backward compatibility with built-in short form and keys", () => {
      const backwardEnv = {
        ...BASE_VALID_ENV,
        AI_MODEL_CHAIN: "google:gemini-1.5-pro",
        GOOGLE_API_KEY: "AIza-google-test-key",
      };

      const env = validateEnvironment(backwardEnv);
      expect(env.AI_MODEL_CHAIN).toBe("google:gemini-1.5-pro");

      const config = resolveProviderConfig("google", backwardEnv);
      expect(config).toEqual({
        name: "google",
        type: "google",
        apiKey: "AIza-google-test-key",
        structured: "json_schema",
        vision: true,
        maxConcurrency: 2,
      });
    });
  });
});

describe("extractProvidersFromChain", () => {
  it("extracts unique lowercase providers", () => {
    const providers = extractProvidersFromChain(
      "OpenAI:gpt-4o, Anthropic:claude-3-5, google:gemini-1.5-pro, openai:gpt-4o-mini"
    );
    expect(providers).toEqual(["openai", "anthropic", "google"]);
  });

  it("throws on malformed chain entries", () => {
    expect(() => extractProvidersFromChain("gpt-4o,anthropic:claude-3")).toThrow();
  });
});
