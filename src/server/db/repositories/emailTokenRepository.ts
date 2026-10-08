/**
 * Jednorazowe tokeny z linków e-mail: potwierdzenie adresu i reset hasła.
 * W bazie trzymamy tylko skrót SHA-256 tokenu: wyciek bazy nie daje działających linków.
 * Nowy token unieważnia wcześniejsze niewykorzystane tokeny tego samego rodzaju (działa tylko ostatni link).
 */
import crypto from 'crypto';
import path from 'path';
import { withDb, readJsonFile, writeJsonAtomic, DATA_DIR } from '../storage';

export type EmailTokenPurpose = 'verify' | 'reset';

const EMAIL_TOKENS_FILE = path.join(DATA_DIR, 'email_tokens.json');

interface JsonToken {
  tokenHash: string;
  userId: string;
  purpose: EmailTokenPurpose;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
const isWellFormed = (raw: unknown): raw is string => typeof raw === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(raw);

/** Tworzy nowy token i zwraca jego jawną postać (do linku). */
export async function createEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE email_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
          [userId, purpose]
        );
        await client.query(
          'INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)',
          [tokenHash, userId, purpose, expiresAt.toISOString(), now.toISOString()]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      return raw;
    },
    () => {
      const all = readJsonFile<JsonToken[]>(EMAIL_TOKENS_FILE, []).filter((t) => new Date(t.expiresAt).getTime() > Date.now());
      for (const t of all) if (t.userId === userId && t.purpose === purpose && !t.usedAt) t.usedAt = now.toISOString();
      all.push({ tokenHash, userId, purpose, expiresAt: expiresAt.toISOString(), usedAt: null, createdAt: now.toISOString() });
      writeJsonAtomic(EMAIL_TOKENS_FILE, all);
      return raw;
    }
  );
}

/** Zużywa token (tylko raz). Zwraca id użytkownika albo null, gdy token jest nieznany, zużyty lub wygasł. */
export async function consumeEmailToken(raw: unknown, purpose: EmailTokenPurpose): Promise<string | null> {
  if (!isWellFormed(raw)) return null;
  const tokenHash = hashToken(raw);
  return withDb(
    async (p) => {
      const res = await p.query(
        `UPDATE email_tokens SET used_at = NOW()
          WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
          RETURNING user_id`,
        [tokenHash, purpose]
      );
      return res.rows[0]?.user_id ?? null;
    },
    () => {
      const all = readJsonFile<JsonToken[]>(EMAIL_TOKENS_FILE, []);
      const t = all.find((x) => x.tokenHash === tokenHash && x.purpose === purpose);
      if (!t || t.usedAt || new Date(t.expiresAt).getTime() <= Date.now()) return null;
      t.usedAt = new Date().toISOString();
      writeJsonAtomic(EMAIL_TOKENS_FILE, all);
      return t.userId;
    }
  );
}

/** Sprawdza token bez zużywania go (np. zanim pokażemy formularz nowego hasła). */
export async function isEmailTokenValid(raw: unknown, purpose: EmailTokenPurpose): Promise<boolean> {
  if (!isWellFormed(raw)) return false;
  const tokenHash = hashToken(raw);
  return withDb(
    async (p) => {
      const res = await p.query(
        'SELECT 1 FROM email_tokens WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW() LIMIT 1',
        [tokenHash, purpose]
      );
      return res.rowCount! > 0;
    },
    () => {
      const t = readJsonFile<JsonToken[]>(EMAIL_TOKENS_FILE, []).find((x) => x.tokenHash === tokenHash && x.purpose === purpose);
      return Boolean(t && !t.usedAt && new Date(t.expiresAt).getTime() > Date.now());
    }
  );
}

/** Unieważnia wszystkie niewykorzystane tokeny danego rodzaju (np. po zmianie hasła). */
export async function invalidateEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
  return withDb(
    async (p) => {
      await p.query('UPDATE email_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
    },
    () => {
      const all = readJsonFile<JsonToken[]>(EMAIL_TOKENS_FILE, []);
      for (const t of all) if (t.userId === userId && t.purpose === purpose && !t.usedAt) t.usedAt = new Date().toISOString();
      writeJsonAtomic(EMAIL_TOKENS_FILE, all);
    }
  );
}

/** Usuwa tokeny przeterminowane ponad dobę temu (wykorzystane też, bo mają wtedy minioną datę ważności). */
export async function purgeOldEmailTokens(): Promise<void> {
  return withDb(
    async (p) => {
      await p.query("DELETE FROM email_tokens WHERE expires_at < NOW() - INTERVAL '1 day'");
    },
    () => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const all = readJsonFile<JsonToken[]>(EMAIL_TOKENS_FILE, []);
      const keep = all.filter((t) => new Date(t.expiresAt).getTime() >= cutoff);
      if (keep.length !== all.length) writeJsonAtomic(EMAIL_TOKENS_FILE, keep);
    }
  );
}
