import { withDb } from '../storage';

export type ChangelogItemType = 'new' | 'improved' | 'fixed';

export interface ChangelogItem {
  id: string;
  type: ChangelogItemType;
  area: string | null;
  text: string;
}

export interface ChangelogRelease {
  day: string;
  publishedAt: string;
  items: ChangelogItem[];
}

export interface ChangelogPendingDraft extends ChangelogItem {
  day: string;
  source: string;
}

export interface ChangelogDraftInput {
  id: string;
  day: string;
  type: ChangelogItemType;
  area?: string | null;
  text: string;
}

const dayStr = (v: any) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

/**
 * Wczytuje wpisy z repozytorium. Nowe są dodawane, istniejące dostają aktualny tekst
 * (także opublikowane, żeby poprawka literówki trafiła do dziennika).
 */
export async function syncChangelogDrafts(drafts: ChangelogDraftInput[]): Promise<number> {
  if (!drafts.length) return 0;
  return withDb(
    async (p) => {
      const res = await p.query(
        `INSERT INTO changelog_drafts (id, day, type, area, text, source, seq)
         SELECT x.id, x.day::date, x.type, x.area, x.text, 'repo', x.seq
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, day text, type text, area text, text text, seq int)
         ON CONFLICT (id) DO UPDATE
           SET type = EXCLUDED.type, area = EXCLUDED.area, text = EXCLUDED.text, seq = EXCLUDED.seq,
               day = CASE WHEN changelog_drafts.published_at IS NULL THEN EXCLUDED.day ELSE changelog_drafts.day END
         WHERE changelog_drafts.source = 'repo'`,
        [JSON.stringify(drafts.map((d, i) => ({ ...d, area: d.area || null, seq: i })))]
      );
      return res.rowCount ?? 0;
    },
    () => 0
  );
}

/** Publikuje wszystkie nieopublikowane wpisy z dni do `cutoffDay` włącznie. Zwraca liczbę wpisów. */
export async function publishChangelogUpTo(cutoffDay: string): Promise<number> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `WITH pub AS (
           UPDATE changelog_drafts SET published_at = NOW()
            WHERE published_at IS NULL AND source <> 'hidden' AND day <= $1::date
            RETURNING day
         ), rel AS (
           INSERT INTO changelog_releases (day)
           SELECT DISTINCT day FROM pub
           ON CONFLICT (day) DO UPDATE SET updated_at = NOW()
           RETURNING day
         )
         SELECT (SELECT COUNT(*) FROM pub)::int AS n`,
        [cutoffDay]
      );
      return Number(res.rows[0]?.n || 0);
    },
    () => 0
  );
}

export async function listChangelogReleases(limit = 60): Promise<ChangelogRelease[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT r.day, r.published_at,
                COALESCE(json_agg(json_build_object('id', d.id, 'type', d.type, 'area', d.area, 'text', d.text)
                         ORDER BY CASE d.type WHEN 'new' THEN 0 WHEN 'improved' THEN 1 ELSE 2 END, d.seq, d.created_at, d.id)
                         FILTER (WHERE d.id IS NOT NULL), '[]') AS items
           FROM changelog_releases r
           LEFT JOIN changelog_drafts d ON d.day = r.day AND d.published_at IS NOT NULL
          GROUP BY r.day, r.published_at
         HAVING COUNT(d.id) > 0
          ORDER BY r.day DESC
          LIMIT $1`,
        [limit]
      );
      return res.rows.map((r: any) => ({ day: dayStr(r.day), publishedAt: new Date(r.published_at).toISOString(), items: r.items }));
    },
    () => []
  );
}

export async function listPendingChangelogDrafts(): Promise<ChangelogPendingDraft[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, day, type, area, text, source FROM changelog_drafts
          WHERE published_at IS NULL AND source <> 'hidden' ORDER BY day, seq, created_at, id`
      );
      return res.rows.map((r: any) => ({ id: r.id, day: dayStr(r.day), type: r.type, area: r.area, text: r.text, source: r.source }));
    },
    () => []
  );
}

export async function addChangelogDraft(d: ChangelogDraftInput): Promise<void> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO changelog_drafts (id, day, type, area, text, source) VALUES ($1, $2::date, $3, $4, $5, 'admin')`,
        [d.id, d.day, d.type, d.area || null, d.text]
      );
    },
    () => undefined
  );
}

/** Usuwa wpis (także opublikowany). Wpis z repozytorium wróciłby przy następnym starcie, więc go tylko ukrywamy. */
export async function deleteChangelogDraft(id: string): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `WITH del AS (DELETE FROM changelog_drafts WHERE id = $1 AND source = 'admin' RETURNING id),
              hid AS (UPDATE changelog_drafts SET source = 'hidden', published_at = NULL, day = '1970-01-01'
                       WHERE id = $1 AND source = 'repo' RETURNING id)
         SELECT (SELECT COUNT(*) FROM del) + (SELECT COUNT(*) FROM hid) AS n`,
        [id]
      );
      return Number(res.rows[0]?.n || 0) > 0;
    },
    () => false
  );
}
