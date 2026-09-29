import { useMemo } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { getCardPrice } from '../utils/formatters';

export interface CollectionTotals {
  totalCards: number;
  totalValue: number;
  totalPurchaseCost: number;
}

export function useCollectionStats(collection: CollectionItem[], settings: AppSettings): CollectionTotals {
  return useMemo(() => {
    let totalCards = 0;
    let totalValue = 0;
    let totalPurchaseCost = 0;

    for (const item of collection) {
      const card = item.card;
      if (!card) continue;

      const qty = item.quantity + item.quantityFoil;
      totalCards += qty;

      const normPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);

      totalValue += (item.quantity * normPrice) + (item.quantityFoil * foilPrice);

      if (item.purchasePrice) {
        totalPurchaseCost += item.purchasePrice * qty;
      }
    }

    return { totalCards, totalValue, totalPurchaseCost };
  }, [collection, settings]);
}
