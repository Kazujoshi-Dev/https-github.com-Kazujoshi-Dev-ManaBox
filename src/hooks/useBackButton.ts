/**
 * Przycisk/gest „Wstecz” jak w aplikacji mobilnej.
 *
 * Aplikacja to jedna strona, więc bez tego „Wstecz” na telefonie od razu
 * zamyka kartę przeglądarki. Tutaj:
 *  - każde otwarte okno/arkusz dodaje wpis do historii; „Wstecz” zamyka
 *    najwyżej położone okno (zamknięcie przyciskiem usuwa ten wpis),
 *  - zmiana zakładki też trafia do historii, więc „Wstecz” wraca do
 *    poprzedniej zakładki, a stronę opuszcza dopiero na końcu.
 */
import { useCallback, useEffect, useRef } from 'react';

interface OverlayEntry {
  close: () => void;
}

const overlayStack: OverlayEntry[] = [];
/** Ile zdarzeń popstate pochodzi od nas (history.back() po zamknięciu okna przyciskiem) — ignorujemy je. */
let ownBackCalls = 0;
let tabHandler: ((tab: string | undefined) => void) | null = null;
let listening = false;
/**
 * Wpisy historii zwolnione przez okna zamknięte w aplikacji, jeszcze nieusunięte.
 * Usuwamy je chwilę później (history.go), a jeśli w międzyczasie otworzy się nowe
 * okno lub zmieni zakładka — przejmuje taki wpis zamiast dodawać nowy. Jednoczesne
 * history.back() i pushState() psuły kolejność w historii.
 */
let releasedEntries = 0;
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    if (releasedEntries > 0) {
      const n = releasedEntries;
      releasedEntries = 0;
      ownBackCalls++;
      window.history.go(-n);
    }
  }, 0);
}

/** Nowy wpis historii — albo przejęcie wpisu zwolnionego przed chwilą. */
function pushOrReuse(state: Record<string, unknown>) {
  if (releasedEntries > 0) {
    releasedEntries--;
    window.history.replaceState(state, '');
  } else {
    window.history.pushState(state, '');
  }
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', (e) => {
    if (ownBackCalls > 0) {
      ownBackCalls--;
      return;
    }
    const top = overlayStack.pop();
    if (top) {
      top.close();
      return;
    }
    tabHandler?.((e.state as any)?.msTab);
  });
}

/** Zamyka okno gestem/przyciskiem „Wstecz”, gdy `open` jest prawdą. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    ensureListener();
    const entry: OverlayEntry = { close: () => onCloseRef.current() };
    // zachowujemy bieżącą zakładkę w stanie wpisu, żeby powrót do niego jej nie zmienił
    pushOrReuse({ ...(window.history.state || {}), msOverlay: true });
    overlayStack.push(entry);
    return () => {
      const idx = overlayStack.indexOf(entry);
      if (idx >= 0) {
        // zamknięte w aplikacji (nie przez „Wstecz”) — usuwamy nasz wpis z historii
        overlayStack.splice(idx, 1);
        releasedEntries++;
        scheduleFlush();
      }
    };
  }, [open]);
}

/**
 * Zakładki w historii przeglądarki. Zwraca funkcję przełączania zakładki,
 * której należy używać zamiast bezpośredniego `setActiveTab`.
 */
export function useHistoryTabs<T extends string>(activeTab: T, setActiveTab: (tab: T) => void, defaultTab: T) {
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    ensureListener();
    window.history.replaceState({ ...(window.history.state || {}), msTab: activeRef.current }, '');
    tabHandler = (tab) => setActiveTab((tab as T) || defaultTab);
    return () => {
      tabHandler = null;
    };
  }, [setActiveTab, defaultTab]);

  return useCallback((tab: T) => {
    if (tab === activeRef.current) return;
    pushOrReuse({ msTab: tab });
    setActiveTab(tab);
  }, [setActiveTab]);
}
