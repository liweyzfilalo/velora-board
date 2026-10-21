import { pathToFileURL } from "node:url";
import { pool, withTransaction } from "./pool";
import { migrations } from "./migrations";

export async function migrate(log = console.log): Promise<void> {
  await withTransaction(async (client) => {
    // Serialise concurrent migrators (e.g. several API instances booting at once).
    await client.query("SELECT pg_advisory_xact_lock(424242)");
    const { rows: enc } = await client.query<{ server_encoding: string }>("SHOW server_encoding");
    if (enc[0]?.server_encoding !== "UTF8") {
      console.warn(`[migrate] database encoding is ${enc[0]?.server_encoding}, not UTF8: emoji and some characters will be rejected`);
    }
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.id));
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      await client.query(m.sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
      log(`[migrate] applied ${m.id}`);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  migrate()
    .then(() => console.log("[migrate] up to date"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
