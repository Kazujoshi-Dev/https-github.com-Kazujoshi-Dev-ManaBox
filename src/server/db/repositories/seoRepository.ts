import { withDb } from '../storage';

export interface SitemapDeck {
  id: string;
  updatedAt: string | null;
}

export interface SitemapSeller {
  username: string;
  updatedAt: string | null;
}

/** Publiczne talie aktywnych użytkowników (do sitemap.xml). */
export async function listPublicDecksForSitemap(limit = 5000): Promise<SitemapDeck[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT d.id, COALESCE(d.updated_at, d.created_at) AS updated_at
           FROM user_decks d JOIN users u ON u.id = d.user_id
          WHERE d.is_public = TRUE
            AND NOT COALESCE(u.ban_permanent, FALSE)
            AND (u.banned_until IS NULL OR u.banned_until < NOW())
          ORDER BY updated_at DESC
          LIMIT $1`,
        [limit]
      );
      return res.rows.map((r: any) => ({ id: String(r.id), updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null }));
    },
    () => []
  );
}

/** Sprzedawcy z co najmniej jedną kartą na sprzedaż (oferta nieukryta, konto bez bana). */
export async function listSellersForSitemap(limit = 5000): Promise<SitemapSeller[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT u.username, MAX(c.added_at) AS updated_at
           FROM user_collections c JOIN users u ON u.id = c.user_id
          WHERE c.is_for_sale = TRUE
            AND NOT COALESCE(u.sale_hidden, FALSE)
            AND NOT COALESCE(u.ban_permanent, FALSE)
            AND (u.banned_until IS NULL OR u.banned_until < NOW())
          GROUP BY u.username
          ORDER BY updated_at DESC NULLS LAST
          LIMIT $1`,
        [limit]
      );
      return res.rows.map((r: any) => ({ username: String(r.username), updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null }));
    },
    () => []
  );
}
