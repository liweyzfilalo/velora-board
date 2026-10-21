import { createServer } from "node:http";
import { createAdapter as createPostgresAdapter } from "@socket.io/postgres-adapter";
import { createAdapter as createRedisAdapter } from "@socket.io/redis-adapter";
import pg from "pg";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { config } from "./config";
import { migrate } from "./db/migrate";
import { pool } from "./db/pool";
import { pubClient, redis, subClient } from "./redis";
import { setIo, type IoServer } from "./realtime/io";
import { registerRealtime } from "./realtime/socket";
import { router } from "./routes";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "100kb" }));
app.use(router);

const server = createServer(app);

// Cross-instance fan-out: events emitted on one instance reach clients connected
// to any other. Redis pub/sub when configured, otherwise PostgreSQL LISTEN/NOTIFY.
const adapterPool = pubClient ? null : new pg.Pool({ connectionString: config.databaseDirectUrl, max: 2 });
const io: IoServer = new Server(server, {
  cors: { origin: config.corsOrigin },
  adapter: pubClient && subClient ? createRedisAdapter(pubClient, subClient) : createPostgresAdapter(adapterPool!),
});
console.log(`[api] pub/sub via ${pubClient ? "Redis" : "PostgreSQL"}`);
setIo(io);
registerRealtime(io);

// Idempotent and guarded by an advisory lock, so concurrent cold starts are safe.
const migrated = migrate();

if (process.env.VERCEL) {
  // On Vercel the platform owns the listener: we only export the server (see below).
  migrated.catch((err) => console.error("[api] migration failed", err));
} else {
  migrated
    .then(() =>
      server.listen(config.port, () => {
        console.log(`[api] ${config.instanceId} listening on http://localhost:${config.port}`);
      }),
    )
    .catch((err) => {
      console.error("[api] failed to start", err);
      process.exit(1);
    });
}

const shutdown = async (signal: string) => {
  console.log(`[api] ${signal} received, shutting down`);
  io.close();
  await Promise.allSettled([pool.end(), adapterPool?.end(), redis?.quit(), pubClient?.quit(), subClient?.quit()]);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default server;
