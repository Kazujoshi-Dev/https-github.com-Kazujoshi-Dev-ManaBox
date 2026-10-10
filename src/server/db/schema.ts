import crypto from 'crypto';
import { Catalog } from '../../types';
import { getPool, setPostgresActive } from './storage';

/** Nazwa głównego klasera: każde konto ma dokładnie jeden, nie da się go usunąć ani przemianować. */
export const MAIN_CATALOG_NAME = 'Klaser Główny';

export function newMainCatalog(isDefault = true): Catalog {
  return {
    id: `cat-main-${crypto.randomUUID()}`,
    name: MAIN_CATALOG_NAME,
    description: 'Główny klaser całej kolekcji',
    color: 'amber',
    createdAt: new Date().toISOString(),
    isDefault,
    isMain: true
  };
}

/** Startowe katalogi nowego konta: tylko główny klaser. */
export const DEFAULT_CATALOGS = (_userId: string): Catalog[] => [newMainCatalog(true)];

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
          -- główny klaser („Klaser Główny”): jeden na konto, nie da się go usunąć ani przemianować
          ALTER TABLE user_catalogs ADD COLUMN IF NOT EXISTS is_main BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS is_for_sale BOOLEAN DEFAULT FALSE;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2);
          -- ceny sprzed ostatniej zmiany rynkowej (do wskaźnika zmiany wartości kolekcji)
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS previous_prices JSONB;
          ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS prices_changed_at TIMESTAMPTZ;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_nbp_rate BOOLEAN DEFAULT TRUE;
          -- liczba wierszy kart na stronie kolekcji
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS collection_rows_per_page SMALLINT;
          -- język interfejsu (pl, en)
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ui_language VARCHAR(5);
          -- oznaczenia na kartach: plakietka klasera i ranking EDHREC (NULL = domyślnie włączone)
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_binder_badge BOOLEAN;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_edhrec_rank BOOLEAN;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_price_tag BOOLEAN;
          ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_foil_badge BOOLEAN;
          -- publiczny link do talii (domyślnie wyłączony)
          ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
          -- panel administratora: blokady kont, wymuszona zmiana hasła, ukrycie oferty
          ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_permanent BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(500);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS sale_hidden BOOLEAN NOT NULL DEFAULT FALSE;
          -- potwierdzenie adresu e-mail: konta sprzed tej zmiany (DEFAULT TRUE) są uznane za potwierdzone,
          -- nowe konta zakładane są z wartością FALSE do kliknięcia linku z maila
          ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
          -- jednorazowe tokeny z linków e-mail (potwierdzenie adresu, reset hasła); w bazie tylko skrót SHA-256
          CREATE TABLE IF NOT EXISTS email_tokens (
            token_hash VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            purpose VARCHAR(16) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, purpose);
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
          -- polubienia talii społeczności: jedno na osobę i talię
          CREATE TABLE IF NOT EXISTS deck_likes (
            deck_id VARCHAR(64) NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (deck_id, user_id)
          );
          CREATE INDEX IF NOT EXISTS idx_deck_likes_user ON deck_likes(user_id);
          CREATE TABLE IF NOT EXISTS user_blocks (
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, blocked_id)
          );

          CREATE TABLE IF NOT EXISTS bug_reports (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
            username VARCHAR(100),
            description TEXT NOT NULL,
            page VARCHAR(300),
            user_agent VARCHAR(400),
            screenshot BYTEA,
            screenshot_type VARCHAR(40),
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status, created_at DESC);
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
          ALTER TABLE changelog_drafts ADD COLUMN IF NOT EXISTS area_en VARCHAR(60);
          ALTER TABLE changelog_drafts ADD COLUMN IF NOT EXISTS text_en TEXT;
          CREATE INDEX IF NOT EXISTS idx_changelog_drafts_day ON changelog_drafts(day);
          CREATE TABLE IF NOT EXISTS changelog_releases (
            day DATE PRIMARY KEY,
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          -- Wersja zwykła i foil to osobne pozycje kolekcji: pozycje z oboma naraz dzielimy na dwie
          -- (sztuki foil trafiają do nowej pozycji z tymi samymi danymi). Po podziale nic się nie dzieje.
          WITH mixed AS (
            SELECT * FROM user_collections WHERE quantity > 0 AND quantity_foil > 0 FOR UPDATE
          ), foil_rows AS (
            INSERT INTO user_collections (
              id, user_id, card_id, card, quantity, quantity_foil, condition, language,
              purchase_price, notes, binder, added_at, last_updated_price_at,
              is_for_sale, sale_price, previous_prices, prices_changed_at
            )
            SELECT 'col-' || gen_random_uuid()::text, user_id, card_id, card, 0, quantity_foil, condition, language,
                   purchase_price, notes, binder, added_at, last_updated_price_at,
                   is_for_sale, sale_price, previous_prices, prices_changed_at
            FROM mixed
            RETURNING id
          )
          UPDATE user_collections SET quantity_foil = 0 WHERE id IN (SELECT id FROM mixed);

          -- Główny klaser każdego konta: najstarszy katalog o nazwie „Klaser Główny”,
          -- a gdy go nie ma (np. zmieniono mu nazwę), nowy, pusty „Klaser Główny”.
          UPDATE user_catalogs SET is_main = TRUE WHERE id IN (
            SELECT DISTINCT ON (user_id) id FROM user_catalogs
            WHERE name = 'Klaser Główny'
              AND user_id NOT IN (SELECT user_id FROM user_catalogs WHERE is_main)
            ORDER BY user_id, created_at, id
          );
          INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, is_main, created_at)
          SELECT 'cat-main-' || gen_random_uuid()::text, u.id, 'Klaser Główny', 'Główny klaser całej kolekcji', 'amber',
                 NOT EXISTS (SELECT 1 FROM user_catalogs d WHERE d.user_id = u.id AND d.is_default), TRUE, u.created_at
          FROM users u
          WHERE NOT EXISTS (SELECT 1 FROM user_catalogs m WHERE m.user_id = u.id AND m.is_main);
          CREATE UNIQUE INDEX IF NOT EXISTS uq_user_catalogs_main ON user_catalogs(user_id) WHERE is_main;
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
