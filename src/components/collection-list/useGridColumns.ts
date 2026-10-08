import { useEffect, useState } from 'react';

/** Progi zgodne z siatką CollectionGridView: grid-cols-2 sm:3 md:4 lg:5 xl:6. */
const BREAKPOINTS: Array<[query: string, cols: number]> = [
  ['(min-width: 1280px)', 6],
  ['(min-width: 1024px)', 5],
  ['(min-width: 768px)', 4],
  ['(min-width: 640px)', 3],
];

function currentColumns(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return 6;
  for (const [query, cols] of BREAKPOINTS) {
    if (window.matchMedia(query).matches) return cols;
  }
  return 2;
}

/** Liczba kolumn siatki kart dla bieżącej szerokości okna (aktualizowana przy zmianie rozmiaru). */
export function useGridColumns(): number {
  const [cols, setCols] = useState(currentColumns);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const lists = BREAKPOINTS.map(([q]) => window.matchMedia(q));
    const update = () => setCols(currentColumns());
    lists.forEach((l) => l.addEventListener('change', update));
    update();
    return () => lists.forEach((l) => l.removeEventListener('change', update));
  }, []);

  return cols;
}
