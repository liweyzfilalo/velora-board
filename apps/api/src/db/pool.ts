import pg from "pg";
import { config } from "../config";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });

export type Db = pg.Pool | pg.PoolClient;

const RETRYABLE = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

/**
 * Runs `fn` inside a transaction, retrying a few times on serialization
 * failures / deadlocks so concurrent writers converge instead of erroring.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const code = (err as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 20));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
