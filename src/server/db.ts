import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { CollectionItem, WishlistItem, Catalog, AppSettings } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface DbUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

const DEFAULT_CATALOGS = (userId: string): Catalog[] => [
  {
    id: `cat-main-${userId.slice(0, 6)}`,
    name: "Klaser Główny",
    description: "Główny klaser całej kolekcji",
    color: "amber",
    createdAt: new Date().toISOString(),
    isDefault: true
  },
  {
    id: `cat-commander-${userId.slice(0, 6)}`,
    name: "Talia Commander",
    description: "Karty i dodatki do talii Commander",
    color: "purple",
    createdAt: new Date().toISOString(),
    isDefault: false
  },
  {
    id: `cat-trade-${userId.slice(0, 6)}`,
    name: "Na wymianę",
    description: "Karty przeznaczone na handel i wymianę z graczami",
    color: "emerald",
    createdAt: new Date().toISOString(),
    isDefault: false
  }
];

let pool: pg.Pool | null = null;
let isPostgresActive = false;

// Check if PostgreSQL environment variables are configured
const dbUrl = process.env.DATABASE_URL;
const pgHost = process.env.PGHOST;

if (dbUrl || pgHost) {
  try {
    const config: pg.PoolConfig = dbUrl
      ? { connectionString: dbUrl }
      : {
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || '5432', 10),
          database: process.env.PGDATABASE || 'mtg_db',
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD,
        };

    if (process.env.PGSSLMODE === 'require') {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new pg.Pool(config);
    isPostgresActive = true;
  } catch (err) {
    console.error('Failed to initialize PostgreSQL pool:', err);
    isPostgresActive = false;
  }
}

// Automatically create tables on startup if PostgreSQL is active
export async function initDb(): Promise<void> {
  if (!isPostgresActive || !pool) {
    console.log('[Storage] Using local user-isolated JSON store (PostgreSQL not connected)');
    return;
  }

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
      `);
      console.log('[Storage] PostgreSQL connected & tables verified successfully');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Storage] Error connecting to PostgreSQL, falling back to JSON:', err);
    isPostgresActive = false;
  }
}

// Local JSON helper
function getUserDir(userId: string): string {
  const dir = path.join(DATA_DIR, 'users', userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');

// User Authentication Methods
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const cleanEmail = email.toLowerCase().trim();
  if (isPostgresActive && pool) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [cleanEmail]);
    return res.rows[0] || null;
  }

  const users = readJsonFile<DbUser[]>(USERS_FILE, []);
  return users.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  if (isPostgresActive && pool) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] || null;
  }

  const users = readJsonFile<DbUser[]>(USERS_FILE, []);
  return users.find(u => u.id === id) || null;
}

export async function createUser(
  id: string,
  email: string,
  username: string,
  passwordHash: string,
  salt: string
): Promise<DbUser> {
  const cleanEmail = email.toLowerCase().trim();
  const newUser: DbUser = {
    id,
    email: cleanEmail,
    username: username.trim(),
    password_hash: passwordHash,
    salt,
    created_at: new Date().toISOString()
  };

  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, salt, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newUser.id, newUser.email, newUser.username, newUser.password_hash, newUser.salt, newUser.created_at]
    );

    // Initialize default catalogs for the new user
    const initialCatalogs = DEFAULT_CATALOGS(id);
    for (const cat of initialCatalogs) {
      await pool.query(
        `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cat.id, id, cat.name, cat.description, cat.color, cat.isDefault, cat.createdAt]
      );
    }

    return newUser;
  }

  const users = readJsonFile<DbUser[]>(USERS_FILE, []);
  users.push(newUser);
  writeJsonFile(USERS_FILE, users);

  // Initialize catalogs for local user
  const userDir = getUserDir(id);
  writeJsonFile(path.join(userDir, 'catalogs.json'), DEFAULT_CATALOGS(id));
  writeJsonFile(path.join(userDir, 'collection.json'), []);
  writeJsonFile(path.join(userDir, 'wishlist.json'), []);

  return newUser;
}

// User Collection Methods
export async function getCollection(userId: string): Promise<CollectionItem[]> {
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `SELECT id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
              condition, language, purchase_price as "purchasePrice", notes, binder,
              added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt"
       FROM user_collections WHERE user_id = $1 ORDER BY added_at DESC`,
      [userId]
    );
    return res.rows.map(r => ({
      ...r,
      purchasePrice: r.purchasePrice ? parseFloat(r.purchasePrice) : null
    }));
  }

  const userDir = getUserDir(userId);
  return readJsonFile<CollectionItem[]>(path.join(userDir, 'collection.json'), []);
}

export async function addCollectionItem(userId: string, item: CollectionItem): Promise<CollectionItem> {
  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO user_collections (id, user_id, card_id, card, quantity, quantity_foil, condition, language, purchase_price, notes, binder, added_at, last_updated_price_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        item.id,
        userId,
        item.cardId || item.card.id,
        JSON.stringify(item.card),
        item.quantity,
        item.quantityFoil,
        item.condition,
        item.language,
        item.purchasePrice ?? null,
        item.notes || '',
        item.binder || 'Klaser Główny',
        item.addedAt || new Date().toISOString(),
        item.lastUpdatedPriceAt || null
      ]
    );
    return item;
  }

  const userDir = getUserDir(userId);
  const colFile = path.join(userDir, 'collection.json');
  const items = readJsonFile<CollectionItem[]>(colFile, []);
  items.unshift(item);
  writeJsonFile(colFile, items);
  return item;
}

export async function updateCollectionItem(userId: string, id: string, updates: Partial<CollectionItem>): Promise<CollectionItem | null> {
  if (isPostgresActive && pool) {
    const existing = await pool.query(
      'SELECT * FROM user_collections WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (existing.rows.length === 0) return null;

    const current = existing.rows[0];
    const newCard = updates.card ? JSON.stringify(updates.card) : current.card;
    const newCardId = updates.card?.id || updates.cardId || current.card_id;
    const newQty = updates.quantity !== undefined ? updates.quantity : current.quantity;
    const newQtyFoil = updates.quantityFoil !== undefined ? updates.quantityFoil : current.quantity_foil;
    const newCond = updates.condition || current.condition;
    const newLang = updates.language || current.language;
    const newPrice = updates.purchasePrice !== undefined ? updates.purchasePrice : current.purchase_price;
    const newNotes = updates.notes !== undefined ? updates.notes : current.notes;
    const newBinder = updates.binder !== undefined ? updates.binder : current.binder;

    const res = await pool.query(
      `UPDATE user_collections
       SET card_id = $1, card = $2, quantity = $3, quantity_foil = $4, condition = $5,
           language = $6, purchase_price = $7, notes = $8, binder = $9
       WHERE id = $10 AND user_id = $11
       RETURNING id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
                 condition, language, purchase_price as "purchasePrice", notes, binder,
                 added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt"`,
      [newCardId, newCard, newQty, newQtyFoil, newCond, newLang, newPrice, newNotes, newBinder, id, userId]
    );

    const updated = res.rows[0];
    return {
      ...updated,
      purchasePrice: updated.purchasePrice ? parseFloat(updated.purchasePrice) : null
    };
  }

  const userDir = getUserDir(userId);
  const colFile = path.join(userDir, 'collection.json');
  const items = readJsonFile<CollectionItem[]>(colFile, []);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;

  items[idx] = {
    ...items[idx],
    ...updates,
    cardId: updates.card?.id || updates.cardId || items[idx].cardId
  };
  writeJsonFile(colFile, items);
  return items[idx];
}

export async function deleteCollectionItem(userId: string, id: string): Promise<boolean> {
  if (isPostgresActive && pool) {
    const res = await pool.query(
      'DELETE FROM user_collections WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  const userDir = getUserDir(userId);
  const colFile = path.join(userDir, 'collection.json');
  const items = readJsonFile<CollectionItem[]>(colFile, []);
  const nextItems = items.filter(i => i.id !== id);
  if (nextItems.length !== items.length) {
    writeJsonFile(colFile, nextItems);
    return true;
  }
  return false;
}

export async function saveFullCollection(userId: string, collection: CollectionItem[]): Promise<void> {
  if (isPostgresActive && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_collections WHERE user_id = $1', [userId]);
      for (const item of collection) {
        await client.query(
          `INSERT INTO user_collections (id, user_id, card_id, card, quantity, quantity_foil, condition, language, purchase_price, notes, binder, added_at, last_updated_price_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            item.id,
            userId,
            item.cardId || item.card.id,
            JSON.stringify(item.card),
            item.quantity,
            item.quantityFoil,
            item.condition,
            item.language,
            item.purchasePrice ?? null,
            item.notes || '',
            item.binder || 'Klaser Główny',
            item.addedAt || new Date().toISOString(),
            item.lastUpdatedPriceAt || null
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  const userDir = getUserDir(userId);
  writeJsonFile(path.join(userDir, 'collection.json'), collection);
}

// User Catalogs Methods
export async function getCatalogs(userId: string): Promise<Catalog[]> {
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `SELECT id, name, description, color, is_default as "isDefault", created_at as "createdAt"
       FROM user_catalogs WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    if (res.rows.length === 0) {
      const defs = DEFAULT_CATALOGS(userId);
      for (const cat of defs) {
        await pool.query(
          `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [cat.id, userId, cat.name, cat.description, cat.color, cat.isDefault, cat.createdAt]
        );
      }
      return defs;
    }
    return res.rows;
  }

  const userDir = getUserDir(userId);
  const catFile = path.join(userDir, 'catalogs.json');
  let catalogs = readJsonFile<Catalog[]>(catFile, []);
  if (catalogs.length === 0) {
    catalogs = DEFAULT_CATALOGS(userId);
    writeJsonFile(catFile, catalogs);
  }
  return catalogs;
}

export async function addCatalog(userId: string, catalog: Catalog): Promise<Catalog> {
  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [catalog.id, userId, catalog.name, catalog.description, catalog.color, catalog.isDefault, catalog.createdAt]
    );
    return catalog;
  }

  const userDir = getUserDir(userId);
  const catFile = path.join(userDir, 'catalogs.json');
  const catalogs = await getCatalogs(userId);
  catalogs.push(catalog);
  writeJsonFile(catFile, catalogs);
  return catalog;
}

export async function setDefaultCatalog(userId: string, catalogId: string): Promise<Catalog[]> {
  if (isPostgresActive && pool) {
    await pool.query('UPDATE user_catalogs SET is_default = FALSE WHERE user_id = $1', [userId]);
    await pool.query('UPDATE user_catalogs SET is_default = TRUE WHERE id = $1 AND user_id = $2', [catalogId, userId]);
    return getCatalogs(userId);
  }

  const userDir = getUserDir(userId);
  const catFile = path.join(userDir, 'catalogs.json');
  let catalogs = await getCatalogs(userId);
  catalogs = catalogs.map(c => ({
    ...c,
    isDefault: c.id === catalogId
  }));
  writeJsonFile(catFile, catalogs);
  return catalogs;
}

export async function deleteCatalog(userId: string, catalogId: string): Promise<{ catalogs: Catalog[]; reassignedTo: string }> {
  let catalogs = await getCatalogs(userId);
  const target = catalogs.find(c => c.id === catalogId);
  if (!target) throw new Error('Nie znaleziono katalogu');

  const remaining = catalogs.filter(c => c.id !== catalogId);
  let defaultCatalog = remaining.find(c => c.isDefault);
  if (!defaultCatalog) {
    if (remaining.length > 0) {
      remaining[0].isDefault = true;
      defaultCatalog = remaining[0];
    } else {
      defaultCatalog = {
        id: `cat-main-${userId.slice(0, 6)}`,
        name: "Klaser Główny",
        description: "Główny klaser całej kolekcji",
        color: "amber",
        createdAt: new Date().toISOString(),
        isDefault: true
      };
      remaining.push(defaultCatalog);
    }
  }

  if (isPostgresActive && pool) {
    await pool.query('DELETE FROM user_catalogs WHERE id = $1 AND user_id = $2', [catalogId, userId]);
    // update is_default for the chosen default
    await pool.query('UPDATE user_catalogs SET is_default = FALSE WHERE user_id = $1', [userId]);
    await pool.query('UPDATE user_catalogs SET is_default = TRUE WHERE id = $1 AND user_id = $2', [defaultCatalog.id, userId]);

    // Reassign items from deleted catalog to default catalog
    await pool.query(
      'UPDATE user_collections SET binder = $1 WHERE user_id = $2 AND binder = $3',
      [defaultCatalog.name, userId, target.name]
    );

    return { catalogs: await getCatalogs(userId), reassignedTo: defaultCatalog.name };
  }

  const userDir = getUserDir(userId);
  writeJsonFile(path.join(userDir, 'catalogs.json'), remaining);

  // Reassign items in local collection
  const colFile = path.join(userDir, 'collection.json');
  const collection = readJsonFile<CollectionItem[]>(colFile, []);
  let colChanged = false;
  collection.forEach(item => {
    if (item.binder === target.name) {
      item.binder = defaultCatalog!.name;
      colChanged = true;
    }
  });
  if (colChanged) writeJsonFile(colFile, collection);

  return { catalogs: remaining, reassignedTo: defaultCatalog.name };
}

// User Wishlist Methods
export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `SELECT id, card_id as "cardId", card, target_quantity as "targetQuantity",
              is_foil as "isFoil", notes, added_at as "addedAt"
       FROM user_wishlists WHERE user_id = $1 ORDER BY added_at DESC`,
      [userId]
    );
    return res.rows;
  }

  const userDir = getUserDir(userId);
  return readJsonFile<WishlistItem[]>(path.join(userDir, 'wishlist.json'), []);
}

export async function addWishlistItem(userId: string, item: WishlistItem): Promise<WishlistItem> {
  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO user_wishlists (id, user_id, card_id, card, target_quantity, is_foil, notes, added_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        item.id,
        userId,
        item.cardId || item.card.id,
        JSON.stringify(item.card),
        item.targetQuantity || 1,
        Boolean(item.isFoil),
        item.notes || '',
        item.addedAt
      ]
    );
    return item;
  }

  const userDir = getUserDir(userId);
  const file = path.join(userDir, 'wishlist.json');
  const list = readJsonFile<WishlistItem[]>(file, []);
  list.unshift(item);
  writeJsonFile(file, list);
  return item;
}

export async function deleteWishlistItem(userId: string, id: string): Promise<boolean> {
  if (isPostgresActive && pool) {
    const res = await pool.query('DELETE FROM user_wishlists WHERE id = $1 AND user_id = $2', [id, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  const userDir = getUserDir(userId);
  const file = path.join(userDir, 'wishlist.json');
  const list = readJsonFile<WishlistItem[]>(file, []);
  const nextList = list.filter(i => i.id !== id);
  if (nextList.length !== list.length) {
    writeJsonFile(file, nextList);
    return true;
  }
  return false;
}

// User Settings Methods
export async function getSettings(userId: string): Promise<AppSettings | null> {
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `SELECT pricing_source as "pricingSource", currency, eur_to_pln_rate as "eurToPlnRate",
              usd_to_pln_rate as "usdToPlnRate", auto_nbp_rate as "autoNbpRate"
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      pricingSource: r.pricingSource,
      currency: r.currency,
      eurToPlnRate: parseFloat(r.eurToPlnRate),
      usdToPlnRate: parseFloat(r.usdToPlnRate),
      autoNbpRate: r.autoNbpRate
    };
  }

  const userDir = getUserDir(userId);
  const file = path.join(userDir, 'settings.json');
  return readJsonFile<AppSettings | null>(file, null);
}

export async function saveSettings(userId: string, settings: AppSettings): Promise<AppSettings> {
  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO user_settings (user_id, pricing_source, currency, eur_to_pln_rate, usd_to_pln_rate, auto_nbp_rate, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         pricing_source = EXCLUDED.pricing_source,
         currency = EXCLUDED.currency,
         eur_to_pln_rate = EXCLUDED.eur_to_pln_rate,
         usd_to_pln_rate = EXCLUDED.usd_to_pln_rate,
         auto_nbp_rate = EXCLUDED.auto_nbp_rate,
         updated_at = NOW()`,
      [userId, settings.pricingSource, settings.currency, settings.eurToPlnRate, settings.usdToPlnRate, settings.autoNbpRate]
    );
    return settings;
  }

  const userDir = getUserDir(userId);
  writeJsonFile(path.join(userDir, 'settings.json'), settings);
  return settings;
}
