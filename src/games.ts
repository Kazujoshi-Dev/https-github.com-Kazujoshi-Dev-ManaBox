/**
 * Gry karciane obsługiwane przez aplikację. Każda gra ma osobną kolekcję, klasery, listę życzeń,
 * talie i oferty „Sprzedam”; konto, ustawienia, wiadomości i profil są wspólne.
 *
 * Wspólny plik dla serwera i przeglądarki.
 */

export const GAME_IDS = ['mtg', 'pokemon', 'lorcana'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Gra domyślna: wszystkie dane sprzed wprowadzenia wielu gier należą do Magic: The Gathering. */
export const DEFAULT_GAME: GameId = 'mtg';

/** Nagłówek HTTP, w którym przeglądarka przesyła aktywną grę. */
export const GAME_HEADER = 'x-game';

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

/** Dowolna wartość → identyfikator gry; nieznana lub pusta oznacza grę domyślną. */
export function normalizeGame(value: unknown): GameId {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return isGameId(v) ? v : DEFAULT_GAME;
}

export interface GameInfo {
  id: GameId;
  /** Pełna nazwa gry (nazwa własna, bez tłumaczenia). */
  name: string;
  /** Krótka nazwa do przełącznika w nagłówku. */
  shortName: string;
  /** Gra jest już dostępna; pozostałe pokazujemy jako „Wkrótce”. */
  available: boolean;
}

export const GAMES: Record<GameId, GameInfo> = {
  mtg: { id: 'mtg', name: 'Magic: The Gathering', shortName: 'Magic', available: true },
  pokemon: { id: 'pokemon', name: 'Pokémon TCG', shortName: 'Pokémon', available: false },
  lorcana: { id: 'lorcana', name: 'Disney Lorcana', shortName: 'Lorcana', available: true }
};

export const GAME_LIST: GameInfo[] = GAME_IDS.map((id) => GAMES[id]);

/** Gra dostępna do wyboru (identyfikator znany i gra już działa). */
export function isGameAvailable(value: unknown): value is GameId {
  return isGameId(value) && GAMES[value].available;
}

/**
 * Zakładki, które działają tylko dla Magic: The Gathering (dane Scryfall, EDHREC, Commander Spellbook,
 * skaner rozpoznający karty MTG). W innych grach są ukryte. „Gracze” (oferty i mapa sprzedawców)
 * pokazują na razie tylko karty MTG.
 */
export const MTG_ONLY_TABS = ['decks', 'community-decks', 'set-top', 'price-alerts', 'spoilers', 'users'] as const;

export function isTabAvailable(tab: string, game: GameId): boolean {
  if (game === 'mtg') return true;
  return !(MTG_ONLY_TABS as readonly string[]).includes(tab);
}

/** Skaner kamerą rozpoznaje na razie tylko karty MTG. */
export const hasScanner = (game: GameId): boolean => game === 'mtg';
