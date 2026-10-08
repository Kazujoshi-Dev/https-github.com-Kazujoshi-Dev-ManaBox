import { useEffect, useRef, useState } from 'react';

/** Od tylu kart wzwyż zakładka wczytuje się partiami z paskiem postępu. */
export const PROGRESSIVE_THRESHOLD = 300;
/** Ile kart dorysowujemy w jednej klatce. */
const CHUNK = 120;

/**
 * Przy pierwszym wejściu do zakładki dorysowuje duże listy partiami (po jednej na klatkę),
 * żeby przeglądarka nie zamarzała na czas renderowania tysięcy kart naraz.
 * Po zakończeniu zwraca `Infinity`: późniejsze filtrowanie działa jak dotąd.
 */
export function useProgressiveRender(total: number) {
  const [limit, setLimit] = useState(() => (total > PROGRESSIVE_THRESHOLD ? CHUNK : Infinity));
  const doneRef = useRef(limit === Infinity);

  useEffect(() => {
    if (doneRef.current) return;
    if (limit >= total) {
      doneRef.current = true;
      setLimit(Infinity);
      return;
    }
    const frame = requestAnimationFrame(() => setLimit((l) => l + CHUNK));
    return () => cancelAnimationFrame(frame);
  }, [limit, total]);

  const isLoading = limit !== Infinity;
  return {
    limit,
    isLoading,
    loaded: isLoading ? Math.min(limit, total) : total,
    total,
  };
}
