import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getServerEnv } from "@/lib/env";

let pool: Pool | null = null;

/** Shared singleton connection pool. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Run `fn` on a dedicated connection with RLS scope set to `userId`.
 * `app.user_id` is read by row-level security policies. Setting it per
 * connection (within a transaction) keeps tenant isolation consistent across
 * every query on that connection. Passing null leaves it unset (anonymous).
 */
export async function withTenant<T>(
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (userId) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Convenience: run a single parameterized query as a tenant. */
export async function queryTenant<T extends QueryResultRow>(
  userId: string | null,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return withTenant(userId, async (client) => {
    const res = await client.query(text, values);
    return res.rows as T[];
  });
}

/** Plain query without RLS scope (used by migrations, internal sys ops). */
export async function queryRaw<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, values);
  return res.rows as T[];
}
