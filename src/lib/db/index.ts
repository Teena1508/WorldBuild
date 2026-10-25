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

function getPgliteDataDir(): string {
  if (
    process.env.PG_IN_MEMORY === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.argv.some((arg) => arg.includes('test'))
  ) {
    return 'memory://';
  }
  const dataDir = path.resolve(process.cwd(), '.data/postgres');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export async function resetPgliteInstance(): Promise<void> {
  cachedAppliedMigrations = null;
  if (globalPglite) {
    try {
      await globalPglite.close();
    } catch {
      // ignore
    }
    globalPglite = null;
  }
  const pidFile = path.resolve(process.cwd(), '.data/postgres/postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // ignore
    }
  }
}

async function getPgliteInstance(): Promise<PGlite> {
  if (!globalPglite) {
    const dataDir = getPgliteDataDir();
    const pidFile = path.resolve(process.cwd(), '.data/postgres/postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch {
        // ignore
      }
    }

    const tryInit = async (): Promise<PGlite> => {
      const instance = new PGlite(dataDir);
      await instance.waitReady;
      return instance;
    };

    try {
      globalPglite = await tryInit();
    } catch (startErr: unknown) {
      console.warn('Initial PGlite connection attempt note:', startErr);
      if (fs.existsSync(pidFile)) {
        try {
          fs.unlinkSync(pidFile);
        } catch {
          // ignore
        }
      }

      try {
        globalPglite = await tryInit();
      } catch (retryErr: unknown) {
        if (dataDir === 'memory://') {
          throw retryErr;
        }

        console.warn('PGlite data directory is corrupted or unrecoverable. Performing automatic safety backup and fresh recovery...');
        const corruptBackup = path.resolve(process.cwd(), `.data/postgres_corrupted_${Date.now()}`);
        try {
          if (fs.existsSync(dataDir)) {
            fs.renameSync(dataDir, corruptBackup);
          }
          fs.mkdirSync(dataDir, { recursive: true });
        } catch (backupErr) {
          console.error('Failed to move corrupted PGlite data directory:', backupErr);
          throw retryErr;
        }

        cachedAppliedMigrations = null;
        globalPglite = await tryInit();
        console.info(`PGlite successfully recovered fresh database. Previous corrupted data preserved at ${corruptBackup}`);
      }
    }
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

let migrationLock: Promise<void> | null = null;
let cachedAppliedMigrations: Set<string> | null = null;

export async function runMigrations(): Promise<void> {
  if (migrationLock) {
    await migrationLock;
    return;
  }

  migrationLock = (async () => {
    const migrationsDir = path.resolve(process.cwd(), 'src/lib/db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (cachedAppliedMigrations && files.every((f) => cachedAppliedMigrations!.has(f))) {
      return;
    }

    const trackerSql = `
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    if (isUsingRemotePostgres()) {
      const pool = getPgPool();
      const client = await pool.connect();
      try {
        await client.query(trackerSql);
        const res = await client.query('SELECT filename FROM _schema_migrations');
        const recorded = new Set(res.rows.map((r: { filename: string }) => r.filename));

        for (const file of files) {
          if (!recorded.has(file)) {
            const fullPath = path.join(migrationsDir, file);
            const ddl = fs.readFileSync(fullPath, 'utf8');
            await client.query(ddl);
            await client.query('INSERT INTO _schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
            recorded.add(file);
          }
        }
        cachedAppliedMigrations = recorded;
      } finally {
        client.release();
      }
    } else {
      const db = await getPgliteInstance();
      await db.exec(trackerSql);

      // Clean up any orphaned composite types that have no backing pg_class entry
      try {
        await db.query(`
          DELETE FROM pg_type
          WHERE typtype = 'c'
            AND typrelid != 0
            AND NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = pg_type.typrelid)
        `);
      } catch {
        // ignore if system catalog query is restricted
      }

      const res = await db.query<{ filename: string }>('SELECT filename FROM _schema_migrations');
      const recorded = new Set((res.rows || []).map((r) => r.filename));

      for (const file of files) {
        if (!recorded.has(file)) {
          const fullPath = path.join(migrationsDir, file);
          const ddl = fs.readFileSync(fullPath, 'utf8');
          const safeFile = file.replace(/'/g, "''");
          try {
            await db.exec(ddl);
            await db.query(`INSERT INTO _schema_migrations (filename) VALUES ('${safeFile}') ON CONFLICT DO NOTHING`);
            recorded.add(file);
          } catch (mErr: unknown) {
            const mMsg = mErr instanceof Error ? mErr.message : String(mErr);
            // If the schema elements already exist on disk (e.g. from concurrent process), mark applied
            if (
              mMsg.includes('already exists') ||
              mMsg.includes('duplicate key') ||
              mMsg.includes('pg_attribute') ||
              mMsg.includes('duplicate_column') ||
              mMsg.includes('duplicate_object')
            ) {
              await db.query(`INSERT INTO _schema_migrations (filename) VALUES ('${safeFile}') ON CONFLICT DO NOTHING`);
              recorded.add(file);
            } else {
              throw mErr;
            }
          }
        }
      }
      cachedAppliedMigrations = recorded;
    }
  })();

  try {
    await migrationLock;
  } catch (mLockErr: unknown) {
    const lockMsg = mLockErr instanceof Error ? mLockErr.message : String(mLockErr);
    if (lockMsg.includes('pg_attribute') || lockMsg.includes('postmaster.pid') || lockMsg.includes('Aborted()')) {
      await resetPgliteInstance();
    }
    throw mLockErr;
  } finally {
    migrationLock = null;
  }
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
    try {
      const db = await getPgliteInstance();
      const res = await db.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rows.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('Aborted()') ||
        msg.includes('postmaster.pid') ||
        msg.includes('lock') ||
        msg.includes('pg_attribute') ||
        msg.includes('duplicate key')
      ) {
        await resetPgliteInstance();
        await runMigrations();
        const db = await getPgliteInstance();
        const res = await db.query(sql, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rows.length,
        };
      }
      throw err;
    }
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
  cachedAppliedMigrations = null;
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

