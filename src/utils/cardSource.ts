/**
 * Źródło danych kart zależnie od gry: MTG korzysta ze Scryfall (przez nasz serwer),
 * Disney Lorcana z lokalnej bazy Lorcast, a Pokémon TCG z TCGdex (lista kart lokalnie,
 * szczegóły i ceny na żądanie). Odpowiedzi mają ten sam kształt ({ data: [...] }),
 * więc komponenty wyszukiwania i okno karty działają dla wszystkich gier.
 */
import { DEFAULT_GAME, type GameId } from '../games';
import type { ScryfallCard } from '../types';

/** Gra, do której należy karta (brak pola = MTG). */
export const gameOfCard = (card: Pick<ScryfallCard, 'game'> | null | undefined): GameId => card?.game || DEFAULT_GAME;
export const isMtgCard = (card: Pick<ScryfallCard, 'game'> | null | undefined): boolean => gameOfCard(card) === 'mtg';

export function searchUrl(game: GameId, query: string, opts: { includeArena?: boolean } = {}): string {
  const q = encodeURIComponent(query);
  if (game === 'lorcana') return `/api/lorcana/search?q=${q}`;
  if (game === 'pokemon') return `/api/pokemon/search?q=${q}`;
  return `/api/scryfall/search?q=${q}${opts.includeArena === undefined ? '' : `&game=${opts.includeArena ? 'all' : 'paper'}`}`;
}

export function autocompleteUrl(game: GameId, query: string): string {
  const q = encodeURIComponent(query);
  if (game === 'lorcana') return `/api/lorcana/autocomplete?q=${q}`;
  if (game === 'pokemon') return `/api/pokemon/autocomplete?q=${q}`;
  return `/api/scryfall/autocomplete?q=${q}`;
}

export function printsUrl(card: Pick<ScryfallCard, 'id' | 'oracle_id' | 'name' | 'game'>): string {
  const params = new URLSearchParams();
  if (card.id) params.set('cardId', card.id);
  if (card.name) params.set('name', card.name);
  if (gameOfCard(card) === 'lorcana') return `/api/lorcana/prints?${params.toString()}`;
  if (gameOfCard(card) === 'pokemon') return `/api/pokemon/prints?${params.toString()}`;
  if (card.oracle_id) params.set('oracle_id', card.oracle_id);
  return `/api/scryfall/prints?${params.toString()}`;
}

/** Nazwa źródła cen pokazywana przy cenach karty. */
export const priceSourceLabel = (card: Pick<ScryfallCard, 'game' | 'price_source'>): string => {
  if (card.price_source) return card.price_source;
  const game = gameOfCard(card);
  return game === 'lorcana' ? 'Lorcast' : game === 'pokemon' ? 'TCGdex' : 'Scryfall';
};

/**
 * Pełne dane karty, gdy mamy tylko jej wersję z listy (Pokémon: wyniki wyszukiwania bez rzadkości
 * i cen). Przy błędzie zwraca kartę bez zmian.
 */
export async function fetchFullCard(card: ScryfallCard): Promise<ScryfallCard> {
  if (!card?.partial || gameOfCard(card) !== 'pokemon') return card;
  try {
    const res = await fetch(`/api/pokemon/card/${encodeURIComponent(card.id)}`);
    if (!res.ok) return card;
    const full = (await res.json()) as ScryfallCard;
    return full?.id === card.id ? full : card;
  } catch {
    return card;
  }
}

/**
 * Pokémon: uzupełnia w tle szczegóły i ceny kart z listy (np. wyników wyszukiwania), paczkami
 * po kilkanaście, żeby ceny pojawiały się stopniowo. `onChunk` dostaje pełne karty z każdej paczki;
 * `isCancelled` przerywa pracę, gdy lista na ekranie się zmieniła.
 */
export async function fillPartialCards(
  cards: ScryfallCard[],
  onChunk: (full: ScryfallCard[]) => void,
  isCancelled: () => boolean = () => false,
  max = 48
): Promise<void> {
  const ids = cards.filter((c) => c.partial && gameOfCard(c) === 'pokemon').map((c) => c.id).slice(0, max);
  const CHUNK = 12;
  for (let i = 0; i < ids.length; i += CHUNK) {
    if (isCancelled()) return;
    try {
      const res = await fetch('/api/pokemon/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(i, i + CHUNK) })
      });
      if (!res.ok) return; // limit zapytań lub chwilowy błąd: resztę uzupełni otwarcie karty
      const json = await res.json();
      if (!isCancelled() && Array.isArray(json?.data) && json.data.length) onChunk(json.data as ScryfallCard[]);
    } catch {
      return;
    }
  }
}

/** Podmienia na liście karty, dla których przyszły pełne dane. */
export function mergeFullCards(list: ScryfallCard[], full: ScryfallCard[]): ScryfallCard[] {
  const byId = new Map(full.map((c) => [c.id, c]));
  return list.map((c) => byId.get(c.id) || c);
}
