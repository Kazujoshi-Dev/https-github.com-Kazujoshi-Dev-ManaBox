/**
 * Źródło danych kart zależnie od gry: MTG korzysta ze Scryfall (przez nasz serwer),
 * Disney Lorcana z lokalnej bazy Lorcast na serwerze. Odpowiedzi mają ten sam kształt
 * ({ data: [...] }), więc komponenty wyszukiwania i okno karty działają dla obu gier.
 */
import { DEFAULT_GAME, type GameId } from '../games';
import type { ScryfallCard } from '../types';

/** Gra, do której należy karta (brak pola = MTG). */
export const gameOfCard = (card: Pick<ScryfallCard, 'game'> | null | undefined): GameId => card?.game || DEFAULT_GAME;
export const isMtgCard = (card: Pick<ScryfallCard, 'game'> | null | undefined): boolean => gameOfCard(card) === 'mtg';

export function searchUrl(game: GameId, query: string, opts: { includeArena?: boolean } = {}): string {
  const q = encodeURIComponent(query);
  if (game === 'lorcana') return `/api/lorcana/search?q=${q}`;
  return `/api/scryfall/search?q=${q}${opts.includeArena === undefined ? '' : `&game=${opts.includeArena ? 'all' : 'paper'}`}`;
}

export function autocompleteUrl(game: GameId, query: string): string {
  const q = encodeURIComponent(query);
  return game === 'lorcana' ? `/api/lorcana/autocomplete?q=${q}` : `/api/scryfall/autocomplete?q=${q}`;
}

export function printsUrl(card: Pick<ScryfallCard, 'id' | 'oracle_id' | 'name' | 'game'>): string {
  const params = new URLSearchParams();
  if (card.id) params.set('cardId', card.id);
  if (card.name) params.set('name', card.name);
  if (gameOfCard(card) === 'lorcana') return `/api/lorcana/prints?${params.toString()}`;
  if (card.oracle_id) params.set('oracle_id', card.oracle_id);
  return `/api/scryfall/prints?${params.toString()}`;
}

/** Nazwa źródła cen pokazywana przy cenach karty. */
export const priceSourceLabel = (card: Pick<ScryfallCard, 'game'>): string => (gameOfCard(card) === 'lorcana' ? 'Lorcast' : 'Scryfall');
