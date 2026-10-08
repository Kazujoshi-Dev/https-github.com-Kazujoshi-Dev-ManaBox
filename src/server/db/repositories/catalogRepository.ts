import path from 'path';
import type { PoolClient } from 'pg';
import { Catalog, CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
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
   FROM user_catalogs WHERE user_id = $1 ORDER BY is_main DESC, created_at ASC`;

export async function insertCatalog(client: { query: PoolClient['query'] }, userId: string, cat: Catalog) {
  await client.query(
    `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, is_main, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [cat.id, userId, cat.name, cat.description || '', cat.color || 'amber', Boolean(cat.isDefault), Boolean(cat.isMain), cat.createdAt]
  );
}

// ---------- zapis lokalny (bez bazy) ----------
function catFileOf(userId: string) {
  return path.join(getUserDir(userId), 'catalogs.json');
}
function colFileOf(userId: string) {
  return path.join(getUserDir(userId), 'collection.json');
}
/** Katalogi z pliku, zawsze z głównym klaserem na początku. */
function readLocalCatalogs(userId: string): Catalog[] {
  let catalogs = readJsonFile<Catalog[]>(catFileOf(userId), []);
  let changed = false;
  if (!catalogs.some((c) => c.isMain)) {
    const byName = catalogs.find((c) => c.name === MAIN_CATALOG_NAME);
    if (byName) byName.isMain = true;
    else catalogs.unshift(newMainCatalog(!catalogs.some((c) => c.isDefault)));
    changed = true;
  }
  if (changed) writeJsonAtomic(catFileOf(userId), catalogs);
  return [...catalogs.filter((c) => c.isMain), ...catalogs.filter((c) => !c.isMain)];
}

/** Katalogi użytkownika. Konto bez głównego klasera dostaje go automatycznie. */
export async function getCatalogs(userId: string): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      const res = await p.query(SELECT_CATALOGS, [userId]);
      if (res.rows.some((r) => r.isMain)) return res.rows.map(mapCatalogRow);

      // Blokada na użytkownika, żeby dwa równoległe zapytania nie utworzyły go podwójnie
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalogs:${userId}`]);
        const main = await client.query('SELECT 1 FROM user_catalogs WHERE user_id = $1 AND is_main LIMIT 1', [userId]);
        if (main.rows.length === 0) {
          const hasDefault = await client.query('SELECT 1 FROM user_catalogs WHERE user_id = $1 AND is_default LIMIT 1', [userId]);
          await insertCatalog(client, userId, newMainCatalog(hasDefault.rows.length === 0));
        }
        const rows = await client.query(SELECT_CATALOGS, [userId]);
        await client.query('COMMIT');
        return rows.rows.map(mapCatalogRow);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    () => readLocalCatalogs(userId)
  );
}

export async function addCatalog(userId: string, catalog: Catalog): Promise<Catalog> {
  const cat = { ...catalog, isMain: false };
  return withDb(
    async (p) => {
      await insertCatalog(p, userId, cat);
      return cat;
    },
    () => {
      const catalogs = readLocalCatalogs(userId);
      catalogs.push(cat);
      writeJsonAtomic(catFileOf(userId), catalogs);
      return cat;
    }
  );
}

export async function setDefaultCatalog(userId: string, catalogId: string): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      await p.query('UPDATE user_catalogs SET is_default = (id = $2) WHERE user_id = $1', [userId, catalogId]);
      return getCatalogs(userId);
    },
    () => {
      const catalogs = readLocalCatalogs(userId).map((c) => ({ ...c, isDefault: c.id === catalogId }));
      writeJsonAtomic(catFileOf(userId), catalogs);
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
  updates: { name?: string; description?: string; color?: string; isDefault?: boolean }
): Promise<Catalog> {
  const catalogs = await getCatalogs(userId);
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
          'UPDATE user_catalogs SET name = $3, description = $4, color = $5 WHERE id = $1 AND user_id = $2',
          [catalogId, userId, name, description, color]
        );
        if (name !== target.name) {
          await client.query('UPDATE user_collections SET binder = $3 WHERE user_id = $1 AND binder = $2', [userId, target.name, name]);
        }
        if (makeDefault) {
          await client.query('UPDATE user_catalogs SET is_default = (id = $2) WHERE user_id = $1', [userId, catalogId]);
        } else if (unsetDefault) {
          await client.query('UPDATE user_catalogs SET is_default = is_main WHERE user_id = $1', [userId]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      const fresh = await getCatalogs(userId);
      return fresh.find((c) => c.id === catalogId)!;
    },
    () => {
      let list = readLocalCatalogs(userId).map((c) => (c.id === catalogId ? { ...c, name, description, color } : c));
      if (makeDefault) list = list.map((c) => ({ ...c, isDefault: c.id === catalogId }));
      else if (unsetDefault) list = list.map((c) => ({ ...c, isDefault: Boolean(c.isMain) }));
      writeJsonAtomic(catFileOf(userId), list);
      if (name !== target.name) {
        const collection = readJsonFile<CollectionItem[]>(colFileOf(userId), []);
        collection.forEach((i) => {
          if (i.binder === target.name) i.binder = name;
        });
        writeJsonAtomic(colFileOf(userId), collection);
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
  catalogId: string
): Promise<{ catalogs: Catalog[]; reassignedTo: string; deletedItems: number }> {
  const catalogs = await getCatalogs(userId);
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
        await client.query('DELETE FROM user_catalogs WHERE id = $1 AND user_id = $2', [catalogId, userId]);
        if (target.isDefault) {
          await client.query('UPDATE user_catalogs SET is_default = is_main WHERE user_id = $1', [userId]);
        }
        await client.query('UPDATE user_collections SET binder = $1 WHERE user_id = $2 AND binder = $3', [main.name, userId, target.name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      return { catalogs: await getCatalogs(userId), reassignedTo: main.name, deletedItems: 0 };
    },
    () => {
      let remaining = catalogs.filter((c) => c.id !== catalogId);
      if (target.isDefault) remaining = remaining.map((c) => ({ ...c, isDefault: Boolean(c.isMain) }));
      writeJsonAtomic(catFileOf(userId), remaining);
      const collection = readJsonFile<CollectionItem[]>(colFileOf(userId), []);
      let changed = false;
      collection.forEach((item) => {
        if (item.binder === target.name) {
          item.binder = main.name;
          changed = true;
        }
      });
      if (changed) writeJsonAtomic(colFileOf(userId), collection);
      return { catalogs: remaining, reassignedTo: main.name, deletedItems: 0 };
    }
  );
}

/** Usuwa z kolekcji wszystkie karty katalogu poza wystawionymi na sprzedaż. Sam katalog zostaje. */
export async function emptyCatalog(userId: string, catalogId: string): Promise<{ deletedItems: number }> {
  const catalogs = await getCatalogs(userId);
  const target = catalogs.find((c) => c.id === catalogId);
  if (!target) throw new CatalogError('Nie znaleziono katalogu.', 404);

  return withDb(
    async (p) => {
      const del = await p.query(
        'DELETE FROM user_collections WHERE user_id = $1 AND binder = $2 AND NOT COALESCE(is_for_sale, FALSE)',
        [userId, target.name]
      );
      return { deletedItems: del.rowCount ?? 0 };
    },
    () => {
      const collection = readJsonFile<CollectionItem[]>(colFileOf(userId), []);
      const kept = collection.filter((i) => i.binder !== target.name || Boolean(i.isForSale));
      writeJsonAtomic(colFileOf(userId), kept);
      return { deletedItems: collection.length - kept.length };
    }
  );
}
