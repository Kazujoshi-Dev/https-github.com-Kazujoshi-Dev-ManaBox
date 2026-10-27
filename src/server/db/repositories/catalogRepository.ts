import type { PoolClient } from 'pg';
import { Catalog, CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, userGameFile } from '../storage';
import { DEFAULT_GAME, type GameId } from '../../../games';
import { mapCatalogRow } from '../mappers';
import { MAIN_CATALOG_NAME, newMainCatalog } from '../schema';

/**
 * Błąd, który serwer pokazuje użytkownikowi wprost (400/404), np. próba usunięcia głównego klasera.
 */
export class CatalogError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SELECT_CATALOGS = `SELECT id, name, description, color, is_default as "isDefault", is_main as "isMain", created_at as "createdAt"
   FROM user_catalogs WHERE user_id = $1 AND game = $2 ORDER BY is_main DESC, created_at ASC`;

export async function insertCatalog(client: { query: PoolClient['query'] }, userId: string, cat: Catalog, game: GameId = DEFAULT_GAME) {
  await client.query(
    `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, is_main, created_at, game)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [cat.id, userId, cat.name, cat.description || '', cat.color || 'amber', Boolean(cat.isDefault), Boolean(cat.isMain), cat.createdAt, game]
  );
}

// ---------- zapis lokalny (bez bazy) ----------
function catFileOf(userId: string, game: GameId) {
  return userGameFile(userId, 'catalogs', game);
}
function colFileOf(userId: string, game: GameId) {
  return userGameFile(userId, 'collection', game);
}
/** Katalogi z pliku, zawsze z głównym klaserem na początku. */
function readLocalCatalogs(userId: string, game: GameId): Catalog[] {
  let catalogs = readJsonFile<Catalog[]>(catFileOf(userId, game), []);
  let changed = false;
  if (!catalogs.some((c) => c.isMain)) {
    const byName = catalogs.find((c) => c.name === MAIN_CATALOG_NAME);
    if (byName) byName.isMain = true;
    else catalogs.unshift(newMainCatalog(!catalogs.some((c) => c.isDefault)));
    changed = true;
  }
  if (changed) writeJsonAtomic(catFileOf(userId, game), catalogs);
  return [...catalogs.filter((c) => c.isMain), ...catalogs.filter((c) => !c.isMain)];
}

/** Katalogi użytkownika w danej grze. Gra bez głównego klasera dostaje go automatycznie. */
export async function getCatalogs(userId: string, game: GameId = DEFAULT_GAME): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      const res = await p.query(SELECT_CATALOGS, [userId, game]);
      if (res.rows.some((r) => r.isMain)) return res.rows.map(mapCatalogRow);

      // Blokada na użytkownika, żeby dwa równoległe zapytania nie utworzyły go podwójnie
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalogs:${userId}`]);
        const main = await client.query('SELECT 1 FROM user_catalogs WHERE user_id = $1 AND game = $2 AND is_main LIMIT 1', [userId, game]);
        if (main.rows.length === 0) {
          const hasDefault = await client.query('SELECT 1 FROM user_catalogs WHERE user_id = $1 AND game = $2 AND is_default LIMIT 1', [userId, game]);
          await insertCatalog(client, userId, newMainCatalog(hasDefault.rows.length === 0), game);
        }
        const rows = await client.query(SELECT_CATALOGS, [userId, game]);
        await client.query('COMMIT');
        return rows.rows.map(mapCatalogRow);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    () => readLocalCatalogs(userId, game)
  );
}

export async function addCatalog(userId: string, catalog: Catalog, game: GameId = DEFAULT_GAME): Promise<Catalog> {
  const cat = { ...catalog, isMain: false };
  return withDb(
    async (p) => {
      await insertCatalog(p, userId, cat, game);
      return cat;
    },
    () => {
      const catalogs = readLocalCatalogs(userId, game);
      catalogs.push(cat);
      writeJsonAtomic(catFileOf(userId, game), catalogs);
      return cat;
    }
  );
}

export async function setDefaultCatalog(userId: string, catalogId: string, game: GameId = DEFAULT_GAME): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      await p.query('UPDATE user_catalogs SET is_default = (id = $2) WHERE user_id = $1 AND game = $3', [userId, catalogId, game]);
      return getCatalogs(userId, game);
    },
    () => {
      const catalogs = readLocalCatalogs(userId, game).map((c) => ({ ...c, isDefault: c.id === catalogId }));
      writeJsonAtomic(catFileOf(userId, game), catalogs);
      return catalogs;
    }
  );
}

/**
 * Zmienia nazwę, opis, kolor lub oznaczenie domyślnego katalogu.
 * Nazwy głównego klasera nie można zmienić. Zmiana nazwy innego katalogu przenosi z nim karty.
 */
export async function updateCatalog(
  userId: string,
  catalogId: string,
  updates: { name?: string; description?: string; color?: string; isDefault?: boolean },
  game: GameId = DEFAULT_GAME
): Promise<Catalog> {
  const catalogs = await getCatalogs(userId, game);
  const target = catalogs.find((c) => c.id === catalogId);
  if (!target) throw new CatalogError('Nie znaleziono katalogu.', 404);

  const name = updates.name !== undefined ? updates.name.trim() : target.name;
  if (!name) throw new CatalogError('Nazwa katalogu jest wymagana.');
  if (name.length > 150) throw new CatalogError('Nazwa katalogu może mieć najwyżej 150 znaków.');
  if (target.isMain && name !== target.name) {
    throw new CatalogError(`Nazwy klasera „${MAIN_CATALOG_NAME}” nie można zmienić.`);
  }
  if (name !== target.name && catalogs.some((c) => c.id !== catalogId && c.name.toLowerCase() === name.toLowerCase())) {
    throw new CatalogError('Katalog o takiej nazwie już istnieje.');
  }
  const description = updates.description !== undefined ? String(updates.description).trim().slice(0, 500) : target.description || '';
  const color = updates.color || target.color || 'amber';
  // Odznaczenie domyślnego: domyślnym zostaje główny klaser
  const makeDefault = updates.isDefault === true;
  const unsetDefault = updates.isDefault === false && target.isDefault && !target.isMain;

  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE user_catalogs SET name = $3, description = $4, color = $5 WHERE id = $1 AND user_id = $2 AND game = $6',
          [catalogId, userId, name, description, color, game]
        );
        if (name !== target.name) {
          await client.query('UPDATE user_collections SET binder = $3 WHERE user_id = $1 AND binder = $2 AND game = $4', [userId, target.name, name, game]);
        }
        if (makeDefault) {
          await client.query('UPDATE user_catalogs SET is_default = (id = $2) WHERE user_id = $1 AND game = $3', [userId, catalogId, game]);
        } else if (unsetDefault) {
          await client.query('UPDATE user_catalogs SET is_default = is_main WHERE user_id = $1 AND game = $2', [userId, game]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      const fresh = await getCatalogs(userId, game);
      return fresh.find((c) => c.id === catalogId)!;
    },
    () => {
      let list = readLocalCatalogs(userId, game).map((c) => (c.id === catalogId ? { ...c, name, description, color } : c));
      if (makeDefault) list = list.map((c) => ({ ...c, isDefault: c.id === catalogId }));
      else if (unsetDefault) list = list.map((c) => ({ ...c, isDefault: Boolean(c.isMain) }));
      writeJsonAtomic(catFileOf(userId, game), list);
      if (name !== target.name) {
        const collection = readJsonFile<CollectionItem[]>(colFileOf(userId, game), []);
        collection.forEach((i) => {
          if (i.binder === target.name) i.binder = name;
        });
        writeJsonAtomic(colFileOf(userId, game), collection);
      }
      return list.find((c) => c.id === catalogId)!;
    }
  );
}

/**
 * Usuwa katalog. Głównego klasera nie można usunąć. Karty usuwanego katalogu (także wystawione
 * na sprzedaż) trafiają do głównego klasera; jeśli usuwany był domyślny, domyślnym zostaje główny.
 */
export async function deleteCatalog(
  userId: string,
  catalogId: string,
  game: GameId = DEFAULT_GAME
): Promise<{ catalogs: Catalog[]; reassignedTo: string; deletedItems: number }> {
  const catalogs = await getCatalogs(userId, game);
  const target = catalogs.find((c) => c.id === catalogId);
  if (!target) throw new CatalogError('Nie znaleziono katalogu do usunięcia.', 404);
  if (target.isMain) {
    throw new CatalogError(`Klasera „${MAIN_CATALOG_NAME}” nie można usunąć. Możesz go opróżnić z kart.`);
  }
  const main = catalogs.find((c) => c.isMain)!;

  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_catalogs WHERE id = $1 AND user_id = $2 AND game = $3', [catalogId, userId, game]);
        if (target.isDefault) {
          await client.query('UPDATE user_catalogs SET is_default = is_main WHERE user_id = $1 AND game = $2', [userId, game]);
        }
        await client.query('UPDATE user_collections SET binder = $1 WHERE user_id = $2 AND binder = $3 AND game = $4', [main.name, userId, target.name, game]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      return { catalogs: await getCatalogs(userId, game), reassignedTo: main.name, deletedItems: 0 };
    },
    () => {
      let remaining = catalogs.filter((c) => c.id !== catalogId);
      if (target.isDefault) remaining = remaining.map((c) => ({ ...c, isDefault: Boolean(c.isMain) }));
      writeJsonAtomic(catFileOf(userId, game), remaining);
      const collection = readJsonFile<CollectionItem[]>(colFileOf(userId, game), []);
      let changed = false;
      collection.forEach((item) => {
        if (item.binder === target.name) {
          item.binder = main.name;
          changed = true;
        }
      });
      if (changed) writeJsonAtomic(colFileOf(userId, game), collection);
      return { catalogs: remaining, reassignedTo: main.name, deletedItems: 0 };
    }
  );
}

/** Usuwa z kolekcji wszystkie karty katalogu poza wystawionymi na sprzedaż. Sam katalog zostaje. */
export async function emptyCatalog(userId: string, catalogId: string, game: GameId = DEFAULT_GAME): Promise<{ deletedItems: number }> {
  const catalogs = await getCatalogs(userId, game);
  const target = catalogs.find((c) => c.id === catalogId);
  if (!target) throw new CatalogError('Nie znaleziono katalogu.', 404);

  return withDb(
    async (p) => {
      const del = await p.query(
        'DELETE FROM user_collections WHERE user_id = $1 AND binder = $2 AND game = $3 AND NOT COALESCE(is_for_sale, FALSE)',
        [userId, target.name, game]
      );
      return { deletedItems: del.rowCount ?? 0 };
    },
    () => {
      const collection = readJsonFile<CollectionItem[]>(colFileOf(userId, game), []);
      const kept = collection.filter((i) => i.binder !== target.name || Boolean(i.isForSale));
      writeJsonAtomic(colFileOf(userId, game), kept);
      return { deletedItems: collection.length - kept.length };
    }
  );
}
