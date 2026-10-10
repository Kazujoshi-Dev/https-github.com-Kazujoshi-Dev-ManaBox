import { useEffect, useState } from 'react';

export interface ShowcaseCard {
  name: string;
  image: string;
  artCrop: string | null;
  artist?: string | null;
  legendary: boolean;
}

/** Popularne karty do ekranu logowania (z serwera; pusta lista, gdy baza kart niedostępna). */
export function useShowcaseCards(): ShowcaseCard[] {
  const [cards, setCards] = useState<ShowcaseCard[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/showcase')
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => !cancelled && setCards(Array.isArray(d?.cards) ? d.cards : []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return cards;
}
