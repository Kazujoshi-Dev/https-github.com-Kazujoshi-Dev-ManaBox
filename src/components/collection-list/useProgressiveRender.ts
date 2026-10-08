import { useEffect, useRef, useState } from 'react';

/** Od tylu kart wzwyż zakładka wczytuje się partiami z paskiem postępu. */
export const PROGRESSIVE_THRESHOLD = 300;
/** Ile kart dorysowujemy w jednej klatce. */
const CHUNK = 120;

const initialLimit = (total: number) => (total > PROGRESSIVE_THRESHOLD ? CHUNK : Infinity);

/**
 * Przy pierwszym wejściu do zakładki dorysowuje duże listy partiami (po jednej na klatkę),
 * żeby przeglądarka nie zamarzała na czas renderowania tysięcy kart naraz.
 * Zmiana `resetKey` (np. przejście do innego katalogu) uruchamia wczytywanie od nowa.
 * Po zakończeniu zwraca `Infinity`: późniejsze filtrowanie działa jak dotąd.
 */
export function useProgressiveRender(total: number, resetKey?: string) {
  const [limit, setLimit] = useState(() => initialLimit(total));
  const [prevKey, setPrevKey] = useState(resetKey);
  const doneRef = useRef(limit === Infinity);

  // Nowy klucz: resetujemy już w trakcie renderu, żeby pierwsza klatka nie rysowała całej listy naraz
  let effectiveLimit = limit;
  if (resetKey !== prevKey) {
    effectiveLimit = initialLimit(total);
    setPrevKey(resetKey);
    setLimit(effectiveLimit);
    doneRef.current = effectiveLimit === Infinity;
  }

  useEffect(() => {
    if (doneRef.current) return;
    if (limit >= total) {
      doneRef.current = true;
      setLimit(Infinity);
      return;
    }
    const frame = requestAnimationFrame(() => setLimit((l) => l + CHUNK));
    return () => cancelAnimationFrame(frame);
  }, [limit, total, resetKey]);

  const isLoading = effectiveLimit !== Infinity;
  return {
    limit: effectiveLimit,
    isLoading,
    loaded: isLoading ? Math.min(effectiveLimit, total) : total,
    total,
  };
}
