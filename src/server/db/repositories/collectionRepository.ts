import path from 'path';
import { CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapCollectionRow } from '../mappers';

export async function getCollection(userId: string): Promise<CollectionItem[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
                condition, language, purchase_price as "purchasePrice", notes, binder,
                added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt"
         FROM user_collections WHERE user_id = $1 ORDER BY added_at DESC`,
        [userId]
      );
      return res.rows.map(mapCollectionRow);
    },
    () => {
      const userDir = getUserDir(userId);
      return readJsonFile<CollectionItem[]>(path.join(userDir, 'collection.json'), []);
    }
  );
}

export async function addCollectionItem(userId: string, item: CollectionItem): Promise<CollectionItem> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_collections (
          id, user_id, card_id, card, quantity, quantity_foil,
          condition, language, purchase_price, notes, binder,
          added_at, last_updated_price_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
    },
    () => {
      const userDir = getUserDir(userId);
      const colFile = path.join(userDir, 'collection.json');
      const items = readJsonFile<CollectionItem[]>(colFile, []);
      items.unshift(item);
      writeJsonAtomic(colFile, items);
      return item;
    }
  );
}

export async function updateCollectionItem(
  userId: string,
  id: string,
  updates: Partial<CollectionItem>
): Promise<CollectionItem | null> {
  return withDb(
    async (p) => {
      const existing = await p.query(
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

      const res = await p.query(
        `UPDATE user_collections
         SET card_id = $1, card = $2, quantity = $3, quantity_foil = $4, condition = $5,
             language = $6, purchase_price = $7, notes = $8, binder = $9
         WHERE id = $10 AND user_id = $11
         RETURNING id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
                   condition, language, purchase_price as "purchasePrice", notes, binder,
                   added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt"`,
        [newCardId, newCard, newQty, newQtyFoil, newCond, newLang, newPrice, newNotes, newBinder, id, userId]
      );

      return res.rows[0] ? mapCollectionRow(res.rows[0]) : null;
    },
    () => {
      const userDir = getUserDir(userId);
      const colFile = path.join(userDir, 'collection.json');
      const items = readJsonFile<CollectionItem[]>(colFile, []);
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return null;

      items[idx] = {
        ...items[idx],
        ...updates,
        cardId: updates.card?.id || updates.cardId || items[idx].cardId
      };
      writeJsonAtomic(colFile, items);
      return items[idx];
    }
  );
}

export async function deleteCollectionItem(userId: string, id: string): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query('DELETE FROM user_collections WHERE id = $1 AND user_id = $2', [id, userId]);
      return (res.rowCount ?? 0) > 0;
    },
    () => {
      const userDir = getUserDir(userId);
      const colFile = path.join(userDir, 'collection.json');
      const items = readJsonFile<CollectionItem[]>(colFile, []);
      const nextItems = items.filter((i) => i.id !== id);
      if (nextItems.length !== items.length) {
        writeJsonAtomic(colFile, nextItems);
        return true;
      }
      return false;
    }
  );
}

export async function saveFullCollection(userId: string, collection: CollectionItem[]): Promise<void> {
  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_collections WHERE user_id = $1', [userId]);

        if (collection.length > 0) {
          const CHUNK_SIZE = 50;
          for (let i = 0; i < collection.length; i += CHUNK_SIZE) {
            const chunk = collection.slice(i, i + CHUNK_SIZE);
            const valueClauses: string[] = [];
            const params: any[] = [userId];

            chunk.forEach((item, idx) => {
              const baseIndex = 2 + idx * 12;
              valueClauses.push(
                `($${baseIndex}, $1, $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
              );
              params.push(
                item.id,
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
              );
            });

            await client.query(
              `INSERT INTO user_collections (
                id, user_id, card_id, card, quantity, quantity_foil,
                condition, language, purchase_price, notes, binder,
                added_at, last_updated_price_at
              ) VALUES ${valueClauses.join(', ')}`,
              params
            );
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    () => {
      const userDir = getUserDir(userId);
      writeJsonAtomic(path.join(userDir, 'collection.json'), collection);
    }
  );
}
