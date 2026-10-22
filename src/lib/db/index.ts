import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';

export interface DbQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>;
}

let globalPgPool: Pool | null = null;
let globalPglite: PGlite | null = null;
let isMigrated = false;

function getPgliteDataDir(): string {
  if (process.env.PG_IN_MEMORY === 'true') {
    return 'memory://';
  }
  const dataDir = path.resolve(process.cwd(), '.data/postgres');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

async function getPgliteInstance(): Promise<PGlite> {
  if (!globalPglite) {
    const dataDir = getPgliteDataDir();
    globalPglite = new PGlite(dataDir);
  }
  return globalPglite;
}

function getPgPool(): Pool {
  if (!globalPgPool) {
    globalPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalPgPool;
}

export function isUsingRemotePostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function runMigrations(): Promise<void> {
  if (isMigrated) return;

  const migrationsDir = path.resolve(process.cwd(), 'src/lib/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const ddl = fs.readFileSync(fullPath, 'utf8');

    if (isUsingRemotePostgres()) {
      const pool = getPgPool();
      const client = await pool.connect();
      try {
        await client.query(ddl);
      } finally {
        client.release();
      }
    } else {
      const db = await getPgliteInstance();
      await db.exec(ddl);
    }
  }

  isMigrated = true;
}

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
  await runMigrations();

  if (isUsingRemotePostgres()) {
    const pool = getPgPool();
    const res = await pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  } else {
    const db = await getPgliteInstance();
    const res = await db.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rows.length,
    };
  }
}

export async function transaction<T>(
  fn: (txClient: DbClient) => Promise<T>
): Promise<T> {
  await runMigrations();

  if (isUsingRemotePostgres()) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DbClient = {
        query: async <R = unknown>(sql: string, params?: unknown[]) => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
      };
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const db = await getPgliteInstance();
    await db.query('BEGIN');
    try {
      const txClient: DbClient = {
        query: async <R = unknown>(sql: string, params?: unknown[]) => {
          const res = await db.query(sql, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rows.length,
          };
        },
      };
      const result = await fn(txClient);
      await db.query('COMMIT');
      return result;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
}

export interface DbConfig {
  isConfigured: boolean;
  provider: 'postgresql';
  connectionStatus: 'ready' | 'pending_credentials';
  mode: 'remote' | 'embedded_pglite';
}

export function getDatabaseStatus(): DbConfig {
  const hasUrl = Boolean(process.env.DATABASE_URL);
  return {
    isConfigured: true,
    provider: 'postgresql',
    connectionStatus: 'ready',
    mode: hasUrl ? 'remote' : 'embedded_pglite',
  };
}

export async function closeDatabase(): Promise<void> {
  if (globalPglite) {
    const db = globalPglite;
    globalPglite = null;
    await db.close();
  }
  if (globalPgPool) {
    const pool = globalPgPool;
    globalPgPool = null;
    await pool.end();
  }
}

