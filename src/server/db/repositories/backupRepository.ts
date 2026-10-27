import zlib from 'zlib';
import { promisify } from 'util';
import type { PoolClient } from 'pg';
import { withDb, getPool } from '../storage';

/**
 * Kopie zapasowe danych gracza: kolekcja, klasery, talie i lista życzeń.
 *
 * - `daily`: kopia robiona raz na dobę, tuż po północy (czas polski), czyli stan z końca poprzedniego dnia.
 *   Trzymamy tylko jedną, każda nowa nadpisuje poprzednią.
 * - `before_restore`: stan sprzed ostatniego przywrócenia, żeby gracz mógł je cofnąć.
 *
 * Wiersze tabel zapisujemy w całości (bez user_id) jako spakowany JSON, więc przywrócenie
 * odtwarza je z tymi samymi id: linki do talii, polubienia i plakietki „z talii” zostają.
 */

export type BackupKind = 'daily' | 'before_restore';
export const BACKUP_KINDS: BackupKind[] = ['daily', 'before_restore'];

export interface BackupSummary {
  kind: BackupKind;
  createdAt: string;
  /** Liczba sztuk kart w kolekcji (zwykłe + foil). */
  cards: number;
  /** Liczba pozycji kolekcji. */
  entries: number;
  catalogs: number;
  decks: number;
  wishlist: number;
}

/** Błąd pokazywany użytkownikowi wprost (np. brak kopii). */
export class BackupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Kolejność ma znaczenie przy przywracaniu: najpierw klasery, potem reszta. */
const TABLES = ['user_catalogs', 'user_collections', 'user_decks', 'user_wishlists'] as const;
type BackupTable = (typeof TABLES)[number];

interface BackupPayload {
  version: 1;
  createdAt: string;
  tables: Record<BackupTable, Array<Record<string, unknown>>>;
}

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/** Duże kolekcje: dłuższy limit niż domyślne 4 s dla zwykłych zapytań. */
const LONG_TIMEOUT_MS = 60_000;
const q = (client: PoolClient, text: string, values: unknown[] = []) =>
  client.query({ text, values, query_timeout: LONG_TIMEOUT_MS } as any);

const SUMMARY_SQL = `
  SELECT
    (SELECT COALESCE(SUM(COALESCE(quantity, 0) + COALESCE(quantity_foil, 0)), 0) FROM user_collections WHERE user_id = $1)::int AS cards,
    (SELECT COUNT(*) FROM user_collections WHERE user_id = $1)::int AS entries,
    (SELECT COUNT(*) FROM user_catalogs WHERE user_id = $1)::int AS catalogs,
    (SELECT COUNT(*) FROM user_decks WHERE user_id = $1)::int AS decks,
    (SELECT COUNT(*) FROM user_wishlists WHERE user_id = $1)::int AS wishlist`;

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new BackupError('Kopie zapasowe działają tylko z bazą danych.', 503);
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Odczyt wszystkich danych gracza w jednym spójnym stanie (pełny JSON i podsumowanie). */
async function readUserData(client: PoolClient, userId: string): Promise<{ json: string; summary: Omit<BackupSummary, 'kind'> }> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const createdAt = new Date().toISOString();
    const parts: string[] = [];
    for (const table of TABLES) {
      const res = await q(
        client,
        `SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'user_id'), '[]'::jsonb)::text AS rows FROM ${table} t WHERE t.user_id = $1`,
        [userId]
      );
      parts.push(`${JSON.stringify(table)}:${res.rows[0].rows}`);
    }
    const sum = (await q(client, SUMMARY_SQL, [userId])).rows[0];
    await client.query('COMMIT');
    return {
      json: `{"version":1,"createdAt":${JSON.stringify(createdAt)},"tables":{${parts.join(',')}}}`,
      summary: { createdAt, cards: sum.cards, entries: sum.entries, catalogs: sum.catalogs, decks: sum.decks, wishlist: sum.wishlist }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

async function storeBackup(client: PoolClient, userId: string, kind: BackupKind, json: string, summary: Omit<BackupSummary, 'kind'>) {
  const data = await gzip(Buffer.from(json, 'utf8'));
  await q(
    client,
    `INSERT INTO user_backups (user_id, kind, created_at, summary, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, kind) DO UPDATE SET created_at = EXCLUDED.created_at, summary = EXCLUDED.summary, data = EXCLUDED.data`,
    [userId, kind, summary.createdAt, JSON.stringify(summary), data]
  );
}

/** Tworzy (nadpisuje) kopię danego rodzaju z bieżącego stanu konta. */
export async function createBackup(userId: string, kind: BackupKind): Promise<BackupSummary | null> {
  return withDb(
    () =>
      withClient(async (client) => {
        const { json, summary } = await readUserData(client, userId);
        await storeBackup(client, userId, kind, json, summary);
        return { kind, ...summary };
      }),
    () => null
  );
}

/** Kopie gracza (bez danych), najnowsze najpierw. */
export async function listBackups(userId: string): Promise<BackupSummary[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT kind, created_at, summary FROM user_backups WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return res.rows.map((r) => ({
        ...(r.summary || {}),
        kind: r.kind as BackupKind,
        createdAt: new Date(r.created_at).toISOString()
      }));
    },
    () => []
  );
}

async function loadPayload(client: PoolClient, userId: string, kind: BackupKind): Promise<{ payload: BackupPayload; json: string }> {
  const res = await q(client, 'SELECT data FROM user_backups WHERE user_id = $1 AND kind = $2', [userId, kind]);
  if (!res.rows[0]) throw new BackupError('Nie ma takiej kopii zapasowej.', 404);
  const json = (await gunzip(res.rows[0].data)).toString('utf8');
  const payload = JSON.parse(json) as BackupPayload;
  if (payload?.version !== 1 || !payload.tables) throw new BackupError('Kopia zapasowa jest uszkodzona.', 422);
  return { payload, json };
}

/** Kopia jako plik JSON do pobrania. */
export async function getBackupJson(userId: string, kind: BackupKind): Promise<{ json: string; createdAt: string }> {
  return withDb(
    () =>
      withClient(async (client) => {
        const { payload, json } = await loadPayload(client, userId, kind);
        return { json, createdAt: payload.createdAt };
      }),
    () => {
      throw new BackupError('Kopie zapasowe działają tylko z bazą danych.', 503);
    }
  );
}

const columnsCache = new Map<string, string[]>();
async function tableColumns(client: PoolClient, table: BackupTable): Promise<string[]> {
  const cached = columnsCache.get(table);
  if (cached) return cached;
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    [table]
  );
  const cols = res.rows.map((r) => r.column_name as string);
  columnsCache.set(table, cols);
  return cols;
}

/**
 * Przywraca konto do stanu z kopii. Najpierw zapisuje bieżący stan jako `before_restore`,
 * żeby dało się to cofnąć (przywrócenie `before_restore` zamienia więc oba stany miejscami).
 */
export async function restoreBackup(userId: string, kind: BackupKind): Promise<BackupSummary> {
  return withDb(
    () =>
      withClient(async (client) => {
        const { payload } = await loadPayload(client, userId, kind);

        const current = await readUserData(client, userId);
        await storeBackup(client, userId, 'before_restore', current.json, current.summary);

        await client.query('BEGIN');
        try {
          // Ta sama blokada co przy tworzeniu głównego klasera.
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalogs:${userId}`]);
          for (const table of TABLES) {
            const rows = Array.isArray(payload.tables[table]) ? payload.tables[table] : [];
            const ids = rows.map((r) => String(r.id));
            // Usuwamy to, czego w kopii nie ma; resztę nadpisujemy z zachowaniem id.
            await q(client, `DELETE FROM ${table} WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))`, [userId, ids]);
            if (!rows.length) continue;

            const tableCols = new Set(await tableColumns(client, table));
            const backupCols = new Set(rows.flatMap((r) => Object.keys(r)));
            // Kolumny dodane po zrobieniu kopii dostają wartości domyślne.
            const cols = [...backupCols].filter((c) => c !== 'user_id' && tableCols.has(c) && /^[a-z_][a-z0-9_]*$/.test(c));
            if (!cols.includes('id')) throw new BackupError('Kopia zapasowa jest uszkodzona.', 422);
            const list = cols.map((c) => `"${c}"`).join(', ');
            const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`);
            await q(
              client,
              `INSERT INTO ${table} (user_id, ${list})
               SELECT $1, ${list} FROM jsonb_populate_recordset(NULL::${table}, $2::jsonb)
               ON CONFLICT (id) DO ${updates.length ? `UPDATE SET ${updates.join(', ')} WHERE ${table}.user_id = EXCLUDED.user_id` : 'NOTHING'}`,
              [userId, JSON.stringify(rows)]
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        }

        const sum = (await client.query(SUMMARY_SQL, [userId])).rows[0];
        return { kind, createdAt: payload.createdAt, ...sum };
      }),
    () => {
      throw new BackupError('Kopie zapasowe działają tylko z bazą danych.', 503);
    }
  );
}

/**
 * Gracze z danymi, którzy nie mają jeszcze dzisiejszej kopii dziennej
 * (dzień liczony od północy czasu polskiego).
 */
export async function usersNeedingDailyBackup(limit = 100): Promise<string[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT u.id FROM users u
          WHERE (EXISTS (SELECT 1 FROM user_collections c WHERE c.user_id = u.id)
              OR EXISTS (SELECT 1 FROM user_decks d WHERE d.user_id = u.id)
              OR EXISTS (SELECT 1 FROM user_wishlists w WHERE w.user_id = u.id))
            AND NOT EXISTS (
              SELECT 1 FROM user_backups b
               WHERE b.user_id = u.id AND b.kind = 'daily'
                 AND b.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw')
            )
          LIMIT $1`,
        [limit]
      );
      return res.rows.map((r) => r.id as string);
    },
    () => []
  );
}
