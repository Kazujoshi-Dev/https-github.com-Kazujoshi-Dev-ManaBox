import type { CollectionItem } from '../types';

export const DEFAULT_BINDER = 'Klaser Główny';

/**
 * Cechy, które odróżniają jedną pozycję kolekcji od drugiej. Karta różniąca się czymkolwiek
 * z tej listy (wydanie, foil / zwykła, stan, język, klaser) jest osobną pozycją.
 */
export interface CollectionEntryKey {
  cardId: string;
  foil: boolean;
  condition: string;
  language: string;
  binder: string;
  /** Talia, z której skopiowano karty (null = dodane w inny sposób). */
  sourceDeckId: string | null;
}

/** Identyfikator talii-źródła z danych od klienta: tylko krótki identyfikator, inaczej null. */
export function normalizeSourceDeckId(value: unknown): string | null {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null;
}

export function entryKeyOf(
  data: { cardId?: string; card?: { id: string }; condition?: string; language?: string; binder?: string; sourceDeckId?: string | null },
  foil: boolean
): CollectionEntryKey {
  return {
    cardId: data.cardId || data.card?.id || '',
    foil,
    condition: data.condition || 'NM',
    language: data.language || 'EN',
    binder: data.binder || DEFAULT_BINDER,
    sourceDeckId: normalizeSourceDeckId(data.sourceDeckId),
  };
}

/**
 * Czy dodawane sztuki można dopisać do istniejącej pozycji: tylko gdy to dokładnie ta sama karta
 * (to samo wydanie, ta sama wersja foil / zwykła, stan, język, klaser i talia-źródło), która nie jest wystawiona na sprzedaż.
 */
export function matchesEntry(item: CollectionItem, key: CollectionEntryKey): boolean {
  if (item.isForSale) return false;
  const itemCardId = item.cardId || item.card?.id;
  if (itemCardId !== key.cardId) return false;
  if ((item.condition || 'NM') !== key.condition) return false;
  if ((item.language || 'EN') !== key.language) return false;
  if ((item.binder || DEFAULT_BINDER) !== key.binder) return false;
  if (normalizeSourceDeckId(item.sourceDeckId) !== key.sourceDeckId) return false;
  const normal = item.quantity || 0;
  const foil = item.quantityFoil || 0;
  return key.foil ? foil > 0 && normal === 0 : normal > 0 && foil === 0;
}

/** Rozbija dane z sztukami zwykłymi i foil naraz na dwie części, każda tylko z jedną wersją. */
export function splitByFinish<T extends { quantity?: number; quantityFoil?: number }>(
  data: T
): { foil: boolean; qty: number; part: T }[] {
  const parts: { foil: boolean; qty: number; part: T }[] = [];
  const normal = Math.max(0, Number(data.quantity) || 0);
  const foil = Math.max(0, Number(data.quantityFoil) || 0);
  if (normal > 0) parts.push({ foil: false, qty: normal, part: { ...data, quantity: normal, quantityFoil: 0 } });
  if (foil > 0) parts.push({ foil: true, qty: foil, part: { ...data, quantity: 0, quantityFoil: foil } });
  return parts;
}
