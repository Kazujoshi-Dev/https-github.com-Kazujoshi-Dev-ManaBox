import { FilterOptions } from '../../types';
import { tk } from '../../i18n';

export interface CatalogColorTheme {
  bg: string;
  border: string;
  text: string;
  dot: string;
  lightBg: string;
}

export const COLOR_MAP: Record<string, CatalogColorTheme> = {
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', dot: 'bg-amber-400', lightBg: 'bg-amber-500/10' },
  emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-400', lightBg: 'bg-emerald-500/10' },
  blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400', lightBg: 'bg-blue-500/10' },
  purple: { bg: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400', lightBg: 'bg-purple-500/10' },
  rose: { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-400', dot: 'bg-rose-400', lightBg: 'bg-rose-500/10' },
  cyan: { bg: 'bg-cyan-500/15', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-400', lightBg: 'bg-cyan-500/10' },
  orange: { bg: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400', lightBg: 'bg-orange-500/10' },
  stone: { bg: 'bg-stone-500/15', border: 'border-stone-500/40', text: 'text-stone-300', dot: 'bg-stone-400', lightBg: 'bg-stone-500/10' },
};

export const COLOR_PILLS = [
  { id: 'ALL', label: tk('Wszystkie') },
  { id: 'W', label: 'W', bg: 'bg-amber-100 text-stone-900 font-bold' },
  { id: 'U', label: 'U', bg: 'bg-blue-600 text-white font-bold' },
  { id: 'B', label: 'B', bg: 'bg-stone-800 text-stone-200 font-bold' },
  { id: 'R', label: 'R', bg: 'bg-red-600 text-white font-bold' },
  { id: 'G', label: 'G', bg: 'bg-emerald-600 text-white font-bold' },
  { id: 'C', label: tk('Bezbarwne') },
  { id: 'MULTI', label: tk('Wielobarwne') }
];

export const CARD_TYPES = [
  { value: 'ALL', label: tk('Wszystkie typy') },
  { value: 'Creature', label: 'Creature' },
  { value: 'Instant', label: 'Instant' },
  { value: 'Sorcery', label: 'Sorcery' },
  { value: 'Enchantment', label: 'Enchantment' },
  { value: 'Artifact', label: 'Artifact' },
  { value: 'Planeswalker', label: 'Planeswalker' },
  { value: 'Land', label: 'Land' }
];

export const CARD_RARITIES = [
  { value: 'ALL', label: tk('Wszystkie rzadkości') },
  { value: 'mythic', label: 'Mythic' },
  { value: 'rare', label: 'Rare' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'common', label: 'Common' }
];

export const SORT_OPTIONS: { value: FilterOptions['sortBy']; label: string }[] = [
  { value: 'price_desc', label: tk('Cena: Najwyższa') },
  { value: 'price_asc', label: tk('Cena: Najniższa') },
  { value: 'name', label: tk('Nazwa A-Z') },
  { value: 'cmc_desc', label: tk('Mana CMC: Max') },
  { value: 'cmc_asc', label: tk('Mana CMC: Min') },
  { value: 'added_desc', label: tk('Najnowsze w kolekcji') }
];

export const DEFAULT_FILTERS: FilterOptions = {
  searchQuery: '',
  color: 'ALL',
  type: 'ALL',
  rarity: 'ALL',
  set: 'ALL',
  binder: 'ALL',
  sortBy: 'price_desc',
  onlyFoil: false
};

/** Wirtualna kategoria „Sprzedam”: karty oznaczone na sprzedaż (znikają z klaserów). */
export const FOR_SALE_BINDER = '__FOR_SALE__';

/** Dostępne liczby wierszy kart na jednej stronie kolekcji. */
export const ROWS_PER_PAGE_OPTIONS = [12, 24, 48, 60] as const;
export const DEFAULT_ROWS_PER_PAGE = 12;
