import { FOR_SALE_BINDER } from './constants';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { CollectionItem, FilterOptions, AppSettings } from '../../types';
import { getCardPrice } from '../../utils/formatters';
import { DEFAULT_FILTERS } from './constants';

/** Dodatek na liście filtra: ile różnych kart z niego masz i ile kart liczy cały dodatek. */
export interface SetOption {
  code: string;
  name: string;
  owned: number;
  total: number | null;
}

let setSizesMemo: Record<string, number> | null = null;

interface UseCollectionFiltersProps {
  collection: CollectionItem[];
  settings: AppSettings;
}

export function useCollectionFilters({ collection, settings }: UseCollectionFiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  // Liczba kart w dodatkach (z bazy kart, raz na sesję)
  const [setSizes, setSetSizes] = useState<Record<string, number>>(() => setSizesMemo || {});
  useEffect(() => {
    if (setSizesMemo) return;
    let cancelled = false;
    fetch('/api/cards/set-sizes')
      .then((r) => (r.ok ? r.json() : { sizes: {} }))
      .then((d) => {
        const sizes = d?.sizes && typeof d.sizes === 'object' ? d.sizes : {};
        if (Object.keys(sizes).length) setSizesMemo = sizes;
        if (!cancelled) setSetSizes(sizes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Dodatki do listy: skompletowanie (różne karty z dodatku / wszystkie karty dodatku), od najnowszej premiery
  const sets = useMemo((): SetOption[] => {
    const list = new Map<string, { name: string; numbers: Set<string>; released: string }>();
    collection.forEach(item => {
      if (!item.card || !item.card.set || (item.quantity || 0) + (item.quantityFoil || 0) <= 0) return;
      const code = item.card.set;
      let cur = list.get(code);
      if (!cur) list.set(code, (cur = { name: item.card.set_name || code.toUpperCase(), numbers: new Set(), released: '' }));
      cur.numbers.add(String(item.card.collector_number || item.card.name).toLowerCase());
      // Data premiery dodatku: najwcześniejsza data wydania kart z tego dodatku w kolekcji
      const released = item.card.released_at || '';
      if (released && (!cur.released || released < cur.released)) cur.released = released;
    });
    return Array.from(list.entries())
      .sort(([, a], [, b]) => (b.released || '').localeCompare(a.released || '') || a.name.localeCompare(b.name))
      .map(([code, { name, numbers }]) => {
        const total = setSizes[code.toLowerCase()] || null;
        // Gdy baza zna mniej kart niż masz (np. niepełne dane), nie pokazujemy mylącego procentu
        return { code, name, owned: numbers.size, total: total && total >= numbers.size ? total : null };
      });
  }, [collection, setSizes]);

  // Filter & Sort Logic
  const filteredCollection = useMemo(() => {
    return collection.filter(item => {
      const card = item.card;
      if (!card) return false;

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchName = card.name.toLowerCase().includes(query);
        const matchType = card.type_line?.toLowerCase().includes(query);
        const matchSet = card.set_name?.toLowerCase().includes(query) || card.set.toLowerCase().includes(query);
        const matchNotes = item.notes?.toLowerCase().includes(query);
        if (!matchName && !matchType && !matchSet && !matchNotes) return false;
      }

      // Color filter
      if (filters.color !== 'ALL') {
        const colors = card.colors || [];
        if (filters.color === 'MULTI' && colors.length < 2) return false;
        if (filters.color === 'C' && colors.length > 0) return false;
        if (['W', 'U', 'B', 'R', 'G'].includes(filters.color) && !colors.includes(filters.color)) return false;
      }

      // Type filter
      if (filters.type !== 'ALL') {
        if (!card.type_line?.toLowerCase().includes(filters.type.toLowerCase())) return false;
      }

      // Rarity filter
      if (filters.rarity !== 'ALL') {
        if (card.rarity.toLowerCase() !== filters.rarity.toLowerCase()) return false;
      }

      // Set filter
      if (filters.set !== 'ALL') {
        if (card.set.toLowerCase() !== filters.set.toLowerCase()) return false;
      }

      // Klaser: karty na sprzedaż są tylko w kategorii „Sprzedam” (i w „Wszystkie karty”)
      if (filters.binder === FOR_SALE_BINDER) {
        if (!item.isForSale) return false;
      } else if (filters.binder !== 'ALL') {
        if (item.isForSale || (item.binder || 'Klaser Główny') !== filters.binder) return false;
      }

      // Only Foil filter
      if (filters.onlyFoil && item.quantityFoil <= 0) return false;

      return true;
    }).sort((a, b) => {
      const cardA = a.card;
      const cardB = b.card;
      
      const priceA = (a.quantity * getCardPrice(cardA, false, settings)) + (a.quantityFoil * getCardPrice(cardA, true, settings));
      const priceB = (b.quantity * getCardPrice(cardB, false, settings)) + (b.quantityFoil * getCardPrice(cardB, true, settings));

      switch (filters.sortBy) {
        case 'price_desc':
          return priceB - priceA;
        case 'price_asc':
          return priceA - priceB;
        case 'name':
          return cardA.name.localeCompare(cardB.name);
        case 'cmc_desc':
          return (cardB.cmc || 0) - (cardA.cmc || 0);
        case 'cmc_asc':
          return (cardA.cmc || 0) - (cardB.cmc || 0);
        case 'added_desc':
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
        default:
          return 0;
      }
    });
  }, [collection, filters, settings]);

  // Subtotal metrics for filtered results
  const filteredMetrics = useMemo(() => {
    let cardsCount = 0;
    let totalValue = 0;

    filteredCollection.forEach(item => {
      const card = item.card;
      const normalPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);
      
      cardsCount += item.quantity + item.quantityFoil;
      totalValue += (item.quantity * normalPrice) + (item.quantityFoil * foilPrice);
    });

    return { cardsCount, totalValue };
  }, [filteredCollection, settings]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filters.searchQuery ||
      filters.color !== 'ALL' ||
      filters.type !== 'ALL' ||
      filters.rarity !== 'ALL' ||
      filters.binder !== 'ALL' ||
      filters.set !== 'ALL' ||
      filters.onlyFoil
    );
  }, [filters]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const updateFilters = useCallback((updates: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    filters,
    setFilters,
    updateFilters,
    sets,
    filteredCollection,
    filteredMetrics,
    hasActiveFilters,
    handleResetFilters,
  };
}
