import path from 'path';
import crypto from 'crypto';
import { CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapCollectionRow } from '../mappers';
import { entryKeyOf, matchesEntry, splitByFinish } from '../../../utils/collectionEntry';

const newCollectionId = () => `col-${crypto.randomUUID()}`;

export async function getCollection(userId: string): Promise<CollectionItem[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
                condition, language, purchase_price as "purchasePrice", notes, binder,
                added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt",
                is_for_sale as "isForSale", sale_price as "salePrice",
                previous_prices as "previousPrices", prices_changed_at as "pricesChangedAt"
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
          added_at, last_updated_price_at, is_for_sale, sale_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
          item.lastUpdatedPriceAt || null,
          Boolean(item.isForSale),
          item.salePrice ?? null
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
      const newIsForSale = updates.isForSale !== undefined ? Boolean(updates.isForSale) : Boolean(current.is_for_sale);
      const newSalePrice = updates.salePrice !== undefined ? updates.salePrice : current.sale_price;

      const res = await p.query(
        `UPDATE user_collections
         SET card_id = $1::varchar, card = $2, quantity = $3, quantity_foil = $4, condition = $5,
             language = $6, purchase_price = $7, notes = $8, binder = $9, is_for_sale = $10, sale_price = $11,
             -- zmiana wydania karty: poprzednie ceny dotyczyły innego druku
             previous_prices = CASE WHEN card_id IS DISTINCT FROM $1::varchar THEN NULL ELSE previous_prices END,
             prices_changed_at = CASE WHEN card_id IS DISTINCT FROM $1::varchar THEN NULL ELSE prices_changed_at END
         WHERE id = $12 AND user_id = $13
         RETURNING id, card_id as "cardId", card, quantity, quantity_foil as "quantityFoil",
                   condition, language, purchase_price as "purchasePrice", notes, binder,
                   added_at as "addedAt", last_updated_price_at as "lastUpdatedPriceAt",
                   is_for_sale as "isForSale", sale_price as "salePrice",
                   previous_prices as "previousPrices", prices_changed_at as "pricesChangedAt"`,
        [newCardId, newCard, newQty, newQtyFoil, newCond, newLang, newPrice, newNotes, newBinder, newIsForSale, newSalePrice, id, userId]
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
              const baseIndex = 2 + idx * 16;
              valueClauses.push(
                `($${baseIndex}, $1, ${Array.from({ length: 15 }, (_, k) => `$${baseIndex + 1 + k}`).join(', ')})`
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
                item.lastUpdatedPriceAt || null,
                Boolean(item.isForSale),
                item.salePrice ?? null,
                item.previousPrices ? JSON.stringify(item.previousPrices) : null,
                item.pricesChangedAt || null
              );
            });

            await client.query(
              `INSERT INTO user_collections (
                id, user_id, card_id, card, quantity, quantity_foil,
                condition, language, purchase_price, notes, binder,
                added_at, last_updated_price_at, is_for_sale, sale_price,
                previous_prices, prices_changed_at
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

export async function addCollectionItems(
  userId: string,
  newItems: CollectionItem[]
): Promise<CollectionItem[]> {
  if (!newItems || newItems.length === 0) return [];

  // Każda pozycja ma tylko jedną wersję (zwykłą albo foil): dane z obiema liczbami dzielimy na dwie.
  // Sztuki dopisujemy do istniejącej pozycji tylko wtedy, gdy to dokładnie ta sama karta
  // (wydanie, foil, stan, język, klaser) i nie jest wystawiona na sprzedaż.
  const parts = newItems.flatMap((item) =>
    splitByFinish(item).map(({ foil, qty, part }, idx) => ({
      foil,
      qty,
      item: part,
      key: entryKeyOf(item, foil),
      // druga część dostaje nowe id, żeby nie powtórzyć klucza
      id: idx === 0 && item.id ? item.id : newCollectionId(),
    }))
  );

  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const inserted: CollectionItem[] = [];

        for (const { foil, qty, item, key, id } of parts) {
          const addedAt = item.addedAt || new Date().toISOString();

          const existingRes = await client.query(
            `SELECT id, quantity, quantity_foil FROM user_collections
             WHERE user_id = $1 AND card_id = $2 AND binder = $3 AND condition = $4 AND language = $5
               AND COALESCE(is_for_sale, FALSE) = FALSE
               AND ${foil ? 'quantity_foil > 0 AND quantity = 0' : 'quantity > 0 AND quantity_foil = 0'}
             ORDER BY added_at DESC
             LIMIT 1`,
            [userId, key.cardId, key.binder, key.condition, key.language]
          );

          if (existingRes.rows.length > 0) {
            const row = existingRes.rows[0];
            const updatedQty = Number(row.quantity) + (foil ? 0 : qty);
            const updatedFoil = Number(row.quantity_foil) + (foil ? qty : 0);
            await client.query(
              `UPDATE user_collections SET quantity = $1, quantity_foil = $2 WHERE id = $3 AND user_id = $4`,
              [updatedQty, updatedFoil, row.id, userId]
            );
            inserted.push({
              ...item,
              id: row.id,
              quantity: updatedQty,
              quantityFoil: updatedFoil,
            });
          } else {
            await client.query(
              `INSERT INTO user_collections (
                id, user_id, card_id, card, quantity, quantity_foil,
                condition, language, purchase_price, notes, binder,
                added_at, last_updated_price_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                id,
                userId,
                key.cardId,
                JSON.stringify(item.card),
                item.quantity || 0,
                item.quantityFoil || 0,
                key.condition,
                key.language,
                item.purchasePrice ?? null,
                item.notes || '',
                key.binder,
                addedAt,
                item.lastUpdatedPriceAt || null,
              ]
            );
            inserted.push({
              ...item,
              id,
              cardId: key.cardId,
              condition: key.condition as CollectionItem['condition'],
              language: key.language as CollectionItem['language'],
              binder: key.binder,
              addedAt,
            });
          }
        }

        await client.query('COMMIT');
        return inserted;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    () => {
      const userDir = getUserDir(userId);
      const colFile = path.join(userDir, 'collection.json');
      const items = readJsonFile<CollectionItem[]>(colFile, []);
      const inserted: CollectionItem[] = [];

      for (const { foil, qty, item, key, id } of parts) {
        const existing = items.find((c) => matchesEntry(c, key));
        if (existing) {
          if (foil) existing.quantityFoil = (existing.quantityFoil || 0) + qty;
          else existing.quantity = (existing.quantity || 0) + qty;
          inserted.push(existing);
        } else {
          const newItem: CollectionItem = {
            ...item,
            id,
            cardId: key.cardId,
            addedAt: item.addedAt || new Date().toISOString(),
            binder: key.binder,
            condition: key.condition as CollectionItem['condition'],
            language: key.language as CollectionItem['language'],
          };
          items.unshift(newItem);
          inserted.push(newItem);
        }
      }

      writeJsonAtomic(colFile, items);
      return inserted;
    }
  );
}

export interface PriceUpdate {
  id: string;
  card: any;
  previousPrices: any | null;
  pricesChangedAt: string | null;
  lastUpdatedPriceAt: string;
}

/**
 * Aktualizuje wyłącznie dane cenowe pozycji kolekcji (karta z nowymi cenami,
 * poprzednie ceny, daty). Nie dotyka ilości, sprzedaży, notatek itp.
 */
export async function updateCollectionPrices(userId: string, updates: PriceUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  return withDb(
    async (p) => {
      const CHUNK = 200;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const params: any[] = [userId];
        const rows = chunk.map((u, k) => {
          const b = 2 + k * 5;
          params.push(u.id, JSON.stringify(u.card), u.previousPrices ? JSON.stringify(u.previousPrices) : null, u.pricesChangedAt, u.lastUpdatedPriceAt);
          return `($${b}, $${b + 1}::jsonb, $${b + 2}::jsonb, $${b + 3}::timestamptz, $${b + 4}::timestamptz)`;
        });
        await p.query(
          `UPDATE user_collections AS c
           SET card = v.card, previous_prices = v.prev, prices_changed_at = v.changed_at, last_updated_price_at = v.updated_at
           FROM (VALUES ${rows.join(', ')}) AS v(id, card, prev, changed_at, updated_at)
           WHERE c.id = v.id AND c.user_id = $1`,
          params
        );
      }
    },
    () => {
      const file = path.join(getUserDir(userId), 'collection.json');
      const items = readJsonFile<CollectionItem[]>(file, []);
      const byId = new Map(updates.map((u) => [u.id, u]));
      for (const item of items) {
        const u = byId.get(item.id);
        if (!u) continue;
        item.card = u.card;
        item.previousPrices = u.previousPrices;
        item.pricesChangedAt = u.pricesChangedAt;
        item.lastUpdatedPriceAt = u.lastUpdatedPriceAt;
      }
      writeJsonAtomic(file, items);
    }
  );
}
