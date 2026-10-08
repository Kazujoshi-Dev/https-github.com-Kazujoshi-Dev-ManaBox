/**
 * Panel administratora: blokady kont, zmiana nazwy, reset hasła, ukrycie oferty,
 * usuwanie kont, statystyki i dziennik działań.
 */
import fs from 'fs';
import { DbUser, isEmailVerified } from '../types';
import { withDb, readJsonFile, writeJsonAtomic, USERS_FILE, ADMIN_AUDIT_FILE, getUserDir } from '../storage';
import { mapUserRow } from '../mappers';
import { getCollection } from './collectionRepository';
import { getWishlist } from './wishlistRepository';

/** Czy blokada konta obowiązuje teraz. */
export function isBanActive(u: Pick<DbUser, 'ban_permanent' | 'banned_until'> | null | undefined, now = Date.now()): boolean {
  if (!u) return false;
  if (u.ban_permanent) return true;
  return Boolean(u.banned_until && new Date(u.banned_until).getTime() > now);
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
  totalCards: number;
  forSaleCards: number;
  wishlistCount: number;
  city: string | null;
  bannedUntil: string | null;
  banPermanent: boolean;
  banReason: string | null;
  banned: boolean;
  mustChangePassword: boolean;
  saleHidden: boolean;
  emailVerified: boolean;
}

const iso = (v: any) => (v ? new Date(v).toISOString() : null);

export async function adminListUsers(query: string, limit: number, offset: number): Promise<{ users: AdminUserRow[]; total: number }> {
  const q = (query || '').trim().toLowerCase().slice(0, 100);
  return withDb(
    async (p) => {
      const pattern = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      const where = q ? `WHERE LOWER(u.username) LIKE $1 OR LOWER(u.email) LIKE $1` : `WHERE $1::text IS NOT NULL`;
      const total = await p.query(`SELECT COUNT(*)::int AS n FROM users u ${where}`, [pattern]);
      const res = await p.query(
        `SELECT u.*, COALESCE(c.cards, 0)::int AS total_cards, COALESCE(c.sale_cards, 0)::int AS for_sale_cards,
                COALESCE(w.n, 0)::int AS wishlist_count, pr.city AS city, s.last_active
           FROM users u
           LEFT JOIN (SELECT user_id, SUM(COALESCE(quantity,0) + COALESCE(quantity_foil,0)) AS cards,
                             SUM(CASE WHEN is_for_sale THEN COALESCE(quantity,0) + COALESCE(quantity_foil,0) ELSE 0 END) AS sale_cards
                        FROM user_collections GROUP BY user_id) c ON c.user_id = u.id
           LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM user_wishlists GROUP BY user_id) w ON w.user_id = u.id
           LEFT JOIN user_profiles pr ON pr.user_id = u.id
           LEFT JOIN (SELECT user_id, MAX(last_used_at) AS last_active FROM user_sessions GROUP BY user_id) s ON s.user_id = u.id
           ${where}
          ORDER BY u.created_at DESC
          LIMIT $2 OFFSET $3`,
        [pattern, limit, offset]
      );
      return {
        total: total.rows[0].n,
        users: res.rows.map((r) => {
          const u = mapUserRow(r);
          return {
            id: u.id,
            username: u.username,
            email: u.email,
            createdAt: u.created_at,
            lastActiveAt: iso(r.last_active),
            totalCards: r.total_cards,
            forSaleCards: r.for_sale_cards,
            wishlistCount: r.wishlist_count,
            city: r.city || null,
            bannedUntil: u.banned_until || null,
            banPermanent: Boolean(u.ban_permanent),
            banReason: u.ban_reason || null,
            banned: isBanActive(u),
            mustChangePassword: Boolean(u.must_change_password),
            saleHidden: Boolean(u.sale_hidden),
            emailVerified: isEmailVerified(u)
          };
        })
      };
    },
    async () => {
      const all = readJsonFile<DbUser[]>(USERS_FILE, [])
        .filter((u) => !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const page = all.slice(offset, offset + limit);
      const users: AdminUserRow[] = [];
      for (const u of page) {
        const col: any[] = await getCollection(u.id).catch(() => []);
        const wl = await getWishlist(u.id).catch(() => []);
        const qty = (i: any) => (i.quantity || 0) + (i.quantityFoil || 0);
        users.push({
          id: u.id,
          username: u.username,
          email: u.email,
          createdAt: u.created_at,
          lastActiveAt: null,
          totalCards: col.reduce((s, i) => s + qty(i), 0),
          forSaleCards: col.filter((i) => i.isForSale).reduce((s, i) => s + qty(i), 0),
          wishlistCount: wl.length,
          city: null,
          bannedUntil: u.banned_until || null,
          banPermanent: Boolean(u.ban_permanent),
          banReason: u.ban_reason || null,
          banned: isBanActive(u),
          mustChangePassword: Boolean(u.must_change_password),
          saleHidden: Boolean(u.sale_hidden),
          emailVerified: isEmailVerified(u)
        });
      }
      return { users, total: all.length };
    }
  );
}

/** Pola użytkownika, które może zmieniać panel administratora. */
export interface AdminUserPatch {
  username?: string;
  password_hash?: string;
  salt?: string;
  banned_until?: string | null;
  ban_permanent?: boolean;
  ban_reason?: string | null;
  must_change_password?: boolean;
  sale_hidden?: boolean;
  email_verified?: boolean;
}

const PATCH_COLUMNS: (keyof AdminUserPatch)[] = [
  'username', 'password_hash', 'salt', 'banned_until', 'ban_permanent', 'ban_reason', 'must_change_password', 'sale_hidden', 'email_verified'
];

export async function updateUserFields(userId: string, patch: AdminUserPatch): Promise<DbUser | null> {
  const keys = PATCH_COLUMNS.filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return null;
  return withDb(
    async (p) => {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const res = await p.query(`UPDATE users SET ${sets} WHERE id = $1 RETURNING *`, [userId, ...keys.map((k) => patch[k])]);
      const user = res.rows[0] ? mapUserRow(res.rows[0]) : null;
      // Wiadomości przechowują nazwy nadawcy i odbiorcy — po zmianie nazwy aktualizujemy je
      if (user && patch.username !== undefined) {
        await p.query('UPDATE user_messages SET sender_username = $2 WHERE sender_id = $1', [userId, patch.username]);
        await p.query('UPDATE user_messages SET recipient_username = $2 WHERE recipient_id = $1', [userId, patch.username]);
      }
      return user;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return null;
      for (const k of keys) (users[idx] as any)[k] = patch[k];
      writeJsonAtomic(USERS_FILE, users);
      return users[idx];
    }
  );
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  return withDb(
    async (p) => {
      // Wszystkie dane użytkownika usuwa ON DELETE CASCADE
      const res = await p.query('DELETE FROM users WHERE id = $1', [userId]);
      return (res.rowCount || 0) > 0;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      const next = users.filter((u) => u.id !== userId);
      if (next.length === users.length) return false;
      writeJsonAtomic(USERS_FILE, next);
      try {
        fs.rmSync(getUserDir(userId), { recursive: true, force: true });
      } catch {
        // katalog mógł nie istnieć
      }
      return true;
    }
  );
}

/** Konta zablokowane i konta z ukrytą ofertą — do filtrowania widoków publicznych. */
export async function getRestrictedUserIds(): Promise<{ banned: Set<string>; saleHidden: Set<string> }> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, ban_permanent, banned_until, sale_hidden FROM users
          WHERE ban_permanent OR banned_until > NOW() OR sale_hidden`
      );
      const banned = new Set<string>();
      const saleHidden = new Set<string>();
      for (const r of res.rows) {
        if (isBanActive(mapUserRow(r))) banned.add(r.id);
        if (r.sale_hidden) saleHidden.add(r.id);
      }
      return { banned, saleHidden };
    },
    () => {
      const banned = new Set<string>();
      const saleHidden = new Set<string>();
      for (const u of readJsonFile<DbUser[]>(USERS_FILE, [])) {
        if (isBanActive(u)) banned.add(u.id);
        if (u.sale_hidden) saleHidden.add(u.id);
      }
      return { banned, saleHidden };
    }
  );
}

export interface AdminStats {
  users: number;
  newUsers7d: number;
  activeUsers7d: number;
  bannedUsers: number;
  totalCards: number;
  forSaleCards: number;
  wishlistItems: number;
}

export async function adminStats(): Promise<AdminStats> {
  return withDb(
    async (p) => {
      const r = await p.query(`
        SELECT
          (SELECT COUNT(*) FROM users)::int AS users,
          (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_users,
          (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE last_used_at > NOW() - INTERVAL '7 days')::int AS active_users,
          (SELECT COUNT(*) FROM users WHERE ban_permanent OR banned_until > NOW())::int AS banned,
          (SELECT COALESCE(SUM(COALESCE(quantity,0) + COALESCE(quantity_foil,0)), 0) FROM user_collections)::bigint AS cards,
          (SELECT COALESCE(SUM(COALESCE(quantity,0) + COALESCE(quantity_foil,0)), 0) FROM user_collections WHERE is_for_sale)::bigint AS sale_cards,
          (SELECT COUNT(*) FROM user_wishlists)::int AS wishlist
      `);
      const x = r.rows[0];
      return {
        users: x.users,
        newUsers7d: x.new_users,
        activeUsers7d: x.active_users,
        bannedUsers: x.banned,
        totalCards: Number(x.cards),
        forSaleCards: Number(x.sale_cards),
        wishlistItems: x.wishlist
      };
    },
    async () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let totalCards = 0;
      let forSaleCards = 0;
      let wishlistItems = 0;
      for (const u of users) {
        for (const i of (await getCollection(u.id).catch(() => [])) as any[]) {
          const q = (i.quantity || 0) + (i.quantityFoil || 0);
          totalCards += q;
          if (i.isForSale) forSaleCards += q;
        }
        wishlistItems += (await getWishlist(u.id).catch(() => [])).length;
      }
      return {
        users: users.length,
        newUsers7d: users.filter((u) => new Date(u.created_at).getTime() > weekAgo).length,
        activeUsers7d: 0,
        bannedUsers: users.filter((u) => isBanActive(u)).length,
        totalCards,
        forSaleCards,
        wishlistItems
      };
    }
  );
}

export interface AuditEntry {
  id: string;
  adminId: string | null;
  adminUsername: string | null;
  action: string;
  targetId: string | null;
  targetUsername: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export async function addAuditEntry(e: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO admin_audit_log (admin_id, admin_username, action, target_id, target_username, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [e.adminId, e.adminUsername, e.action, e.targetId, e.targetUsername, e.details ? JSON.stringify(e.details) : null]
      );
    },
    () => {
      const all = readJsonFile<AuditEntry[]>(ADMIN_AUDIT_FILE, []);
      all.unshift({ ...e, id: String(Date.now()), createdAt: new Date().toISOString() });
      writeJsonAtomic(ADMIN_AUDIT_FILE, all.slice(0, 2000));
    }
  );
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT $1', [limit]);
      return res.rows.map((r) => ({
        id: String(r.id),
        adminId: r.admin_id,
        adminUsername: r.admin_username,
        action: r.action,
        targetId: r.target_id,
        targetUsername: r.target_username,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
        createdAt: new Date(r.created_at).toISOString()
      }));
    },
    () => readJsonFile<AuditEntry[]>(ADMIN_AUDIT_FILE, []).slice(0, limit)
  );
}
