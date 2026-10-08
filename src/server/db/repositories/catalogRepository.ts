import crypto from 'crypto';
import path from 'path';
import { Catalog, CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapCatalogRow } from '../mappers';
import { DEFAULT_CATALOGS } from '../schema';

export async function getCatalogs(userId: string): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, name, description, color, is_default as "isDefault", created_at as "createdAt"
         FROM user_catalogs WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      );
      if (res.rows.length > 0) return res.rows.map(mapCatalogRow);

      // Konto bez katalogów dostaje startowe. Blokada na użytkownika, żeby dwa równoległe
      // zapytania nie utworzyły ich podwójnie.
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalogs:${userId}`]);
        const again = await client.query('SELECT 1 FROM user_catalogs WHERE user_id = $1 LIMIT 1', [userId]);
        if (again.rows.length === 0) {
          for (const cat of DEFAULT_CATALOGS(userId)) {
            await client.query(
              `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [cat.id, userId, cat.name, cat.description, cat.color, cat.isDefault, cat.createdAt]
            );
          }
        }
        const rows = await client.query(
          `SELECT id, name, description, color, is_default as "isDefault", created_at as "createdAt"
           FROM user_catalogs WHERE user_id = $1 ORDER BY created_at ASC`,
          [userId]
        );
        await client.query('COMMIT');
        return rows.rows.map(mapCatalogRow);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    () => {
      const userDir = getUserDir(userId);
      const catFile = path.join(userDir, 'catalogs.json');
      let catalogs = readJsonFile<Catalog[]>(catFile, []);
      if (catalogs.length === 0) {
        catalogs = DEFAULT_CATALOGS(userId);
        writeJsonAtomic(catFile, catalogs);
      }
      return catalogs;
    }
  );
}

export async function addCatalog(userId: string, catalog: Catalog): Promise<Catalog> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [catalog.id, userId, catalog.name, catalog.description, catalog.color, catalog.isDefault, catalog.createdAt]
      );
      return catalog;
    },
    async () => {
      const userDir = getUserDir(userId);
      const catFile = path.join(userDir, 'catalogs.json');
      const catalogs = await getCatalogs(userId);
      catalogs.push(catalog);
      writeJsonAtomic(catFile, catalogs);
      return catalog;
    }
  );
}

export async function setDefaultCatalog(userId: string, catalogId: string): Promise<Catalog[]> {
  return withDb(
    async (p) => {
      await p.query('UPDATE user_catalogs SET is_default = FALSE WHERE user_id = $1', [userId]);
      await p.query('UPDATE user_catalogs SET is_default = TRUE WHERE id = $1 AND user_id = $2', [catalogId, userId]);
      return getCatalogs(userId);
    },
    async () => {
      const userDir = getUserDir(userId);
      const catFile = path.join(userDir, 'catalogs.json');
      let catalogs = await getCatalogs(userId);
      catalogs = catalogs.map((c) => ({
        ...c,
        isDefault: c.id === catalogId
      }));
      writeJsonAtomic(catFile, catalogs);
      return catalogs;
    }
  );
}

/**
 * Usuwa katalog.
 * - Zwykły katalog: jego karty trafiają do katalogu domyślnego (głównego).
 * - Katalog domyślny (główny): jego karty są usuwane z kolekcji, poza wystawionymi na sprzedaż,
 *   które trafiają do nowego katalogu domyślnego. Gdy inny katalog ma tę samą nazwę, karty zostają.
 */
export async function deleteCatalog(
  userId: string,
  catalogId: string
): Promise<{ catalogs: Catalog[]; reassignedTo: string; deletedItems: number }> {
  let catalogs = await getCatalogs(userId);
  const target = catalogs.find((c) => c.id === catalogId);
  if (!target) throw new Error('Nie znaleziono katalogu do usunięcia.');

  const remaining = catalogs.filter((c) => c.id !== catalogId);
  const deleteCards = Boolean(target.isDefault) && !remaining.some((c) => c.name === target.name);
  let defaultCatalog = remaining.find((c) => c.isDefault);
  if (!defaultCatalog) {
    if (remaining.length > 0) {
      remaining[0].isDefault = true;
      defaultCatalog = remaining[0];
    } else {
      defaultCatalog = {
        id: `cat-main-${crypto.randomUUID()}`,
        name: 'Klaser Główny',
        description: 'Główny klaser całej kolekcji',
        color: 'amber',
        createdAt: new Date().toISOString(),
        isDefault: true
      };
      remaining.push(defaultCatalog);
    }
  }

  return withDb(
    async (p) => {
      await p.query('DELETE FROM user_catalogs WHERE id = $1 AND user_id = $2', [catalogId, userId]);
      await p.query('UPDATE user_catalogs SET is_default = FALSE WHERE user_id = $1', [userId]);
      await p.query('UPDATE user_catalogs SET is_default = TRUE WHERE id = $1 AND user_id = $2', [defaultCatalog!.id, userId]);

      let deletedItems = 0;
      if (deleteCards) {
        const del = await p.query(
          'DELETE FROM user_collections WHERE user_id = $1 AND binder = $2 AND NOT COALESCE(is_for_sale, FALSE)',
          [userId, target.name]
        );
        deletedItems = del.rowCount ?? 0;
      }
      // Pozostałe karty (wszystkie albo tylko te na sprzedaż) trafiają do katalogu domyślnego
      await p.query(
        'UPDATE user_collections SET binder = $1 WHERE user_id = $2 AND binder = $3',
        [defaultCatalog!.name, userId, target.name]
      );

      return { catalogs: await getCatalogs(userId), reassignedTo: defaultCatalog!.name, deletedItems };
    },
    () => {
      const userDir = getUserDir(userId);
      writeJsonAtomic(path.join(userDir, 'catalogs.json'), remaining);

      // Reassign binder in local collection
      const colFile = path.join(userDir, 'collection.json');
      let collection = readJsonFile<CollectionItem[]>(colFile, []);
      let colChanged = false;
      let deletedItems = 0;
      if (deleteCards) {
        const before = collection.length;
        collection = collection.filter((item) => item.binder !== target.name || Boolean(item.isForSale));
        deletedItems = before - collection.length;
        colChanged = deletedItems > 0;
      }
      collection.forEach((item) => {
        if (item.binder === target.name) {
          item.binder = defaultCatalog!.name;
          colChanged = true;
        }
      });
      if (colChanged) writeJsonAtomic(colFile, collection);

      return { catalogs: remaining, reassignedTo: defaultCatalog!.name, deletedItems };
    }
  );
}
