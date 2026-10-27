import { WishlistItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, userGameFile } from '../storage';
import { DEFAULT_GAME, type GameId } from '../../../games';

const wishFile = (userId: string, game: GameId) => userGameFile(userId, 'wishlist', game);
import { mapWishlistRow } from '../mappers';

export async function getWishlist(userId: string, game: GameId = DEFAULT_GAME): Promise<WishlistItem[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, card_id as "cardId", card, target_quantity as "targetQuantity",
                is_foil as "isFoil", notes, added_at as "addedAt"
         FROM user_wishlists WHERE user_id = $1 AND game = $2 ORDER BY added_at DESC`,
        [userId, game]
      );
      return res.rows.map(mapWishlistRow);
    },
    () => readJsonFile<WishlistItem[]>(wishFile(userId, game), [])
  );
}

export async function addWishlistItem(userId: string, item: WishlistItem, game: GameId = DEFAULT_GAME): Promise<WishlistItem> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_wishlists (id, user_id, card_id, card, target_quantity, is_foil, notes, added_at, game)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          userId,
          item.cardId || item.card.id,
          JSON.stringify(item.card),
          item.targetQuantity || 1,
          Boolean(item.isFoil),
          item.notes || '',
          item.addedAt || new Date().toISOString(),
          game
        ]
      );
      return item;
    },
    () => {
      const file = wishFile(userId, game);
      const list = readJsonFile<WishlistItem[]>(file, []);
      list.unshift(item);
      writeJsonAtomic(file, list);
      return item;
    }
  );
}

export interface WishlistItemPatch {
  card?: any;
  isFoil?: boolean;
  targetQuantity?: number;
  notes?: string;
}

/** Zmiana pozycji listy życzeń (wersja/print, foil, liczba sztuk, notatka). */
export async function updateWishlistItem(userId: string, id: string, patch: WishlistItemPatch, game: GameId = DEFAULT_GAME): Promise<WishlistItem | null> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `UPDATE user_wishlists SET
           card = COALESCE($3::jsonb, card),
           card_id = COALESCE($4, card_id),
           is_foil = COALESCE($5, is_foil),
           target_quantity = COALESCE($6, target_quantity),
           notes = COALESCE($7, notes)
         WHERE id = $1 AND user_id = $2 AND game = $8
         RETURNING id, card_id as "cardId", card, target_quantity as "targetQuantity",
                   is_foil as "isFoil", notes, added_at as "addedAt"`,
        [
          id,
          userId,
          patch.card ? JSON.stringify(patch.card) : null,
          patch.card?.id ?? null,
          patch.isFoil ?? null,
          patch.targetQuantity ?? null,
          patch.notes ?? null,
          game
        ]
      );
      return res.rows[0] ? mapWishlistRow(res.rows[0]) : null;
    },
    () => {
      const file = wishFile(userId, game);
      const list = readJsonFile<WishlistItem[]>(file, []);
      const idx = list.findIndex((i) => i.id === id);
      if (idx === -1) return null;
      const cur = list[idx];
      list[idx] = {
        ...cur,
        ...(patch.card ? { card: patch.card, cardId: patch.card.id } : {}),
        ...(patch.isFoil !== undefined ? { isFoil: patch.isFoil } : {}),
        ...(patch.targetQuantity !== undefined ? { targetQuantity: patch.targetQuantity } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {})
      };
      writeJsonAtomic(file, list);
      return list[idx];
    }
  );
}

export async function deleteWishlistItem(userId: string, id: string, game: GameId = DEFAULT_GAME): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query('DELETE FROM user_wishlists WHERE id = $1 AND user_id = $2 AND game = $3', [id, userId, game]);
      return (res.rowCount ?? 0) > 0;
    },
    () => {
      const file = wishFile(userId, game);
      const list = readJsonFile<WishlistItem[]>(file, []);
      const nextList = list.filter((i) => i.id !== id);
      if (nextList.length !== list.length) {
        writeJsonAtomic(file, nextList);
        return true;
      }
      return false;
    }
  );
}
