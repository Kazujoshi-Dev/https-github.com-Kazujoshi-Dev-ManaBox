import crypto from 'crypto';
import { withDb, readJsonFile, writeJsonAtomic, SESSIONS_FILE } from '../storage';

/** Sesja wygasa po tylu dniach bez aktywności. */
export const SESSION_IDLE_DAYS = 7;
/** Maksymalny czas życia sesji, niezależnie od aktywności. */
export const SESSION_MAX_DAYS = 30;
/** Jak często (najwyżej) aktualizujemy last_used_at, żeby nie pisać do bazy przy każdym zapytaniu. */
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DbSession {
  id: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  ip: string | null;
}

function mapRow(r: any): DbSession {
  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  return {
    id: r.id,
    userId: r.user_id ?? r.userId,
    createdAt: iso(r.created_at ?? r.createdAt)!,
    lastUsedAt: iso(r.last_used_at ?? r.lastUsedAt)!,
    expiresAt: iso(r.expires_at ?? r.expiresAt)!,
    revokedAt: iso(r.revoked_at ?? r.revokedAt),
    userAgent: r.user_agent ?? r.userAgent ?? null,
    ip: r.ip ?? null
  };
}

/** Czy sesja jest nadal ważna (nieodwołana, nieprzeterminowana, aktywna w ostatnich dniach). */
export function isSessionActive(s: DbSession | null, now = Date.now()): s is DbSession {
  if (!s || s.revokedAt) return false;
  if (new Date(s.expiresAt).getTime() <= now) return false;
  if (new Date(s.lastUsedAt).getTime() + SESSION_IDLE_DAYS * DAY_MS <= now) return false;
  return true;
}

export async function createSession(userId: string, userAgent?: string, ip?: string): Promise<DbSession> {
  const now = new Date();
  const session: DbSession = {
    id: crypto.randomBytes(24).toString('hex'),
    userId,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MAX_DAYS * DAY_MS).toISOString(),
    revokedAt: null,
    userAgent: (userAgent || '').slice(0, 255) || null,
    ip: (ip || '').slice(0, 64) || null
  };
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_sessions (id, user_id, created_at, last_used_at, expires_at, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [session.id, userId, session.createdAt, session.lastUsedAt, session.expiresAt, session.userAgent, session.ip]
      );
      return session;
    },
    () => {
      const all = readJsonFile<DbSession[]>(SESSIONS_FILE, []);
      const fresh = all.filter((s) => isSessionActive(s));
      fresh.push(session);
      writeJsonAtomic(SESSIONS_FILE, fresh);
      return session;
    }
  );
}

export async function getSession(id: string): Promise<DbSession | null> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM user_sessions WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    () => readJsonFile<DbSession[]>(SESSIONS_FILE, []).find((s) => s.id === id) || null
  );
}

/** Przedłuża sesję (aktualizuje last_used_at), ale nie częściej niż co TOUCH_INTERVAL_MS. */
export async function touchSession(s: DbSession): Promise<void> {
  if (Date.now() - new Date(s.lastUsedAt).getTime() < TOUCH_INTERVAL_MS) return;
  const nowIso = new Date().toISOString();
  await withDb(
    async (p) => {
      await p.query('UPDATE user_sessions SET last_used_at = $1 WHERE id = $2', [nowIso, s.id]);
    },
    () => {
      const all = readJsonFile<DbSession[]>(SESSIONS_FILE, []);
      const found = all.find((x) => x.id === s.id);
      if (found) {
        found.lastUsedAt = nowIso;
        writeJsonAtomic(SESSIONS_FILE, all);
      }
    }
  );
}

export async function revokeSession(id: string, userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await withDb(
    async (p) => {
      await p.query(
        'UPDATE user_sessions SET revoked_at = $1 WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL',
        [nowIso, id, userId]
      );
    },
    () => {
      const all = readJsonFile<DbSession[]>(SESSIONS_FILE, []);
      const found = all.find((x) => x.id === id && x.userId === userId);
      if (found && !found.revokedAt) {
        found.revokedAt = nowIso;
        writeJsonAtomic(SESSIONS_FILE, all);
      }
    }
  );
}

/** Unieważnia wszystkie sesje użytkownika. Zwraca liczbę unieważnionych sesji. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  return withDb(
    async (p) => {
      const res = await p.query(
        'UPDATE user_sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL',
        [nowIso, userId]
      );
      return res.rowCount || 0;
    },
    () => {
      const all = readJsonFile<DbSession[]>(SESSIONS_FILE, []);
      let count = 0;
      for (const s of all) {
        if (s.userId === userId && !s.revokedAt) {
          s.revokedAt = nowIso;
          count++;
        }
      }
      writeJsonAtomic(SESSIONS_FILE, all);
      return count;
    }
  );
}

/** Usuwa z bazy sesje wygasłe lub odwołane dawno temu (porządki). */
export async function purgeOldSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - SESSION_MAX_DAYS * DAY_MS).toISOString();
  await withDb(
    async (p) => {
      await p.query(
        'DELETE FROM user_sessions WHERE expires_at < NOW() OR revoked_at < $1 OR last_used_at < $1',
        [cutoff]
      );
    },
    () => {
      const all = readJsonFile<DbSession[]>(SESSIONS_FILE, []);
      writeJsonAtomic(SESSIONS_FILE, all.filter((s) => isSessionActive(s)));
    }
  );
}
