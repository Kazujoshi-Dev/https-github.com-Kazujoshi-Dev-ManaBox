/**
 * Formaty gry (papierowe i MTG Arena), wspólne dla klienta i serwera.
 *
 * Talia zapisuje format jako etykietę (pole `format`, np. „Modern”, „MTGA Historic”),
 * więc stare talie z „EDH Commander” działają bez migracji.
 */
import type { ScryfallCard } from '../types';

export type FormatPlatform = 'paper' | 'arena';

export interface DeckFormat {
  id: string;
  /** Etykieta zapisywana w talii i pokazywana w aplikacji. */
  label: string;
  /** Krótka nazwa do list wyboru. */
  name: string;
  platform: FormatPlatform;
  /** Klucz w `legalities` Scryfall; brak = legalność liczymy sami (np. Pauper w MTGA). */
  legalityKey?: string;
  /** Talia z dowódcą (zasada jednej kopii, tożsamość kolorów). */
  commander: boolean;
  /** Dokładny rozmiar talii (z dowódcą) albo minimum dla zwykłych formatów. */
  deckSize: number;
  exactSize: boolean;
  /** Najwięcej kopii jednej karty (poza lądami podstawowymi). */
  maxCopies: number;
  maxSideboard: number;
  /** Dozwolone rzadkości (formaty „pauperowe” w MTGA). */
  rarities?: string[];
  /** Dowódcą może być też planeswalker (Brawl). */
  planeswalkerCommander?: boolean;
  description: string;
}

const constructed = (o: Pick<DeckFormat, 'id' | 'label' | 'name' | 'platform' | 'description'> & Partial<DeckFormat>): DeckFormat => ({
  commander: false,
  deckSize: 60,
  exactSize: false,
  maxCopies: 4,
  maxSideboard: 15,
  ...o
});

export const DECK_FORMATS: DeckFormat[] = [
  // ---------- Karty papierowe ----------
  {
    id: 'commander',
    label: 'EDH Commander',
    name: 'Commander',
    platform: 'paper',
    legalityKey: 'commander',
    commander: true,
    deckSize: 100,
    exactSize: true,
    maxCopies: 1,
    maxSideboard: 0,
    description: '100 kart singleton (1 dowódca + 99 kart)'
  },
  constructed({ id: 'modern', label: 'Modern', name: 'Modern', platform: 'paper', legalityKey: 'modern', description: 'Min. 60 kart, do 4 kopii, karty od 8th Edition' }),
  constructed({ id: 'standard', label: 'Standard', name: 'Standard', platform: 'paper', legalityKey: 'standard', description: 'Min. 60 kart, do 4 kopii, najnowsze dodatki' }),
  constructed({ id: 'pioneer', label: 'Pioneer', name: 'Pioneer', platform: 'paper', legalityKey: 'pioneer', description: 'Min. 60 kart, do 4 kopii, karty od Return to Ravnica' }),
  constructed({ id: 'legacy', label: 'Legacy', name: 'Legacy', platform: 'paper', legalityKey: 'legacy', description: 'Min. 60 kart, do 4 kopii, cała historia gry z listą banów' }),
  constructed({ id: 'pauper', label: 'Pauper', name: 'Pauper', platform: 'paper', legalityKey: 'pauper', description: 'Min. 60 kart, tylko karty wydane jako pospolite' }),
  constructed({ id: 'vintage', label: 'Vintage', name: 'Vintage', platform: 'paper', legalityKey: 'vintage', description: 'Min. 60 kart, karty z listy ograniczonych tylko po 1 kopii' }),
  constructed({ id: 'premodern', label: 'Premodern', name: 'Premodern', platform: 'paper', legalityKey: 'premodern', description: 'Min. 60 kart, karty od 4th Edition do Scourge' }),

  // ---------- MTG Arena ----------
  constructed({ id: 'arena-pioneer', label: 'MTGA Pioneer', name: 'Pioneer', platform: 'arena', legalityKey: 'pioneer', description: 'Pioneer w MTG Arena, min. 60 kart' }),
  constructed({ id: 'arena-historic', label: 'MTGA Historic', name: 'Historic', platform: 'arena', legalityKey: 'historic', description: 'Wszystkie karty Areny z listą banów, min. 60 kart' }),
  constructed({ id: 'arena-timeless', label: 'MTGA Timeless', name: 'Timeless', platform: 'arena', legalityKey: 'timeless', description: 'Najszerszy format Areny, min. 60 kart' }),
  constructed({ id: 'arena-alchemy', label: 'MTGA Alchemy', name: 'Alchemy', platform: 'arena', legalityKey: 'alchemy', description: 'Standard z kartami cyfrowymi i poprawkami Areny' }),
  {
    id: 'arena-brawl',
    label: 'MTGA Brawl',
    name: 'Brawl',
    platform: 'arena',
    legalityKey: 'standardbrawl',
    commander: true,
    planeswalkerCommander: true,
    deckSize: 60,
    exactSize: true,
    maxCopies: 1,
    maxSideboard: 0,
    description: '60 kart singleton z dowódcą, karty ze Standardu'
  },
  {
    id: 'arena-historic-brawl',
    label: 'MTGA Historic Brawl',
    name: 'Historic Brawl',
    platform: 'arena',
    legalityKey: 'brawl',
    commander: true,
    planeswalkerCommander: true,
    deckSize: 100,
    exactSize: true,
    maxCopies: 1,
    maxSideboard: 0,
    description: '100 kart singleton z dowódcą, wszystkie karty Areny'
  },
  constructed({ id: 'arena-pauper', label: 'MTGA Pauper', name: 'Pauper', platform: 'arena', rarities: ['common'], description: 'Tylko karty pospolite dostępne w Arenie' }),
  constructed({ id: 'arena-artisan', label: 'MTGA Artisan', name: 'Artisan', platform: 'arena', rarities: ['common', 'uncommon'], description: 'Tylko karty pospolite i niepospolite dostępne w Arenie' })
];

export const DEFAULT_FORMAT = DECK_FORMATS[0];

/** Format talii po zapisanej etykiecie. Nieznane wartości (stare talie) traktujemy jak Commander. */
export function getDeckFormat(label?: string | null): DeckFormat {
  const raw = (label || '').trim().toLowerCase();
  if (!raw) return DEFAULT_FORMAT;
  const hit = DECK_FORMATS.find((f) => f.label.toLowerCase() === raw || f.id === raw);
  if (hit) return hit;
  if (/historic\s*brawl/.test(raw)) return DECK_FORMATS.find((f) => f.id === 'arena-historic-brawl')!;
  return DEFAULT_FORMAT;
}

export const isArenaFormat = (label?: string | null) => getDeckFormat(label).platform === 'arena';

// ---------- Karty cyfrowe ----------

type CardLike = Pick<ScryfallCard, 'name' | 'digital' | 'games' | 'legalities'>;

/**
 * Wydanie istnieje tylko w grze cyfrowej (MTG Arena, MTGO): nie da się go mieć fizycznie,
 * więc nie może trafić na sprzedaż ani listę życzeń.
 */
export function isDigitalOnly(card: CardLike | null | undefined): boolean {
  if (!card) return false;
  if (card.digital === true) return true;
  const games = Array.isArray(card.games) ? card.games : null;
  return Boolean(games && games.length > 0 && !games.includes('paper'));
}

/** Krótka etykieta karty cyfrowej do odznak w interfejsie. */
export function digitalLabel(card: CardLike): string {
  const games = Array.isArray(card.games) ? card.games : [];
  return games.includes('arena') || !games.length ? 'MTG Arena' : 'Cyfrowa';
}

export const DIGITAL_BLOCK_MESSAGE = 'Ta karta istnieje tylko w MTG Arena, więc nie można jej dodać do sprzedaży ani listy życzeń.';

/** Formaty Areny, w których karta dostępna w Arenie ma jakikolwiek status (legal, banned, restricted). */
const ARENA_KEYS = ['historic', 'timeless', 'alchemy', 'brawl', 'standardbrawl', 'gladiator'];

/** Czy karta (nie tylko to wydanie) jest dostępna w MTG Arena. */
export function isOnArena(card: CardLike): boolean {
  if (Array.isArray(card.games) && card.games.includes('arena')) return true;
  const leg = card.legalities;
  if (!leg) return true; // brak danych: nie zgadujemy
  return ARENA_KEYS.some((k) => leg[k] && leg[k] !== 'not_legal');
}

/**
 * Filtr Scryfall dla wyszukiwania: `paper` (domyślnie, bez kart tylko cyfrowych),
 * `arena` (karty dostępne w MTG Arena, w tym cyfrowe) albo `all` (wszystko).
 */
export type SearchGame = 'paper' | 'arena' | 'all';

export const searchGameForFormat = (label?: string | null): SearchGame => (isArenaFormat(label) ? 'arena' : 'paper');

// ---------- Koszt talii w wildcardach MTG Arena ----------

export type WildcardRarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export const WILDCARD_RARITIES: { id: WildcardRarity; label: string; short: string }[] = [
  { id: 'common', label: 'Pospolite', short: 'C' },
  { id: 'uncommon', label: 'Niepospolite', short: 'U' },
  { id: 'rare', label: 'Rzadkie', short: 'R' },
  { id: 'mythic', label: 'Mityczne', short: 'M' }
];

export type WildcardCost = Record<WildcardRarity, number>;

const isBasicLand = (card: Pick<ScryfallCard, 'type_line'>) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

/** Rzadkość wildcarda potrzebnego do stworzenia karty (wydania specjalne liczymy jak rzadkie, bonusowe jak mityczne). */
export function wildcardRarity(card: Pick<ScryfallCard, 'rarity'>): WildcardRarity {
  switch ((card.rarity || '').toLowerCase()) {
    case 'common':
      return 'common';
    case 'uncommon':
      return 'uncommon';
    case 'mythic':
    case 'bonus':
      return 'mythic';
    default:
      return 'rare';
  }
}

/**
 * Ile wildcardów każdej rzadkości trzeba, żeby stworzyć talię od zera w MTG Arena.
 * Lądy podstawowe są w Arenie darmowe; kopie tej samej karty w różnych wydaniach liczymy raz,
 * po najtańszej rzadkości (Arena pozwala użyć dowolnego posiadanego wydania).
 */
export function computeWildcardCost(deck: {
  commander?: ScryfallCard | null;
  cards: { card: ScryfallCard; quantity: number; isCommander?: boolean }[];
}): WildcardCost {
  const order: WildcardRarity[] = ['common', 'uncommon', 'rare', 'mythic'];
  const byName = new Map<string, { qty: number; rarity: WildcardRarity }>();
  const add = (card: ScryfallCard, qty: number) => {
    if (!card || qty <= 0 || isBasicLand(card)) return;
    const key = arenaCardName(card).toLowerCase();
    const rarity = wildcardRarity(card);
    const prev = byName.get(key);
    if (prev) {
      prev.qty += qty;
      if (order.indexOf(rarity) < order.indexOf(prev.rarity)) prev.rarity = rarity;
    } else {
      byName.set(key, { qty, rarity });
    }
  };
  if (deck.commander) add(deck.commander, 1);
  for (const e of deck.cards) add(e.card, e.quantity);

  const cost: WildcardCost = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
  for (const { qty, rarity } of byName.values()) cost[rarity] += qty;
  return cost;
}

// ---------- Eksport do MTG Arena ----------

/** Kody dodatków, które w Arenie mają inną nazwę niż w Scryfall. */
const ARENA_SET_CODES: Record<string, string> = { dom: 'DAR', con: 'CONF' };

const SPLIT_LAYOUTS = new Set(['split', 'aftermath']);

/** Nazwa karty tak, jak rozpoznaje ją import Areny (karty dzielone z „///”, dwustronne: tylko awers). */
export function arenaCardName(card: Pick<ScryfallCard, 'name' | 'card_faces' | 'layout'>): string {
  const faces = card.card_faces || [];
  if (faces.length >= 2) {
    if (SPLIT_LAYOUTS.has(card.layout || '')) return faces.map((f) => f.name).join(' /// ');
    return faces[0].name;
  }
  return card.name.split(' // ')[0];
}

function arenaLine(qty: number, card: ScryfallCard): string {
  const name = arenaCardName(card);
  // Kod dodatku i numer tylko dla wydań, które są w Arenie; inaczej Arena sama dobierze wersję po nazwie.
  const onArena = Array.isArray(card.games) && card.games.includes('arena');
  if (onArena && card.set && card.collector_number) {
    const set = ARENA_SET_CODES[card.set.toLowerCase()] || card.set.toUpperCase();
    return `${qty} ${name} (${set}) ${card.collector_number}`;
  }
  return `${qty} ${name}`;
}

/** Lista talii w formacie importu MTG Arena (Commander / Deck / Sideboard). */
export function exportDeckToArena(deck: {
  commander?: ScryfallCard | null;
  cards: { card: ScryfallCard; quantity: number; isCommander?: boolean; isSideboard?: boolean }[];
}): string {
  const merge = (entries: { card: ScryfallCard; quantity: number }[]) => {
    const out = new Map<string, { card: ScryfallCard; quantity: number }>();
    for (const e of entries) {
      const key = arenaLine(1, e.card);
      const prev = out.get(key);
      if (prev) prev.quantity += e.quantity;
      else out.set(key, { card: e.card, quantity: e.quantity });
    }
    return [...out.values()].sort((a, b) => a.card.name.localeCompare(b.card.name)).map((e) => arenaLine(e.quantity, e.card));
  };

  const parts: string[] = [];
  const commanders = [deck.commander, ...deck.cards.filter((e) => e.isCommander).map((e) => e.card)].filter(Boolean) as ScryfallCard[];
  if (commanders.length) parts.push(['Commander', ...merge(commanders.map((card) => ({ card, quantity: 1 })))].join('\n'));
  const main = deck.cards.filter((e) => !e.isCommander && !e.isSideboard);
  parts.push(['Deck', ...merge(main)].join('\n'));
  const side = deck.cards.filter((e) => e.isSideboard && !e.isCommander);
  if (side.length) parts.push(['Sideboard', ...merge(side)].join('\n'));
  return parts.join('\n\n') + '\n';
}
