import path from 'path';
import { DeckItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapDeckRow } from '../mappers';

export async function getDecks(userId: string): Promise<DeckItem[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, name, format, description, card_source as "cardSource", commander,
                commander_is_foil as "commanderIsFoil", cards, is_public as "isPublic",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM user_decks WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId]
      );
      return res.rows.map(mapDeckRow);
    },
    () => {
      const userDir = getUserDir(userId);
      return readJsonFile<DeckItem[]>(path.join(userDir, 'decks.json'), []);
    }
  );
}

export async function saveDeck(userId: string, deck: DeckItem): Promise<DeckItem | null> {
  const format = deck.format || 'EDH Commander';
  const cardSource = deck.cardSource || 'collection';
  const now = new Date().toISOString();
  const deckToSave: DeckItem = {
    ...deck,
    format,
    cardSource,
    updatedAt: now
  };

  return withDb(
    async (p) => {
      // Aktualizacja tylko własnej talii: przy cudzym id konflikt nie zmienia wiersza (null → 404)
      const res = await p.query(
        `INSERT INTO user_decks (id, user_id, name, format, description, card_source, commander, commander_is_foil, cards, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           format = EXCLUDED.format,
           description = EXCLUDED.description,
           card_source = EXCLUDED.card_source,
           commander = EXCLUDED.commander,
           commander_is_foil = EXCLUDED.commander_is_foil,
           cards = EXCLUDED.cards,
           updated_at = EXCLUDED.updated_at
         WHERE user_decks.user_id = EXCLUDED.user_id
         RETURNING is_public`,
        [
          deckToSave.id,
          userId,
          deckToSave.name,
          deckToSave.format,
          deckToSave.description || '',
          deckToSave.cardSource,
          deckToSave.commander ? JSON.stringify(deckToSave.commander) : null,
          Boolean(deckToSave.commanderIsFoil),
          JSON.stringify(deckToSave.cards || []),
          deckToSave.createdAt || now,
          now
        ]
      );
      if (!res.rows[0]) return null;
      return { ...deckToSave, isPublic: Boolean(res.rows[0].is_public) };
    },
    () => {
      const userDir = getUserDir(userId);
      const file = path.join(userDir, 'decks.json');
      const decks = readJsonFile<DeckItem[]>(file, []);
      const idx = decks.findIndex((d) => d.id === deck.id);
      if (idx >= 0) {
        decks[idx] = deckToSave;
      } else {
        decks.unshift(deckToSave);
      }
      writeJsonAtomic(file, decks);
      return deckToSave;
    }
  );
}

/** Włącza/wyłącza publiczny link do talii. */
export async function setDeckPublic(userId: string, id: string, isPublic: boolean): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query('UPDATE user_decks SET is_public = $3 WHERE id = $1 AND user_id = $2', [id, userId, isPublic]);
      return (res.rowCount ?? 0) > 0;
    },
    () => {
      const file = path.join(getUserDir(userId), 'decks.json');
      const decks = readJsonFile<DeckItem[]>(file, []);
      const deck = decks.find((d) => d.id === id);
      if (!deck) return false;
      deck.isPublic = isPublic;
      writeJsonAtomic(file, decks);
      return true;
    }
  );
}

/** Publiczna talia (tylko gdy właściciel włączył link). */
export async function getPublicDeck(id: string): Promise<{ deck: DeckItem; userId: string } | null> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, user_id, name, format, description, card_source as "cardSource", commander,
                commander_is_foil as "commanderIsFoil", cards, is_public as "isPublic",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM user_decks WHERE id = $1 AND is_public = TRUE LIMIT 1`,
        [id]
      );
      return res.rows[0] ? { deck: mapDeckRow(res.rows[0]), userId: res.rows[0].user_id } : null;
    },
    () => null
  );
}

export async function deleteDeck(userId: string, id: string): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query('DELETE FROM user_decks WHERE id = $1 AND user_id = $2', [id, userId]);
      return (res.rowCount ?? 0) > 0;
    },
    () => {
      const userDir = getUserDir(userId);
      const file = path.join(userDir, 'decks.json');
      const decks = readJsonFile<DeckItem[]>(file, []);
      const nextDecks = decks.filter((d) => d.id !== id);
      if (nextDecks.length !== decks.length) {
        writeJsonAtomic(file, nextDecks);
        return true;
      }
      return false;
    }
  );
}
