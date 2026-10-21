import { Redis } from "ioredis";
import { config } from "./config";

/** General-purpose client: cache + rate limiting. Null when Redis is not configured. */
export const redis = config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: 3 }) : null;

/** Dedicated pub/sub connections for the Socket.io adapter (a subscriber can't run other commands). */
export const pubClient = redis?.duplicate() ?? null;
export const subClient = redis?.duplicate() ?? null;

for (const [name, client] of Object.entries({ redis, pubClient, subClient })) {
  client?.on("error", (err) => console.error(`[redis:${name}]`, err.message));
}
