import { useCallback, useEffect, useState } from 'react';
import { changelogApi } from '../services/api';

const SEEN_KEY = 'ms_changelog_seen_day';

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};

/**
 * Czy w dzienniku zmian jest wpis, którego użytkownik jeszcze nie widział.
 * Pierwsze uruchomienie (brak zapisanego dnia) też pokazuje kropkę, żeby zakładka została zauważona.
 */
export function useChangelogBadge(enabled: boolean) {
  const [latestDay, setLatestDay] = useState<string | null>(null);
  const [seenDay, setSeenDay] = useState<string | null>(readSeen);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      changelogApi
        .list(1)
        .then((d) => !cancelled && setLatestDay(d.releases[0]?.day || null))
        .catch(() => {});
    load();
    // Nowy wpis pojawia się o 23:30; sprawdzamy co godzinę, gdy karta jest otwarta
    const t = window.setInterval(load, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [enabled]);

  const markSeen = useCallback((day?: string) => {
    const d = day || latestDay;
    if (!d) return;
    try {
      localStorage.setItem(SEEN_KEY, d);
    } catch {
      /* brak dostępu do pamięci przeglądarki */
    }
    setSeenDay(d);
    setLatestDay((cur) => (!cur || cur < d ? d : cur));
  }, [latestDay]);

  return { hasNew: Boolean(latestDay && (!seenDay || seenDay < latestDay)), markSeen };
}
