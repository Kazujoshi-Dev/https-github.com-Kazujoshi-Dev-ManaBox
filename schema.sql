-- ============================================================
-- MTG Collection Manager - PostgreSQL Database Schema
-- ============================================================

-- 1. Tabela Użytkowników
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Tabela Klaserów / Katalogów per użytkownik
CREATE TABLE IF NOT EXISTS user_catalogs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  color VARCHAR(50) DEFAULT 'amber',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_catalogs_user_id ON user_catalogs(user_id);

-- 3. Tabela Kart w Kolekcji per użytkownik
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

CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_collections_card_id ON user_collections(card_id);
CREATE INDEX IF NOT EXISTS idx_user_collections_binder ON user_collections(user_id, binder);

-- 4. Tabela Ustawień Aplikacji per użytkownik
CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pricing_source VARCHAR(50) DEFAULT 'CARDMARKET',
  currency VARCHAR(10) DEFAULT 'PLN',
  eur_to_pln_rate NUMERIC(10, 4) DEFAULT 4.31,
  usd_to_pln_rate NUMERIC(10, 4) DEFAULT 3.96,
  auto_nbp_rate BOOLEAN DEFAULT TRUE,
  collection_rows_per_page SMALLINT,
  ui_language VARCHAR(5),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela Listy Życzeń per użytkownik
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

CREATE INDEX IF NOT EXISTS idx_user_wishlists_user_id ON user_wishlists(user_id);

-- 6. Tabela Talii (Decks) per użytkownik (domyślnie EDH Commander)
CREATE TABLE IF NOT EXISTS user_decks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  format VARCHAR(50) DEFAULT 'EDH Commander',
  description TEXT,
  commander JSONB,
  cards JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_decks_user_id ON user_decks(user_id);

-- 7. Sesje logowania (wygasają po 7 dniach bezczynności, najpóźniej po 30 dniach)
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

-- 8. Profil: opcjonalna miejscowość (centrum miasta, zaokrąglone do ~1 km) do mapy sprzedawców
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city VARCHAR(80),
  city_label VARCHAR(160),
  country_code VARCHAR(4),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
