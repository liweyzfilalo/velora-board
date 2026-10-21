import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
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

async function main(): Promise<void> {
  await migrate();

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));
  app.use(router);

  const server = createServer(app);
  const io: IoServer = new Server(server, {
    cors: { origin: config.corsOrigin },
    // Redis pub/sub fan-out: events emitted on one instance reach clients connected to any other.
    adapter: createAdapter(pubClient, subClient),
  });
  setIo(io);
  registerRealtime(io);

  server.listen(config.port, () => {
    console.log(`[api] ${config.instanceId} listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    io.close();
    await Promise.allSettled([pool.end(), redis.quit(), pubClient.quit(), subClient.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[api] failed to start", err);
  process.exit(1);
});
