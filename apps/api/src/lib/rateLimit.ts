import { redis } from "../redis";
import { AppError } from "./errors";

const local = new Map<string, number>();

/**
 * Fixed-window rate limiter. With Redis, INCR + EXPIRE run atomically in a
 * MULTI block so the limit holds across every API instance; without it, the
 * count is kept per instance.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  let count: number;
  if (redis) {
    const res = await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec();
    count = Number(res?.[0]?.[1] ?? 0);
  } else {
    count = (local.get(bucket) ?? 0) + 1;
    local.set(bucket, count);
    setTimeout(() => local.delete(bucket), windowSeconds * 1000).unref();
  }
  if (count > limit) throw new AppError("RATE_LIMITED", "Too many requests, slow down");
}
