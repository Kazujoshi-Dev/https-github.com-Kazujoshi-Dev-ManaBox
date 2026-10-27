/**
 * Aktywna gra karciana w przeglądarce. Zapamiętana w localStorage, a każde zapytanie
 * z logowaniem (fetchWithAuth) wysyła ją serwerowi w nagłówku, więc dane kolekcji, klaserów,
 * listy życzeń, talii i „Sprzedam” dotyczą wybranej gry.
 */
import { DEFAULT_GAME, isGameAvailable, type GameId } from '../games';

const STORAGE_KEY = 'manascrew_active_game';

function readStored(): GameId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isGameAvailable(v) ? v : DEFAULT_GAME;
  } catch {
    return DEFAULT_GAME;
  }
}

let current: GameId = typeof window === 'undefined' ? DEFAULT_GAME : readStored();

export function getActiveGame(): GameId {
  return current;
}

export function setActiveGame(game: GameId): void {
  current = isGameAvailable(game) ? game : DEFAULT_GAME;
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // tryb prywatny: wybór działa do zamknięcia karty
  }
}
