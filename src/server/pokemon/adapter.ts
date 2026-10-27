/**
 * Karta Pokémon TCG z API TCGdex (https://tcgdex.dev) → karta w kształcie używanym przez aplikację.
 *
 * Dwa rodzaje danych:
 * - karta z listy dodatku (id, numer, nazwa, obraz): wystarcza do wyszukiwania; oznaczona `partial`,
 * - pełna karta (rzadkość, typy, HP, ataki, warianty i ceny): pobierana na żądanie i przechowywana w bazie.
 *
 * Ceny: Cardmarket (EUR, trend) dla wersji zwykłej i reverse holo (TCGdex: pola z przyrostkiem „-holo”),
 * TCGplayer (USD, market price) jako zapas. W aplikacji wersja „foil” karty Pokémon to reverse holo.
 */
import type { ScryfallCard } from '../../types';

export interface TcgdexCardBrief {
  id: string;
  localId: string | number;
  name: string;
  image?: string | null;
}

export interface TcgdexSetBrief {
  id: string;
  name: string;
  logo?: string | null;
  symbol?: string | null;
  cardCount?: { total?: number; official?: number } | null;
}

export interface TcgdexSet extends TcgdexSetBrief {
  releaseDate?: string | null;
  serie?: { id?: string; name?: string } | null;
  cards?: TcgdexCardBrief[] | null;
}

type CmPrices = Record<string, number | string | null | undefined>;
interface TcgVariant {
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
}

export interface TcgdexCard extends TcgdexCardBrief {
  category?: string | null;
  illustrator?: string | null;
  rarity?: string | null;
  set?: { id?: string; name?: string } | null;
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean } | null;
  hp?: number | null;
  types?: string[] | null;
  stage?: string | null;
  evolveFrom?: string | null;
  description?: string | null;
  effect?: string | null;
  abilities?: Array<{ type?: string; name?: string; effect?: string }> | null;
  attacks?: Array<{ cost?: string[]; name?: string; effect?: string; damage?: number | string }> | null;
  weaknesses?: Array<{ type?: string; value?: string }> | null;
  retreat?: number | null;
  regulationMark?: string | null;
  legal?: { standard?: boolean; expanded?: boolean } | null;
  pricing?: {
    cardmarket?: CmPrices | null;
    tcgplayer?: Record<string, TcgVariant | string | number | null | undefined> | null;
  } | null;
}

/** Obraz TCGdex: adres bazowy + jakość i format (high 600×825, low 245×337). */
export function tcgdexImage(base: string | null | undefined, quality: 'high' | 'low'): string | undefined {
  return base ? `${base}/${quality}.webp` : undefined;
}

function price(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

const firstPrice = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    const p = price(v);
    if (p) return p;
  }
  return null;
};

const variantPrice = (tcg: Record<string, unknown> | null | undefined, keys: string[]): string | null => {
  for (const k of keys) {
    const v = tcg?.[k];
    if (v && typeof v === 'object') {
      const p = price((v as TcgVariant).marketPrice ?? (v as TcgVariant).midPrice);
      if (p) return p;
    }
  }
  return null;
};

const CATEGORY_LABEL: Record<string, string> = { pokemon: 'Pokémon', trainer: 'Trainer', energy: 'Energy' };

interface SetContext {
  name?: string;
  releaseDate?: string | null;
}

/** Karta z listy dodatku: tylko to, co potrzebne do wyszukiwania i podglądu. */
export function briefToAppCard(c: TcgdexCardBrief, setId: string, set: SetContext): ScryfallCard {
  return {
    id: c.id,
    game: 'pokemon',
    partial: true,
    name: c.name,
    lang: 'en',
    cmc: 0,
    type_line: '',
    set: setId.toLowerCase(),
    set_name: set.name || '',
    collector_number: String(c.localId ?? ''),
    rarity: '',
    released_at: set.releaseDate || undefined,
    image_uris: { small: tcgdexImage(c.image, 'low'), normal: tcgdexImage(c.image, 'high'), large: tcgdexImage(c.image, 'high') },
    prices: { eur: null, eur_foil: null, usd: null, usd_foil: null }
  };
}

export function tcgdexToAppCard(c: TcgdexCard, set: SetContext = {}): ScryfallCard {
  const category = String(c.category || '').toLowerCase();
  const types = (c.types || []).filter(Boolean);
  const typeLine = [CATEGORY_LABEL[category] || c.category, c.stage, types.join('/')].filter(Boolean).join(' · ');

  const lines: string[] = [];
  for (const a of c.abilities || []) {
    if (a?.name) lines.push(`${a.type || 'Ability'}: ${a.name}${a.effect ? `. ${a.effect}` : ''}`);
  }
  for (const a of c.attacks || []) {
    if (!a?.name) continue;
    const cost = (a.cost || []).length ? `[${(a.cost || []).join(', ')}] ` : '';
    const dmg = a.damage !== undefined && a.damage !== null && a.damage !== '' ? ` (${a.damage})` : '';
    lines.push(`${cost}${a.name}${dmg}${a.effect ? `: ${a.effect}` : ''}`);
  }
  if (c.effect) lines.push(c.effect);
  const weak = (c.weaknesses || []).map((w) => [w?.type, w?.value].filter(Boolean).join(' ')).filter(Boolean);
  if (weak.length) lines.push(`Weakness: ${weak.join(', ')}`);
  if (typeof c.retreat === 'number') lines.push(`Retreat: ${c.retreat}`);

  const cm = c.pricing?.cardmarket || null;
  const tcg = (c.pricing?.tcgplayer || null) as Record<string, unknown> | null;
  const variants = c.variants || {};
  const hasNormal = variants.normal !== false || variants.holo === true;
  const hasReverse = variants.reverse === true;
  const setId = String(c.set?.id || '').toLowerCase();

  const legal = c.legal
    ? {
        ...(typeof c.legal.standard === 'boolean' ? { standard: c.legal.standard ? 'legal' : 'not_legal' } : {}),
        ...(typeof c.legal.expanded === 'boolean' ? { expanded: c.legal.expanded ? 'legal' : 'not_legal' } : {})
      }
    : undefined;

  return {
    id: c.id,
    game: 'pokemon',
    name: c.name,
    lang: 'en',
    cmc: 0,
    type_line: typeLine,
    oracle_text: lines.join('\n') || c.description || undefined,
    colors: types,
    color_identity: types,
    hp: typeof c.hp === 'number' ? c.hp : null,
    stage: c.stage || null,
    set: setId,
    set_name: c.set?.name || set.name || '',
    collector_number: String(c.localId ?? ''),
    rarity: String(c.rarity || '').toLowerCase(),
    released_at: set.releaseDate || undefined,
    image_uris: { small: tcgdexImage(c.image, 'low'), normal: tcgdexImage(c.image, 'high'), large: tcgdexImage(c.image, 'high') },
    finishes: [...(hasNormal ? ['nonfoil'] : []), ...(hasReverse ? ['foil'] : [])],
    prices: {
      // trend, a gdy go brak: średnie z ostatnich dni (TCGdex nie zawsze podaje wszystkie pola)
      eur: firstPrice(cm?.trend, cm?.avg, cm?.avg7, cm?.avg30, cm?.avg1),
      eur_foil: hasReverse ? firstPrice(cm?.['trend-holo'], cm?.['avg-holo'], cm?.['avg7-holo'], cm?.['avg30-holo'], cm?.['avg1-holo']) : null,
      usd: variantPrice(tcg, ['normal', 'holofoil', 'holo', 'unlimited', 'unlimited-holofoil', 'unlimitedHolofoil', '1st-edition', '1st-edition-holofoil', '1stEditionHolofoil']),
      usd_foil: hasReverse ? variantPrice(tcg, ['reverse-holofoil', 'reverseHolofoil', 'reverse']) : null
    },
    legalities: legal && Object.keys(legal).length ? legal : undefined,
    layout: 'normal',
    artist: c.illustrator || undefined
  };
}
