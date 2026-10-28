import { useEffect, useState } from 'react';
import { edhrecApi, type EdhrecCommanderData } from '../../services/api';

// Jedno zapytanie na dowódcę na czas sesji: asystent budowy i sugestie korzystają z tych samych danych
const cache = new Map<string, Promise<EdhrecCommanderData>>();

function load(name: string): Promise<EdhrecCommanderData> {
  const key = name.toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = edhrecApi.commander(name);
    // Błąd (np. EDHREC chwilowo niedostępny) nie zostaje w pamięci, następna próba pyta ponownie
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Dane EDHREC dla dowódcy (najczęściej grane karty), wspólne dla wszystkich paneli talii. */
export function useEdhrecCommander(commanderName: string) {
  const [data, setData] = useState<EdhrecCommanderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!commanderName) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(commanderName)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && (setError(e.message), setData(null)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [commanderName]);

  return { data, error, loading };
}
