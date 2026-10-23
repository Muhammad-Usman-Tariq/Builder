import { Redis, type RedisOptions } from "ioredis";
import { getEnv } from "@builder/config";

/**
 * Creates an ioredis connection configured for BullMQ and Upstash / standard Redis TCP.
 */
export function createRedisConnection(customUrl?: string, customOptions?: RedisOptions): Redis {
  let redisUrl = customUrl;

  if (!redisUrl) {
    try {
      redisUrl = getEnv().REDIS_URL;
    } catch {
      redisUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    }
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 150, 4000),
    reconnectOnError: (err) => {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT", "EADDRNOTAVAIL", "ECONNREFUSED"];
      return targetErrors.some((target) => err.message.includes(target));
    },
    ...customOptions,
  });

  let lastWarningTime = 0;
  client.on("error", (err: any) => {
    const code = err?.code || "";
    const msg = err?.message || String(err);
    const isConnError =
      code === "ECONNRESET" ||
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      msg.includes("ECONNRESET") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("getaddrinfo");

    const now = Date.now();
    if (isConnError) {
      if (now - lastWarningTime > 10000) {
        lastWarningTime = now;
        console.warn("[Redis] Redis connection lost, reconnecting…");
      }
    } else {
      if (now - lastWarningTime > 10000) {
        lastWarningTime = now;
        console.warn(`[Redis] Connection warning: ${msg}`);
      }
    }
  });

  return client;
}

let sharedRedis: Redis | null = null;

export function getSharedRedis(): Redis {
  if (!sharedRedis) {
    sharedRedis = createRedisConnection();
  }
  return sharedRedis;
}
