/**
 * Jednorazowe naprawy danych. Każda naprawa ma stałe `id`, wykonuje się w transakcji
 * i zapisuje się w tabeli `data_fixes`, więc po wdrożeniu uruchamia się dokładnie raz.
 * Bez PostgreSQL moduł nic nie robi.
 */
import type pg from 'pg';
import { getPool, isPostgresActive } from './storage';

interface DataFix {
  id: string;
  description: string;
  /** Zwraca liczbę zmienionych wierszy. */
  run: (client: pg.PoolClient) => Promise<number>;
}

const FIXES: DataFix[] = [
  {
    // Skaner od 26.10.2026 zostawiał język JP po wybraniu japońskiej wersji jednej karty
    // i zapisywał go dla kolejnych, angielskich kart. Poprawiamy egzemplarze przypisane
    // do angielskiego wydania z językiem JP, dodane od tego dnia (czas polski).
    id: '2026-11-02-skaner-jezyk-jp',
    description: 'Język EN dla angielskich wydań zapisanych przez skaner jako JP (od 2026-10-26)',
    run: async (client) => {
      const r = await client.query(
        `UPDATE user_collections
            SET language = 'EN'
          WHERE game = 'mtg'
            AND language = 'JP'
            AND COALESCE(NULLIF(lower(card->>'lang'), ''), 'en') = 'en'
            AND added_at >= TIMESTAMPTZ '2026-10-26 00:00:00 Europe/Warsaw'`
      );
      return r.rowCount || 0;
    }
  }
];

export async function runDataFixes(): Promise<void> {
  if (!isPostgresActive()) return;
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_fixes (
      id VARCHAR(100) PRIMARY KEY,
      description TEXT,
      affected INT NOT NULL DEFAULT 0,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  for (const fix of FIXES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // blokada na czas naprawy: przy kilku instancjach serwera wykona ją tylko jedna
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [fix.id]);
      const done = await client.query('SELECT 1 FROM data_fixes WHERE id = $1', [fix.id]);
      if (done.rowCount) {
        await client.query('ROLLBACK');
        continue;
      }
      const affected = await fix.run(client);
      await client.query('INSERT INTO data_fixes (id, description, affected) VALUES ($1, $2, $3)', [fix.id, fix.description, affected]);
      await client.query('COMMIT');
      console.log(`[Naprawa danych] ${fix.id}: zmieniono ${affected} wierszy.`);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn(`[Naprawa danych] ${fix.id} nieudana (ponowimy przy następnym starcie):`, err?.message || err);
    } finally {
      client.release();
    }
  }
}
