import type { DeckCardEntry, ScryfallCard } from '../../types';

export type DeckCardSort = 'name' | 'cmc' | 'color';

export const DECK_SORT_OPTIONS: Array<{ id: DeckCardSort; label: string; title: string }> = [
  { id: 'name', label: 'Nazwa', title: 'Alfabetycznie' },
  { id: 'cmc', label: 'Koszt', title: 'Według kosztu many (CMC), potem alfabetycznie' },
  { id: 'color', label: 'Kolor', title: 'Według koloru (W, U, B, R, G, wielokolorowe, bezbarwne), potem kosztu' }
];

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/** Grupa koloru: 0–4 jednokolorowe w kolejności WUBRG, 5 wielokolorowe, 6 bezbarwne. */
function colorRank(card: ScryfallCard): number {
  const fromCost = WUBRG.filter((c) => (card.mana_cost || card.card_faces?.[0]?.mana_cost || '').toUpperCase().includes(c));
  const colors = card.colors?.length
    ? card.colors
    : card.card_faces?.[0]?.colors?.length
      ? card.card_faces[0].colors!
      : fromCost.length
        ? fromCost
        : card.color_identity || [];
  const isLand = /\bland\b/i.test(card.type_line || '');
  const list = isLand ? [] : colors;
  if (list.length === 0) return 6;
  if (list.length > 1) return 5;
  return WUBRG.indexOf(list[0]);
}

const byName = (a: DeckCardEntry, b: DeckCardEntry) => a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });

export function sortDeckEntries(entries: DeckCardEntry[], mode: DeckCardSort): DeckCardEntry[] {
  const list = [...entries];
  if (mode === 'cmc') return list.sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || byName(a, b));
  if (mode === 'color') return list.sort((a, b) => colorRank(a.card) - colorRank(b.card) || (a.card.cmc || 0) - (b.card.cmc || 0) || byName(a, b));
  return list.sort(byName);
}

const STORAGE_KEY = 'ms_deck_card_sort';

export function loadDeckSort(): DeckCardSort {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'cmc' || v === 'color' || v === 'name' ? v : 'name';
  } catch {
    return 'name';
  }
}

export function saveDeckSort(mode: DeckCardSort) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* brak dostępu do pamięci przeglądarki – zostaje tylko w tej sesji */
  }
}
