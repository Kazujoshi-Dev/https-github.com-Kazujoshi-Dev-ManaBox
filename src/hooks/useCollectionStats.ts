import { useMemo } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { getCardPrice } from '../utils/formatters';
import { itemValue } from '../utils/collectionValue';
export { itemValue };

export interface CollectionTotals {
  totalCards: number;
  totalValue: number;
  /** Zmiana wartości kolekcji względem cen sprzed ostatniej aktualizacji (null = brak historii cen). */
  valueChange: number | null;
  /** Zmiana procentowa względem poprzedniej wartości (null, gdy nie da się policzyć). */
  valueChangePercent: number | null;
  /** Data ostatniej zmiany cen (ISO). */
  lastPriceChangeAt: string | null;
}

/** Wartość pozycji kolekcji: zwykłe + foil, według bieżącego źródła cen i waluty. */

/**
 * Zmiana wartości: dla każdej karty różnica między bieżącą ceną a ceną sprzed
 * ostatniej zmiany (przy odświeżaniu cen serwer zapamiętuje poprzednie ceny).
 */
export function computeValueChange(collection: CollectionItem[], settings: AppSettings) {
  let change = 0;
  let previousValue = 0;
  let hasHistory = false;
  let lastAt: string | null = null;
  for (const item of collection) {
    if (!item.card) continue;
    const now = itemValue(item, settings);
    if (item.previousPrices) {
      hasHistory = true;
      const before = itemValue(item, settings, item.previousPrices);
      change += now - before;
      previousValue += before;
      if (item.pricesChangedAt && (!lastAt || item.pricesChangedAt > lastAt)) lastAt = item.pricesChangedAt;
    } else {
      previousValue += now;
    }
  }
  return {
    valueChange: hasHistory ? change : null,
    valueChangePercent: hasHistory && previousValue > 0 ? (change / previousValue) * 100 : null,
    lastPriceChangeAt: lastAt
  };
}

export function useCollectionStats(collection: CollectionItem[], settings: AppSettings): CollectionTotals {
  return useMemo(() => {
    let totalCards = 0;
    let totalValue = 0;
    for (const item of collection) {
      if (!item.card) continue;
      totalCards += item.quantity + item.quantityFoil;
      totalValue += itemValue(item, settings);
    }
    return { totalCards, totalValue, ...computeValueChange(collection, settings) };
  }, [collection, settings]);
}
