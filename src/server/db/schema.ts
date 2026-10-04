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
            last_updated_price_at TIMESTAMPTZ,
            is_for_sale BOOLEAN DEFAULT FALSE,
            sale_price NUMERIC(10, 2)
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
            commander_is_foil BOOLEAN DEFAULT FALSE,
            cards JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_messages (
            id VARCHAR(64) PRIMARY KEY,
            sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sender_username VARCHAR(100) NOT NULL,
            recipient_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_username VARCHAR(100) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            deleted_by_sender BOOLEAN DEFAULT FALSE,
            deleted_by_recipient BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_profiles (
            user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            city VARCHAR(80),
            city_label VARCHAR(160),
            country_code VARCHAR(4),
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS user_sessions (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            user_agent VARCHAR(255),
            ip VARCHAR(64)
          );
          CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

          -- Safe forward-compatible migrations
          ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS card_source VARCHAR(30) DEFAULT 'collection';
          ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS commander_is_foil BOOLEAN DEFAULT FALSE;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS last_updated_price_at TIMESTAMPTZ;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS is_for_sale BOOLEAN DEFAULT FALSE;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2);
          -- ceny sprzed ostatniej zmiany rynkowej (do wskaźnika zmiany wartości kolekcji)
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS previous_prices JSONB;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS prices_changed_at TIMESTAMPTZ;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_nbp_rate BOOLEAN DEFAULT TRUE;
          -- publiczny link do talii (domyślnie wyłączony)
          ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
          -- panel administratora: blokady kont, wymuszona zmiana hasła, ukrycie oferty
          ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_permanent BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(500);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS sale_hidden BOOLEAN NOT NULL DEFAULT FALSE;
          CREATE TABLE IF NOT EXISTS admin_audit_log (
            id BIGSERIAL PRIMARY KEY,
            admin_id VARCHAR(64),
            admin_username VARCHAR(100),
            action VARCHAR(40) NOT NULL,
            target_id VARCHAR(64),
            target_username VARCHAR(100),
            details JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

          -- Ochrona przed spamem w wiadomościach: limity liczone z bazy i blokowanie nadawców
          CREATE INDEX IF NOT EXISTS idx_user_messages_sender_created ON user_messages(sender_id, created_at DESC);
          -- Dzienna historia wartości i liczby kart kolekcji (wykres w nagłówku)
          CREATE TABLE IF NOT EXISTS collection_snapshots (
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            day DATE NOT NULL,
            total_value NUMERIC(14, 2) NOT NULL,
            total_cards INTEGER NOT NULL,
            currency VARCHAR(4) NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, day)
          );
          CREATE TABLE IF NOT EXISTS user_blocks (
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, blocked_id)
          );

          CREATE TABLE IF NOT EXISTS changelog_drafts (
            id VARCHAR(100) PRIMARY KEY,
            day DATE NOT NULL,
            type VARCHAR(12) NOT NULL,
            area VARCHAR(60),
            text TEXT NOT NULL,
            source VARCHAR(10) NOT NULL DEFAULT 'repo',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_at TIMESTAMPTZ
          );
          ALTER TABLE changelog_drafts ADD COLUMN IF NOT EXISTS seq INT NOT NULL DEFAULT 1000000;
          CREATE INDEX IF NOT EXISTS idx_changelog_drafts_day ON changelog_drafts(day);
          CREATE TABLE IF NOT EXISTS changelog_releases (
            day DATE PRIMARY KEY,
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
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
