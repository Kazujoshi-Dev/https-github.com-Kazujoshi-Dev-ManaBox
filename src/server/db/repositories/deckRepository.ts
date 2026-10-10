import path from 'path';
import { DeckItem, CommunityDeckSummary } from '../../../types';
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

/** Publiczne talie aktywnych użytkowników: najpierw najczęściej polubione, potem ostatnio zmienione. */
export async function listCommunityDecks(viewerId: string | null, limit = 300): Promise<CommunityDeckSummary[]> {
  return withDb(
    async (p) => {
      const art = (c: string) => `COALESCE(${c}->'image_uris'->>'art_crop', ${c}->'card_faces'->0->'image_uris'->>'art_crop')`;
      const artist = (c: string) => `COALESCE(${c}->>'artist', ${c}->'card_faces'->0->>'artist')`;
      const res = await p.query(
        `SELECT d.id, d.name, d.format, LEFT(COALESCE(d.description, ''), 280) AS description, u.username,
                COALESCE(d.updated_at, d.created_at) AS updated_at,
                d.commander->>'name' AS commander_name,
                ${art('d.commander')} AS commander_art,
                ${artist('d.commander')} AS commander_artist,
                first_card.art AS card_art, first_card.artist AS card_artist,
                (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) AS likes,
                EXISTS (SELECT 1 FROM deck_likes l WHERE l.deck_id = d.id AND l.user_id = $2) AS liked_by_me,
                (SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(e->'quantity') = 'number' THEN (e->>'quantity')::numeric ELSE 0 END), 0)
                   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.cards) = 'array' THEN d.cards ELSE '[]'::jsonb END) e
                  WHERE COALESCE(e->>'isSideboard', 'false') <> 'true') AS main_count,
                (SELECT COALESCE(jsonb_agg(DISTINCT col), '[]'::jsonb)
                   FROM (
                     SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(d.commander->'color_identity') = 'array' THEN d.commander->'color_identity' ELSE '[]'::jsonb END) AS col
                     UNION
                     SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(e->'card'->'color_identity') = 'array' THEN e->'card'->'color_identity' ELSE '[]'::jsonb END)
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.cards) = 'array' THEN d.cards ELSE '[]'::jsonb END) e
                      WHERE COALESCE(e->>'isSideboard', 'false') <> 'true'
                   ) cols) AS colors
           FROM user_decks d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN LATERAL (
             SELECT ${art("e->'card'")} AS art, ${artist("e->'card'")} AS artist
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.cards) = 'array' THEN d.cards ELSE '[]'::jsonb END) e
              WHERE ${art("e->'card'")} IS NOT NULL
              LIMIT 1
           ) first_card ON TRUE
          WHERE d.is_public = TRUE
            AND NOT COALESCE(u.ban_permanent, FALSE)
            AND (u.banned_until IS NULL OR u.banned_until < NOW())
          ORDER BY likes DESC, updated_at DESC
          LIMIT $1`,
        [limit, viewerId || '']
      );
      return res.rows.map((r: any) => {
        const hasCommander = Boolean(r.commander_name);
        return {
          id: String(r.id),
          name: String(r.name || ''),
          format: r.format || 'EDH Commander',
          description: r.description || '',
          owner: String(r.username || ''),
          commanderName: r.commander_name || null,
          art: (hasCommander ? r.commander_art : null) || r.card_art || null,
          artist: (hasCommander && r.commander_art ? r.commander_artist : r.card_artist) || null,
          colors: Array.isArray(r.colors) ? r.colors.map(String) : [],
          cardCount: Number(r.main_count) || 0,
          likes: Number(r.likes) || 0,
          likedByMe: Boolean(r.liked_by_me),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
        };
      });
    },
    () => []
  );
}

export type DeckLikeResult = { ok: true; likes: number; liked: boolean } | { ok: false; reason: 'not_found' | 'own_deck' };

/**
 * Polubienie talii społeczności (liked = true) lub jego cofnięcie. Tylko cudze, publiczne talie
 * aktywnych kont; ta sama osoba może polubić talię najwyżej raz.
 */
export async function setDeckLike(userId: string, deckId: string, liked: boolean): Promise<DeckLikeResult> {
  return withDb<DeckLikeResult>(
    async (p) => {
      const deck = await p.query(
        `SELECT d.user_id FROM user_decks d JOIN users u ON u.id = d.user_id
          WHERE d.id = $1 AND d.is_public = TRUE
            AND NOT COALESCE(u.ban_permanent, FALSE)
            AND (u.banned_until IS NULL OR u.banned_until < NOW())`,
        [deckId]
      );
      if (!deck.rows[0]) return { ok: false, reason: 'not_found' };
      if (deck.rows[0].user_id === userId) return { ok: false, reason: 'own_deck' };
      if (liked) {
        await p.query('INSERT INTO deck_likes (deck_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [deckId, userId]);
      } else {
        await p.query('DELETE FROM deck_likes WHERE deck_id = $1 AND user_id = $2', [deckId, userId]);
      }
      const count = await p.query('SELECT COUNT(*) AS n FROM deck_likes WHERE deck_id = $1', [deckId]);
      return { ok: true, likes: Number(count.rows[0]?.n) || 0, liked };
    },
    () => ({ ok: false, reason: 'not_found' })
  );
}
