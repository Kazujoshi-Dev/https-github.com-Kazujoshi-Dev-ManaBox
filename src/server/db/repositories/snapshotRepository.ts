import { withDb } from '../storage';

export interface CollectionSnapshot {
  day: string; // YYYY-MM-DD
  value: number;
  cards: number;
  currency: string;
}

/** Zapisuje (lub nadpisuje) dzisiejszy stan kolekcji użytkownika. */
export async function upsertCollectionSnapshot(userId: string, value: number, cards: number, currency: string): Promise<void> {
  await withDb(
    async (p) => {
      await p.query(
        `INSERT INTO collection_snapshots (user_id, day, total_value, total_cards, currency, updated_at)
         VALUES ($1, (NOW() AT TIME ZONE 'Europe/Warsaw')::date, $2, $3, $4, NOW())
         ON CONFLICT (user_id, day) DO UPDATE SET
           total_value = EXCLUDED.total_value, total_cards = EXCLUDED.total_cards,
           currency = EXCLUDED.currency, updated_at = NOW()`,
        [userId, Math.round(value * 100) / 100, cards, currency]
      );
    },
    () => undefined
  );
}

export async function getCollectionSnapshots(userId: string, days: number): Promise<CollectionSnapshot[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, total_value, total_cards, currency
           FROM collection_snapshots
          WHERE user_id = $1 AND day > (NOW() AT TIME ZONE 'Europe/Warsaw')::date - $2::int
          ORDER BY day`,
        [userId, days]
      );
      return res.rows.map((r) => ({ day: r.day, value: Number(r.total_value), cards: Number(r.total_cards), currency: r.currency }));
    },
    () => []
  );
}

/** Użytkownicy z kolekcją, którzy nie mają jeszcze dzisiejszego zapisu (do dziennego zadania). */
export async function usersMissingTodaySnapshot(limit = 500): Promise<string[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT DISTINCT c.user_id FROM user_collections c
          WHERE NOT EXISTS (
            SELECT 1 FROM collection_snapshots s
             WHERE s.user_id = c.user_id AND s.day = (NOW() AT TIME ZONE 'Europe/Warsaw')::date
          )
          LIMIT $1`,
        [limit]
      );
      return res.rows.map((r) => r.user_id as string);
    },
    () => []
  );
}
