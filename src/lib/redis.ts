import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis = process.env.REDIS_URL
  ? globalForRedis.redis ?? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 })
  : null;

if (process.env.NODE_ENV !== "production" && redis) globalForRedis.redis = redis;
