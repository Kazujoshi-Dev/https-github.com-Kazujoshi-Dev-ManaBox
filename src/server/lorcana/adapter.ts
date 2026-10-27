/**
 * Karta Disney Lorcana z API Lorcast → karta w kształcie używanym przez aplikację (ScryfallCard).
 *
 * Dzięki temu kolekcja, klasery, lista życzeń, „Sprzedam”, statystyki i wycena działają dla Lorcany
 * bez osobnego kodu. Pole `game: 'lorcana'` odróżnia te karty od kart MTG.
 *
 * Ceny Lorcast pochodzą z TCGplayer (USD, wersja zwykła i foil); cen w EUR (Cardmarket) nie ma.
 */
import type { ScryfallCard } from '../../types';

export interface LorcastSet {
  id: string;
  name: string;
  code: string;
  released_at?: string | null;
  prereleased_at?: string | null;
}

export interface LorcastCard {
  id: string;
  name: string;
  version?: string | null;
  layout?: string;
  released_at?: string | null;
  image_uris?: { digital?: { small?: string; normal?: string; large?: string } } | null;
  cost?: number | null;
  inkwell?: boolean;
  ink?: string | null;
  type?: string[] | null;
  classifications?: string[] | null;
  text?: string | null;
  move_cost?: number | null;
  strength?: number | null;
  willpower?: number | null;
  lore?: number | null;
  rarity?: string | null;
  illustrators?: string[] | null;
  collector_number?: string | number | null;
  lang?: string | null;
  flavor_text?: string | null;
  tcgplayer_id?: number | null;
  legalities?: Record<string, string> | null;
  set?: { id?: string; code?: string; name?: string } | null;
  prices?: { usd?: string | number | null; usd_foil?: string | number | null } | null;
}

/** Cena z API (liczba albo tekst) → tekst jak w Scryfall albo null. */
function priceText(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Pełna nazwa karty Lorcany: „Elsa - Spirit of Winter” (nazwa + wersja postaci). */
export function lorcanaFullName(name: string, version?: string | null): string {
  const v = (version || '').trim();
  return v ? `${name.trim()} - ${v}` : name.trim();
}

export function lorcastToAppCard(raw: LorcastCard, setReleasedAt?: string | null): ScryfallCard {
  const types = (raw.type || []).filter(Boolean);
  const classes = (raw.classifications || []).filter(Boolean);
  // np. „Character · Storyborn · Hero” (bez długiego myślnika, zgodnie ze stylem aplikacji)
  const typeLine = [...types, ...classes].join(' · ');
  const img = raw.image_uris?.digital || {};
  const usd = priceText(raw.prices?.usd);
  const usdFoil = priceText(raw.prices?.usd_foil);
  const tcgId = typeof raw.tcgplayer_id === 'number' && raw.tcgplayer_id > 0 ? raw.tcgplayer_id : null;
  const legal = raw.legalities?.core;

  return {
    id: raw.id,
    game: 'lorcana',
    name: lorcanaFullName(raw.name, raw.version),
    lang: (raw.lang || 'en').toLowerCase(),
    cmc: typeof raw.cost === 'number' ? raw.cost : 0,
    type_line: typeLine,
    oracle_text: [raw.text, raw.flavor_text ? `\n${raw.flavor_text}` : null].filter(Boolean).join('\n') || undefined,
    colors: raw.ink ? [raw.ink] : [],
    color_identity: raw.ink ? [raw.ink] : [],
    ink: raw.ink ?? null,
    inkwell: Boolean(raw.inkwell),
    classifications: classes,
    strength: raw.strength ?? null,
    willpower: raw.willpower ?? null,
    lore: raw.lore ?? null,
    move_cost: raw.move_cost ?? null,
    set: String(raw.set?.code ?? '').toLowerCase(),
    set_name: raw.set?.name || '',
    collector_number: String(raw.collector_number ?? ''),
    rarity: String(raw.rarity || 'common').toLowerCase(),
    released_at: raw.released_at || setReleasedAt || undefined,
    image_uris: {
      small: img.small,
      normal: img.normal || img.large || img.small,
      large: img.large || img.normal
    },
    finishes: usdFoil && !usd ? ['foil'] : usd && !usdFoil ? ['nonfoil'] : ['nonfoil', 'foil'],
    prices: {
      usd,
      usd_foil: usdFoil,
      eur: null,
      eur_foil: null
    },
    legalities: legal ? { core: legal } : undefined,
    layout: raw.layout || 'normal',
    artist: (raw.illustrators || []).filter(Boolean).join(', ') || undefined,
    tcgplayer_id: tcgId,
    purchase_uris: tcgId ? { tcgplayer: `https://www.tcgplayer.com/product/${tcgId}` } : undefined
  };
}
