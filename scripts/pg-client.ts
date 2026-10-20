/**
 * Postgres client for CLI scripts. Default: node-postgres over TCP 5432.
 * PG_TRANSPORT=websocket uses Neon's serverless driver over WSS (port 443) – for networks
 * that block outbound 5432. Both expose the same connect/query/end API.
 */
import { Client as PgClient } from "pg";

type Q = { rows: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface ScriptClient {
  connect(): Promise<unknown>;
  query<T = any>(text: string, values?: unknown[]): Promise<Q & { rows: T[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  end(): Promise<unknown>;
}

export async function makeClient(url: string): Promise<ScriptClient> {
  if (process.env.PG_TRANSPORT === "websocket") {
    const { Client, neonConfig } = await import("@neondatabase/serverless");
    const { default: ws } = await import("ws");
    neonConfig.webSocketConstructor = ws;
    return new Client({ connectionString: url }) as unknown as ScriptClient;
  }
  return new PgClient({ connectionString: url }) as unknown as ScriptClient;
}
