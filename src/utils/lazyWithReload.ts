import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'ms_chunk_reload_at';
/** Nie przeładowujemy częściej niż raz na tyle ms (ochrona przed pętlą przy realnej awarii sieci). */
const MIN_INTERVAL_MS = 30_000;

/**
 * Po wdrożeniu nowej wersji stare pliki JS (z hashem w nazwie) znikają z serwera.
 * Karta otwarta przed wdrożeniem nie doładuje wtedy modułu ładowanego leniwie
 * („Failed to fetch dynamically imported module”). W takiej sytuacji przeładowujemy
 * stronę, co pobiera nowy index.html i aktualne pliki.
 * Zwraca true, jeśli przeładowanie zostało wywołane.
 */
export function reloadAfterChunkError(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  } catch {
    /* brak storage */
  }
  if (Date.now() - last < MIN_INTERVAL_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* brak storage */
  }
  window.location.reload();
  return true;
}

/** React.lazy, który po nieudanym doładowaniu modułu (np. po wdrożeniu) przeładowuje stronę. */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      if (reloadAfterChunkError()) {
        // Strona się przeładowuje; nie pokazujemy błędu w międzyczasie.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    })
  );
}
