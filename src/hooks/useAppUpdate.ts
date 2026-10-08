import { useCallback, useEffect, useState } from 'react';
import { checkServerVersion, isUpdatePending, reloadToNewVersion, subscribeUpdate } from '../utils/appVersion';
import { hasOpenOverlay } from './useBackButton';

/** Co ile sprawdzać wersję, gdy karta jest widoczna. */
const POLL_MS = 5 * 60_000;
/** Po jakim czasie w tle przeładować kartę do nowej wersji. */
const HIDDEN_RELOAD_MS = 60_000;
/** Po jakim czasie bez zmiany zakładki pokazać pasek „Dostępna nowa wersja”. */
const BANNER_DELAY_MS = 10 * 60_000;

/**
 * Pilnuje, żeby użytkownik zawsze miał najnowszą wersję aplikacji:
 *  - sprawdza wersję po powrocie do karty, przy fokusie okna i co kilka minut,
 *  - nowa wersja wchodzi przy najbliższej zmianie zakładki (navigate) albo gdy karta jest w tle,
 *  - nie przeładowuje, gdy otwarte jest okno/formularz (overlay),
 *  - jeśli użytkownik długo siedzi na jednej zakładce, zwraca showBanner = true.
 */
export function useAppUpdate() {
  const [pending, setPending] = useState<boolean>(() => isUpdatePending());
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => subscribeUpdate(() => setPending(isUpdatePending())), []);

  // Sprawdzanie wersji
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void checkServerVersion();
    };
    check();
    const t = window.setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
    };
  }, []);

  // Karta w tle: przeładowujemy po chwili, żeby po powrocie była już nowa wersja
  useEffect(() => {
    if (!pending) return;
    let timer: number | undefined;
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => {
          if (document.visibilityState === 'hidden' && !hasOpenOverlay() && isUpdatePending()) {
            reloadToNewVersion();
          }
        }, HIDDEN_RELOAD_MS);
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pending]);

  // Pasek z przyciskiem „Odśwież”, gdy aktualizacja czeka zbyt długo
  useEffect(() => {
    if (!pending) {
      setShowBanner(false);
      return;
    }
    const t = window.setTimeout(() => setShowBanner(true), BANNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  /**
   * Zmiana zakładki przez użytkownika. Jeśli czeka nowa wersja i nic nie jest otwarte,
   * przeładowuje stronę prosto na docelową zakładkę i zwraca true.
   */
  const applyOnNavigate = useCallback((tab: string): boolean => {
    if (!isUpdatePending() || hasOpenOverlay()) return false;
    reloadToNewVersion(tab);
    return true;
  }, []);

  const reloadNow = useCallback((currentTab?: string) => reloadToNewVersion(currentTab), []);

  return { updatePending: pending, showUpdateBanner: showBanner, applyOnNavigate, reloadNow };
}
