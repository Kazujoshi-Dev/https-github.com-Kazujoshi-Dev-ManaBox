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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela Listy Życzeń per użytkownik
CREATE TABLE IF NOT EXISTS user_wishlists (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card JSONB NOT NULL,
  target_price NUMERIC(10, 2),
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_wishlists_user_id ON user_wishlists(user_id);
