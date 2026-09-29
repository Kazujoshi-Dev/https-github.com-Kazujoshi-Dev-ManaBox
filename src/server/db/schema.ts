import { Catalog } from '../../types';
import { getPool, setPostgresActive } from './storage';

export const DEFAULT_CATALOGS = (userId: string): Catalog[] => [
  {
    id: `cat-main-${userId.slice(0, 6)}`,
    name: 'Klaser Główny',
    description: 'Główny klaser całej kolekcji',
    color: 'amber',
    createdAt: new Date().toISOString(),
    isDefault: true
  },
  {
    id: `cat-commander-${userId.slice(0, 6)}`,
    name: 'Talia Commander',
    description: 'Karty i dodatki do talii Commander',
    color: 'purple',
    createdAt: new Date().toISOString(),
    isDefault: false
  },
  {
    id: `cat-trade-${userId.slice(0, 6)}`,
    name: 'Na wymianę',
    description: 'Karty przeznaczone na handel i wymianę z graczami',
    color: 'emerald',
    createdAt: new Date().toISOString(),
    isDefault: false
  }
];

export async function initDb(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    setPostgresActive(false);
    console.log('[Storage] Using local JSON storage (No PostgreSQL connection configured)');
    return;
  }

  const maxAttempts = (process.env.DATABASE_URL || process.env.PGHOST) ? 6 : 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            salt VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_catalogs (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            description TEXT,
            color VARCHAR(50) DEFAULT 'amber',
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_collections (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            card_id VARCHAR(64) NOT NULL,
            card JSONB NOT NULL,
            quantity INT DEFAULT 1,
            quantity_foil INT DEFAULT 0,
            condition VARCHAR(10) DEFAULT 'NM',
            language VARCHAR(10) DEFAULT 'EN',
            purchase_price NUMERIC(10, 2),
            notes TEXT,
            binder VARCHAR(150) DEFAULT 'Klaser Główny',
            added_at TIMESTAMPTZ DEFAULT NOW(),
            last_updated_price_at TIMESTAMPTZ
          );

          CREATE TABLE IF NOT EXISTS user_settings (
            user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            pricing_source VARCHAR(50) DEFAULT 'CARDMARKET',
            currency VARCHAR(10) DEFAULT 'PLN',
            eur_to_pln_rate NUMERIC(10, 4) DEFAULT 4.31,
            usd_to_pln_rate NUMERIC(10, 4) DEFAULT 3.96,
            auto_nbp_rate BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_wishlists (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            card_id VARCHAR(64) NOT NULL,
            card JSONB NOT NULL,
            target_quantity INT DEFAULT 1,
            is_foil BOOLEAN DEFAULT FALSE,
            notes TEXT,
            added_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_decks (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            format VARCHAR(50) DEFAULT 'EDH Commander',
            description TEXT,
            card_source VARCHAR(30) DEFAULT 'collection',
            commander JSONB,
            cards JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Safe forward-compatible migrations
          ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS card_source VARCHAR(30) DEFAULT 'collection';
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS last_updated_price_at TIMESTAMPTZ;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_nbp_rate BOOLEAN DEFAULT TRUE;
        `);
        setPostgresActive(true);
        console.log('[Storage] PostgreSQL connected & database schema verified successfully');
        return;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (attempt < maxAttempts) {
        console.warn(`[Storage] PostgreSQL connection attempt ${attempt}/${maxAttempts} failed (${err?.message || err}). Retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.warn('[Storage] PostgreSQL unreachable after retries, gracefully falling back to local JSON store:', err?.message || err);
        setPostgresActive(false);
      }
    }
  }
}
