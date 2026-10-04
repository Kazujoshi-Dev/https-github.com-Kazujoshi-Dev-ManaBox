import type { AppSettings, CollectionItem } from '../types';
import { getCardPrice } from './formatters';

/** Wartość pozycji kolekcji (zwykłe + foil) w walucie ustawień. Używane też po stronie serwera. */
export function itemValue(item: CollectionItem, settings: AppSettings, prices = item.card?.prices): number {
  if (!item.card) return 0;
  const card = prices === item.card.prices ? item.card : { ...item.card, prices: prices || {} };
  return item.quantity * getCardPrice(card, false, settings) + item.quantityFoil * getCardPrice(card, true, settings);
}

/** Łączna liczba kart i wartość kolekcji. */
export function collectionTotals(collection: CollectionItem[], settings: AppSettings): { cards: number; value: number } {
  let cards = 0;
  let value = 0;
  for (const item of collection) {
    if (!item.card) continue;
    cards += (item.quantity || 0) + (item.quantityFoil || 0);
    value += itemValue(item, settings);
  }
  return { cards, value };
}
