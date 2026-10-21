function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgres://velora:velora@localhost:5433/velora"),
  redisUrl: required("REDIS_URL", "redis://localhost:6380"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-secret"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  /** Board snapshots are cached in Redis for this long (invalidated on every write). */
  snapshotTtlSeconds: 60,
  instanceId: process.env.INSTANCE_ID ?? `api-${process.pid}`,
};
