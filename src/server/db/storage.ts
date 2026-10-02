import fs from 'fs';
import path from 'path';
import pg from 'pg';

export const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
export const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
export const ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'admin_audit.json');

let pool: pg.Pool | null = null;
let postgresActive = false;

const dbUrl = process.env.DATABASE_URL;
const pgHost = process.env.PGHOST;

if (dbUrl || pgHost) {
  try {
    const config: pg.PoolConfig = dbUrl
      ? { connectionString: dbUrl }
      : {
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || '5432', 10),
          database: process.env.PGDATABASE || 'mtg_db',
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD,
        };

    config.connectionTimeoutMillis = 2500;
    config.query_timeout = 4000;
    config.idleTimeoutMillis = 10000;
    config.max = 8;

    if (process.env.PGSSLMODE === 'require') {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new pg.Pool(config);
    pool.on('error', (err) => {
      console.warn('[DB:PG] Unexpected error on idle client:', err?.message || err);
    });
  } catch (err) {
    console.error('[DB:PG] Pool initialization failed:', err);
    pool = null;
  }
}

export function getPool(): pg.Pool | null {
  return pool;
}

export function isPostgresActive(): boolean {
  return postgresActive && pool !== null;
}

export function setPostgresActive(active: boolean): void {
  postgresActive = active;
}

export function getUserDir(userId: string): string {
  const dir = path.join(DATA_DIR, 'users', userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[DB:JSON] Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

// Atomically writes file to temporary location before renaming to prevent corruptions during unexpected termination
export function writeJsonAtomic<T>(filePath: string, data: T): void {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`[DB:JSON] Failed atomic write for ${filePath}:`, err);
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

export async function withDb<T>(
  pgOperation: (client: pg.Pool) => Promise<T>,
  fallbackOperation: () => Promise<T> | T
): Promise<T> {
  if (isPostgresActive() && pool) {
    try {
      return await pgOperation(pool);
    } catch (err: any) {
      console.warn('[DB] PostgreSQL operation error, degrading to local storage:', err?.message || err);
    }
  }
  return fallbackOperation();
}
