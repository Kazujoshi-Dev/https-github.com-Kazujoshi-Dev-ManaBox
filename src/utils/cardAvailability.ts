import type { CollectionItem, DeckItem } from '../types';
import { isArenaFormat } from './mtgFormats';
import { DEFAULT_BINDER } from './collectionEntry';

/** Klucz karty niezależny od wydania: przednia strona nazwy, małe litery. */
export const cardNameKey = (name: string) => (name || '').split('//')[0].trim().toLowerCase();

export interface CardAvailability {
  /** Wszystkie egzemplarze karty w kolekcji (zwykłe i foil, każde wydanie). */
  owned: number;
  /** Egzemplarze, których nie zajmuje żadna inna talia. */
  free: number;
  /** Klasery z wolnymi egzemplarzami, od największej liczby. */
  freeBinders: { binder: string; qty: number }[];
  /** Inne talie papierowe z tą kartą (niezależnie od tego, czy egzemplarzy starcza dla wszystkich). */
  inDecks: { deckId: string; deckName: string; qty: number }[];
}

interface CopyPool {
  binder: string;
  sourceDeckId: string | null;
  left: number;
}

/**
 * Ile egzemplarzy każdej karty masz wolnych, a ile zajmują Twoje inne talie.
 *
 * Talie są źródłem prawdy: karta w talii papierowej „zajmuje” egzemplarz z kolekcji, niezależnie
 * od tego, jak trafiła do kolekcji. Talie MTG Arena są cyfrowe, więc niczego nie zajmują.
 * Pozycje skopiowane z talii („Dodaj karty talii do klasera”) mają znacznik `sourceDeckId`,
 * dzięki czemu talia zajmuje najpierw własne egzemplarze, a jako wolne zostają te z innych klaserów.
 *
 * @param excludeDeckId talia, dla której liczymy (jej karty niczego nie zajmują)
 */
export function computeCardAvailability(
  collection: CollectionItem[],
  decks: DeckItem[],
  excludeDeckId?: string
): Map<string, CardAvailability> {
  const otherDecks = decks.filter((d) => d.id !== excludeDeckId && !isArenaFormat(d.format));

  // Egzemplarze w kolekcji pogrupowane po nazwie karty
  const pools = new Map<string, CopyPool[]>();
  for (const item of collection) {
    const qty = (item.quantity || 0) + (item.quantityFoil || 0);
    if (!item.card?.name || qty <= 0) continue;
    const key = cardNameKey(item.card.name);
    const list = pools.get(key) || [];
    list.push({ binder: item.binder || DEFAULT_BINDER, sourceDeckId: item.sourceDeckId || null, left: qty });
    pools.set(key, list);
  }

  // Ile sztuk każdej karty potrzebuje każda inna talia (główna talia i dowódca, bez sideboardu)
  const needs = new Map<string, { deckId: string; deckName: string; qty: number }[]>();
  for (const deck of otherDecks) {
    const perDeck = new Map<string, number>();
    for (const e of deck.cards || []) {
      if (e.isSideboard || !e.card?.name) continue;
      const key = cardNameKey(e.card.name);
      perDeck.set(key, (perDeck.get(key) || 0) + (e.quantity || 0));
    }
    if (deck.commander?.name) {
      const key = cardNameKey(deck.commander.name);
      perDeck.set(key, Math.max(perDeck.get(key) || 0, 1));
    }
    for (const [key, qty] of perDeck) {
      if (qty <= 0) continue;
      const list = needs.get(key) || [];
      list.push({ deckId: deck.id, deckName: deck.name, qty });
      needs.set(key, list);
    }
  }

  const liveDeckIds = new Set(otherDecks.map((d) => d.id));
  const result = new Map<string, CardAvailability>();
  const keys = new Set([...pools.keys(), ...needs.keys()]);

  for (const key of keys) {
    const copies = (pools.get(key) || []).map((c) => ({ ...c }));
    const inDecks = (needs.get(key) || []).slice().sort((a, b) => a.deckName.localeCompare(b.deckName));
    const owned = copies.reduce((s, c) => s + c.left, 0);

    // Talia zajmuje kolejno: egzemplarze skopiowane z niej samej, potem bez znacznika
    // (albo ze znacznikiem usuniętej talii), a na końcu skopiowane z innych talii.
    const take = (deckId: string, qty: number) => {
      let need = qty;
      const rank = (c: CopyPool) =>
        c.sourceDeckId === deckId ? 0 : !c.sourceDeckId || !liveDeckIds.has(c.sourceDeckId) ? 1 : 2;
      for (const c of copies.slice().sort((a, b) => rank(a) - rank(b))) {
        if (need <= 0) break;
        const used = Math.min(c.left, need);
        c.left -= used;
        need -= used;
      }
    };
    // Najpierw talie, które mają własne skopiowane egzemplarze, żeby nie zabrały ich inne
    const ordered = inDecks.slice().sort((a, b) => {
      const own = (d: { deckId: string }) => (copies.some((c) => c.sourceDeckId === d.deckId) ? 0 : 1);
      return own(a) - own(b);
    });
    for (const d of ordered) take(d.deckId, d.qty);

    const byBinder = new Map<string, number>();
    for (const c of copies) if (c.left > 0) byBinder.set(c.binder, (byBinder.get(c.binder) || 0) + c.left);
    const freeBinders = [...byBinder.entries()]
      .map(([binder, qty]) => ({ binder, qty }))
      .sort((a, b) => b.qty - a.qty || a.binder.localeCompare(b.binder));

    result.set(key, {
      owned,
      free: freeBinders.reduce((s, b) => s + b.qty, 0),
      freeBinders,
      inDecks
    });
  }
  return result;
}
