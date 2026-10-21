import { Redis } from "ioredis";
import { config } from "./config";

/** General-purpose client: cache + rate limiting. */
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });

/** Dedicated pub/sub connections for the Socket.io adapter (a subscriber can't run other commands). */
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();

for (const [name, client] of Object.entries({ redis, pubClient, subClient })) {
  client.on("error", (err) => console.error(`[redis:${name}]`, err.message));
}
