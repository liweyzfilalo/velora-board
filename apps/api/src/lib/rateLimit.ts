import { redis } from "../redis";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter backed by Redis, so the limit holds across every
 * API instance. INCR + EXPIRE run atomically in a MULTI block.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const res = await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec();
  const count = Number(res?.[0]?.[1] ?? 0);
  if (count > limit) throw new AppError("RATE_LIMITED", "Too many requests, slow down");
}
