function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === "production";

/**
 * Redis is optional. Unset in production (or set to an empty string) means
 * PostgreSQL carries the cross-instance pub/sub and there is no shared cache.
 */
function redisUrl(): string | null {
  const value = process.env.REDIS_URL;
  if (value === undefined) return isProd ? null : "redis://localhost:6380";
  return value || null;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgres://velora:velora@localhost:5433/velora"),
  /** Direct (non-pooled) connection: LISTEN/NOTIFY needs a session that stays open. */
  databaseDirectUrl: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  redisUrl: redisUrl(),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-secret"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  /** Board snapshots are cached in Redis for this long (invalidated on every write). */
  snapshotTtlSeconds: 60,
  instanceId: process.env.INSTANCE_ID ?? `api-${process.pid}`,
};
