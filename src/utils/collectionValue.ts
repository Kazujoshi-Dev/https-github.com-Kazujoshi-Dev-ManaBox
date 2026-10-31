import type { AppSettings, CollectionItem, ScryfallCard } from '../types';
import { getCardPrice } from './formatters';

/**
 * Zwykły ląd podstawowy MTG (nie full art). Ich ceny to głównie szum (grosze za sztukę,
 * nagłe pojawienie się ceny w nowym dodatku), a mamy ich zwykle dziesiątki, więc nie
 * wliczamy ich do wartości kolekcji ani do zmian cen. Lądy full art liczą się normalnie.
 */
export function isPlainBasicLand(card: Partial<ScryfallCard> | null | undefined): boolean {
  if (!card) return false;
  const front = String(card.type_line || card.card_faces?.[0]?.type_line || '').split('//')[0];
  return /\bbasic\b/i.test(front) && /\bland\b/i.test(front) && card.full_art !== true;
}

/** Wartość pozycji kolekcji (zwykłe + foil) w walucie ustawień. Używane też po stronie serwera. */
export function itemValue(item: CollectionItem, settings: AppSettings, prices = item.card?.prices): number {
  if (!item.card || isPlainBasicLand(item.card)) return 0;
  const card = prices === item.card.prices ? item.card : { ...item.card, prices: prices || {} };
  return item.quantity * getCardPrice(card, false, settings) + item.quantityFoil * getCardPrice(card, true, settings);
}

/**
 * Wartość pozycji teraz i przed ostatnią zmianą cen, do liczenia wzrostów i spadków.
 * Wersję (zwykłą lub foil) porównujemy tylko, gdy ma cenę po obu stronach: pojawienie się
 * ceny (0 → X) albo jej zniknięcie (X → 0) to brak danych, a nie zmiana wartości.
 * Zwraca null, gdy pozycja nie ma historii cen albo nie wlicza się do wartości.
 */
export function itemValueChange(item: CollectionItem, settings: AppSettings): { now: number; before: number } | null {
  if (!item.card || !item.previousPrices || isPlainBasicLand(item.card)) return null;
  const prevCard = { ...item.card, prices: item.previousPrices || {} };
  let now = 0;
  let before = 0;
  let compared = false;
  for (const [qty, foil] of [[item.quantity || 0, false], [item.quantityFoil || 0, true]] as const) {
    if (qty <= 0) continue;
    const p1 = getCardPrice(item.card, foil, settings);
    const p0 = getCardPrice(prevCard, foil, settings);
    if (p1 <= 0 || p0 <= 0) continue;
    now += qty * p1;
    before += qty * p0;
    compared = true;
  }
  return compared ? { now, before } : null;
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
