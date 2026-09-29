import { useState, useEffect, useMemo } from 'react';
import { ScryfallCard } from '../../types';

interface UseCardPrintsProps {
  card: ScryfallCard | null;
}

export function useCardPrints({ card }: UseCardPrintsProps) {
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [isLoadingPrints, setIsLoadingPrints] = useState<boolean>(false);
  const [printsFilter, setPrintsFilter] = useState<string>('');

  // Fetch available prints for this card
  useEffect(() => {
    let isMounted = true;

    async function fetchPrints() {
      if (!card?.id && !card?.oracle_id && !card?.name) {
        setPrints([]);
        return;
      }

      setIsLoadingPrints(true);
      try {
        const queryParams = new URLSearchParams();
        if (card.id) queryParams.set('cardId', card.id);
        if (card.oracle_id) queryParams.set('oracle_id', card.oracle_id);
        if (card.name) queryParams.set('name', card.name);

        const res = await fetch(`/api/scryfall/prints?${queryParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && Array.isArray(json.data)) {
            setPrints(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to load card prints:', err);
      } finally {
        if (isMounted) {
          setIsLoadingPrints(false);
        }
      }
    }

    fetchPrints();
    return () => {
      isMounted = false;
    };
  }, [card?.id, card?.oracle_id, card?.name]);

  // Memoized filtered prints list
  const filteredPrints = useMemo(() => {
    if (!printsFilter.trim()) return prints;
    const q = printsFilter.toLowerCase().trim();
    return prints.filter(p =>
      p.set_name.toLowerCase().includes(q) ||
      p.set.toLowerCase().includes(q) ||
      p.collector_number.toLowerCase().includes(q) ||
      (p.released_at && p.released_at.includes(q))
    );
  }, [prints, printsFilter]);

  return {
    prints,
    isLoadingPrints,
    printsFilter,
    setPrintsFilter,
    filteredPrints,
  };
}
