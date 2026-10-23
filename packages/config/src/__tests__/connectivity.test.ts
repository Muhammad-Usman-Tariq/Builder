import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyConnectivity, validateEnvironment } from "../env.js";

const VALID_KEY_32 = Buffer.alloc(32, 7).toString("base64");

const RAW_VALID_ENV: Record<string, string> = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  API_PUBLIC_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://test_user:password@localhost:5432/test_db",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "r2-access-key",
  S3_SECRET_ACCESS_KEY: "r2-secret-key",
  S3_BUCKET: "builder-dev",
  S3_PUBLIC_URL: "https://pub.r2.dev",
  AUTH_SECRET: "this-is-a-very-secure-auth-secret-123456",
  AI_MODEL_CHAIN: "openai:gpt-4o",
  OPENAI_API_KEY: "sk-openai-test",
  EMAIL_PROVIDER: "none",
  ENCRYPTION_KEY: VALID_KEY_32,
};

const BASE_VALID_ENV = validateEnvironment(RAW_VALID_ENV);

const BASE_CLOUDINARY_ENV = validateEnvironment({
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  API_PUBLIC_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://test_user:password@localhost:5432/test_db",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_PROVIDER: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "demo-cloud",
  CLOUDINARY_API_KEY: "demo-key",
  CLOUDINARY_API_SECRET: "demo-secret",
  AUTH_SECRET: "this-is-a-very-secure-auth-secret-123456",
  AI_MODEL_CHAIN: "openai:gpt-4o",
  OPENAI_API_KEY: "sk-openai-test",
  EMAIL_PROVIDER: "none",
  ENCRYPTION_KEY: VALID_KEY_32,
});

// Mock postgres, ioredis, and @aws-sdk/client-s3 for unit testing error formatting
vi.mock("postgres", () => {
  return {
    default: vi.fn(),
  };
});

vi.mock("ioredis", () => {
  return {
    Redis: vi.fn(),
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn(),
    HeadBucketCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
  };
});

describe("verifyConnectivity Error Formatting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws clear error when PostgreSQL is unreachable", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.reject(new Error("Connection refused: 5432"));
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    await expect(verifyConnectivity(BASE_VALID_ENV)).rejects.toThrow(
      /\[PostgreSQL\] Cannot reach database at postgres:\/\/test_user:\*\*\*@localhost:5432\/test_db/
    );
  });

  it("throws clear error when Redis is unreachable", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6379")),
        disconnect: vi.fn(),
      } as any;
    });

    await expect(verifyConnectivity(BASE_VALID_ENV)).rejects.toThrow(
      /\[Redis\] Cannot reach Redis at redis:\/\/localhost:6379/
    );
  });

  it("throws clear error when S3 Storage is unreachable", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    const { S3Client } = await import("@aws-sdk/client-s3");
    vi.mocked(S3Client).mockImplementation(() => {
      return {
        send: vi.fn().mockRejectedValue(new Error("NetworkingError: Could not resolve endpoint")),
      } as any;
    });

    await expect(verifyConnectivity(BASE_VALID_ENV)).rejects.toThrow(
      /\[Storage\] Cannot reach S3 bucket "builder-dev" at https:\/\/account\.r2\.cloudflarestorage\.com/
    );
  });

  it("succeeds when all services connect successfully", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    const { S3Client } = await import("@aws-sdk/client-s3");
    vi.mocked(S3Client).mockImplementation(() => {
      return {
        send: vi.fn().mockResolvedValue({}),
      } as any;
    });

    await expect(verifyConnectivity(BASE_VALID_ENV)).resolves.not.toThrow();
  });

  it("throws clear error when Cloudinary is unreachable", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }));

    await expect(verifyConnectivity(BASE_CLOUDINARY_ENV)).rejects.toThrow(
      /\[Storage\] Cannot reach Cloudinary "demo-cloud": Cloudinary ping returned status 401/
    );

    vi.unstubAllGlobals();
  });

  it("succeeds when Cloudinary connects successfully", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }));

    await expect(verifyConnectivity(BASE_CLOUDINARY_ENV)).resolves.not.toThrow();

    vi.unstubAllGlobals();
  });

  it("does not fail startup when AI provider ping fails, only emits a clear warning naming the provider", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    const { S3Client } = await import("@aws-sdk/client-s3");
    vi.mocked(S3Client).mockImplementation(() => {
      return {
        send: vi.fn().mockResolvedValue({}),
      } as any;
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock fetch to reject with ECONNREFUSED for Ollama endpoint
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:11434")));

    const testEnv = validateEnvironment({
      ...RAW_VALID_ENV,
      AI_MODEL_CHAIN: "ollama:llama3",
      AI_PROVIDER_OLLAMA_TYPE: "openai-compatible",
      AI_PROVIDER_OLLAMA_BASE_URL: "http://localhost:11434/v1",
    });

    // Startup must NOT throw even though the AI provider is unreachable
    await expect(verifyConnectivity(testEnv)).resolves.not.toThrow();

    // Must emit a warning naming the provider clearly
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[AI WARNING\] Provider "ollama" \(openai-compatible.*\) is unreachable/)
    );

    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("emits warnings naming each unreachable provider in a multi-model chain without stopping startup", async () => {
    const postgres = (await import("postgres")).default;
    vi.mocked(postgres).mockImplementation(() => {
      const mockSql = () => Promise.resolve([{ connected: 1 }]);
      mockSql.end = vi.fn().mockResolvedValue(undefined);
      return mockSql as any;
    });

    const { Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue("PONG"),
        disconnect: vi.fn(),
      } as any;
    });

    const { S3Client } = await import("@aws-sdk/client-s3");
    vi.mocked(S3Client).mockImplementation(() => {
      return {
        send: vi.fn().mockResolvedValue({}),
      } as any;
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock fetch to simulate 503 from OpenAI and network error from LAN host
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("openai")) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
          });
        }
        return Promise.reject(new Error("Host unreachable"));
      })
    );

    const testEnv = validateEnvironment({
      ...RAW_VALID_ENV,
      AI_MODEL_CHAIN: "openai:gpt-4o,lan:meta/llama-3.1",
      AI_PROVIDER_LAN_TYPE: "openai-compatible",
      AI_PROVIDER_LAN_BASE_URL: "http://192.168.1.50:8000/v1",
    });

    await expect(verifyConnectivity(testEnv)).resolves.not.toThrow();

    // Must warn for both providers naming each one
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[AI WARNING\] Provider "openai".*is unreachable/)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[AI WARNING\] Provider "lan".*is unreachable/)
    );

    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});


