/**
 * Analiza talii: losowa ręka, prawdopodobieństwa (rozkład hipergeometryczny)
 * oraz wymagania kolorystyczne many w stylu Franka Karstena.
 */
import type { DeckItem, ScryfallCard } from '../../types';
import { getCardCategory } from './constants';

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAMES: Record<Color, string> = {
  W: 'Biały',
  U: 'Niebieski',
  B: 'Czarny',
  R: 'Czerwony',
  G: 'Zielony'
};
/** Dopełniacz: „źródła koloru zielonego”. */
export const COLOR_GENITIVE: Record<Color, string> = {
  W: 'białego',
  U: 'niebieskiego',
  B: 'czarnego',
  R: 'czerwonego',
  G: 'zielonego'
};
export const BASIC_LAND: Record<Color, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const BASIC_TYPE_TO_COLOR: Record<string, Color> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };

/* ---------- kombinatoryka ---------- */

const LOG_FACT: number[] = [0];
function logFact(n: number): number {
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[n];
}
function logC(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}
/** P(dokładnie k sukcesów) — losujemy n kart z N, w tym K „sukcesów”. */
export function hyperPmf(N: number, K: number, n: number, k: number): number {
  if (k < 0 || k > K || k > n || n - k > N - K) return 0;
  return Math.exp(logC(K, k) + logC(N - K, n - k) - logC(N, n));
}
/** P(co najmniej k). */
export function hyperAtLeast(N: number, K: number, n: number, k: number): number {
  let p = 0;
  for (let i = Math.max(0, k); i <= Math.min(K, n); i++) p += hyperPmf(N, K, n, i);
  return Math.min(1, p);
}

/**
 * P(≥k źródeł koloru | ≥t lądów) wśród n kart z talii N kart, w której jest
 * L lądów, z czego S daje dany kolor. (Model Karstena: zakładamy, że zagrywamy lądy co turę.)
 */
export function colorProbGivenLands(N: number, L: number, S: number, n: number, k: number, t: number): number {
  if (N <= 0 || n <= 0) return 0;
  const logTotal = logC(N, n);
  let both = 0;
  let lands = 0;
  for (let a = 0; a <= Math.min(S, n); a++) {
    for (let b = 0; b <= Math.min(L - S, n - a); b++) {
      if (a + b < t) continue;
      const p = Math.exp(logC(S, a) + logC(L - S, b) + logC(N - L, n - a - b) - logTotal);
      lands += p;
      if (a >= k) both += p;
    }
  }
  return lands > 0 ? both / lands : 0;
}

/* ---------- karty ---------- */

export interface LibraryCard {
  card: ScryfallCard;
  key: string; // unikalny klucz kopii
}

export function isLand(card: ScryfallCard): boolean {
  const front = card.card_faces?.[0]?.type_line || card.type_line || '';
  return /\bland\b/i.test(front);
}

/** Biblioteka: karty talii bez dowódcy i sideboardu, z uwzględnieniem liczby kopii. */
export function buildLibrary(deck: DeckItem): LibraryCard[] {
  const out: LibraryCard[] = [];
  deck.cards.forEach((e, i) => {
    if (e.isCommander || e.isSideboard) return;
    for (let c = 0; c < Math.max(0, e.quantity || 0); c++) out.push({ card: e.card, key: `${i}-${c}` });
  });
  return out;
}

/** Tasowanie Fishera–Yatesa z kryptograficznym generatorem liczb losowych. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  const rnd = new Uint32Array(1);
  for (let i = a.length - 1; i > 0; i--) {
    crypto.getRandomValues(rnd);
    const j = rnd[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Symbole many z kosztu karty (z pierwszej strony, gdy brak kosztu ogólnego). */
function manaCostOf(card: ScryfallCard): string {
  return card.mana_cost || card.card_faces?.[0]?.mana_cost || '';
}

export interface Pips {
  /** Ścisłe wymagania (np. {G}{G} → G: 2). */
  strict: Partial<Record<Color, number>>;
  /** Waga do rozkładu kolorów (hybrydy i phyrexian liczone po 0,5). */
  weight: Partial<Record<Color, number>>;
}

export function parsePips(card: ScryfallCard): Pips {
  const strict: Partial<Record<Color, number>> = {};
  const weight: Partial<Record<Color, number>> = {};
  const add = (o: Partial<Record<Color, number>>, c: Color, v: number) => (o[c] = (o[c] || 0) + v);
  for (const m of manaCostOf(card).matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1].toUpperCase();
    if ((COLORS as readonly string[]).includes(sym)) {
      add(strict, sym as Color, 1);
      add(weight, sym as Color, 1);
      continue;
    }
    const parts = sym.split('/');
    const colors = parts.filter((p) => (COLORS as readonly string[]).includes(p)) as Color[];
    if (parts.length > 1 && colors.length) {
      // hybryda ({W/U}), phyrexian ({G/P}) lub {2/W} — nie jest ścisłym wymaganiem
      for (const c of colors) add(weight, c, 1 / Math.max(colors.length, 2));
    }
  }
  return { strict, weight };
}

/** Kolory many, które daje karta (lądy, artefakty, stwory many). */
export function manaSources(card: ScryfallCard, deckColors: Color[]): Set<Color> {
  const out = new Set<Color>();
  const produced = (card as any).produced_mana as string[] | undefined;
  if (Array.isArray(produced) && produced.length) {
    for (const c of produced) if ((COLORS as readonly string[]).includes(c)) out.add(c as Color);
  } else {
    const type = (card.card_faces?.[0]?.type_line || card.type_line || '').toLowerCase();
    for (const [name, c] of Object.entries(BASIC_TYPE_TO_COLOR)) if (type.includes(name)) out.add(c);
    const text = (card.oracle_text || card.card_faces?.[0]?.oracle_text || '').toLowerCase();
    for (const m of text.matchAll(/add ([^.]*)/g)) {
      for (const s of m[1].matchAll(/\{([wubrg])\}/g)) out.add(s[1].toUpperCase() as Color);
      if (/any colou?r/.test(m[1])) COLORS.forEach((c) => out.add(c));
    }
  }
  // Fetchlandy i podobne: „search your library for a Forest or Plains card” / „basic land card”
  if (out.size === 0 && isLand(card)) {
    const text = (card.oracle_text || '').toLowerCase();
    if (/search your library for/.test(text)) {
      let found = false;
      for (const [name, c] of Object.entries(BASIC_TYPE_TO_COLOR)) {
        if (new RegExp(`\\b${name}\\b`).test(text)) {
          out.add(c);
          found = true;
        }
      }
      if (!found && /basic land/.test(text)) deckColors.forEach((c) => out.add(c));
    }
  }
  // W talii liczą się tylko kolory talii (np. Command Tower daje tylko kolory dowódcy)
  if (deckColors.length) for (const c of [...out]) if (!deckColors.includes(c)) out.delete(c);
  return out;
}

/* ---------- prawdopodobieństwa typów w ręce ---------- */

export const HAND_CATEGORIES = [
  { id: 'Lands', label: 'Lands' },
  { id: 'Creatures', label: 'Creatures' },
  { id: 'Instants', label: 'Instants' },
  { id: 'Sorceries', label: 'Sorceries' },
  { id: 'Artifacts', label: 'Artifacts' },
  { id: 'Enchantments', label: 'Enchantments' },
  { id: 'Planeswalkers', label: 'Planeswalkers' },
  { id: 'Other', label: 'Other' }
];

export interface CategoryOdds {
  id: string;
  label: string;
  count: number;
  expected: number;
  /** P(dokładnie 0, 1, 2, 3), P(≥4) */
  exact: number[];
  atLeastOne: number;
}

export function categoryOdds(library: LibraryCard[], handSize = 7): CategoryOdds[] {
  const N = library.length;
  const counts = new Map<string, number>();
  for (const { card } of library) {
    const cat = getCardCategory(card);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  const n = Math.min(handSize, N);
  return HAND_CATEGORIES.filter((c) => (counts.get(c.id) || 0) > 0).map(({ id, label }) => {
    const K = counts.get(id) || 0;
    const exact = [0, 1, 2, 3].map((k) => hyperPmf(N, K, n, k));
    exact.push(hyperAtLeast(N, K, n, 4));
    return { id, label, count: K, expected: N ? (n * K) / N : 0, exact, atLeastOne: hyperAtLeast(N, K, n, 1) };
  });
}

/* ---------- wymagania kolorystyczne ---------- */

export const TARGET_PROBABILITY = 0.9;

export interface ColorReport {
  color: Color;
  pipWeight: number;
  pipShare: number;
  landSources: number;
  otherSources: number;
  sourceShare: number;
  needed: number;
  /** Najbardziej wymagająca karta. */
  hardestCard: ScryfallCard | null;
  hardestPips: number;
  hardestTurn: number;
  /** Szansa na zagranie najbardziej wymagającej karty na czas przy obecnych źródłach. */
  probability: number;
  unreachable: boolean;
  basicsInDeck: number;
}

export interface ManaReport {
  deckSize: number;
  lands: number;
  avgManaValue: number;
  recommendedLands: number | null;
  colors: ColorReport[];
  suggestions: string[];
}

function deckColorIdentity(deck: DeckItem): Color[] {
  const set = new Set<string>();
  if (deck.commander?.color_identity?.length) deck.commander.color_identity.forEach((c) => set.add(c));
  else deck.cards.forEach((e) => (!e.isSideboard ? e.card.color_identity?.forEach((c) => set.add(c)) : null));
  return COLORS.filter((c) => set.has(c));
}

/** Rekomendowana liczba lądów (wzory Franka Karstena, bez poprawki na rampę). */
function recommendLands(size: number, avgMv: number): number | null {
  if (size >= 90) return Math.round(31.42 + 3.13 * avgMv);
  if (size >= 55 && size <= 70) return Math.round(19.59 + 1.9 * avgMv);
  if (size >= 38 && size <= 45) return 17;
  return null;
}

export function analyzeMana(deck: DeckItem, library: LibraryCard[]): ManaReport {
  const deckColors = deckColorIdentity(deck);
  const N = library.length;
  const landCards = library.filter((l) => isLand(l.card));
  const L = landCards.length;
  const spells = library.filter((l) => !isLand(l.card)).map((l) => l.card);
  const castables = deck.commander ? [...spells, deck.commander] : spells;

  const avgMv = spells.length ? spells.reduce((s, c) => s + (c.cmc || 0), 0) / spells.length : 0;

  // Udział kolorów w kosztach
  const pipW: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of castables) {
    const { weight } = parsePips(c);
    for (const col of COLORS) pipW[col] += weight[col] || 0;
  }
  const pipTotal = COLORS.reduce((s, c) => s + pipW[c], 0) || 1;

  // Źródła many
  const landSrc: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const otherSrc: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const basics: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const { card } of library) {
    const src = manaSources(card, deckColors);
    const land = isLand(card);
    src.forEach((c) => (land ? landSrc[c]++ : otherSrc[c]++));
    if (land && /\bbasic\b/i.test(card.type_line || '')) {
      const t = (card.type_line || '').toLowerCase();
      for (const [name, c] of Object.entries(BASIC_TYPE_TO_COLOR)) if (t.includes(name)) basics[c]++;
    }
  }
  const srcTotal = COLORS.reduce((s, c) => s + landSrc[c], 0) || 1;

  // Ile źródeł potrzeba, by zagrać kartę na czas z prawdopodobieństwem ≥90%
  const neededFor = (k: number, turn: number): { need: number; unreachable: boolean } => {
    const n = Math.min(N, 7 + turn - 1); // na wyjściu (bez dobrania w 1. turze)
    for (let S = 0; S <= L; S++) {
      if (colorProbGivenLands(N, L, S, n, k, turn) >= TARGET_PROBABILITY) return { need: S, unreachable: false };
    }
    return { need: L, unreachable: true };
  };

  const activeColors = COLORS.filter((c) => pipW[c] > 0 || landSrc[c] > 0 || deckColors.includes(c));
  const colors: ColorReport[] = activeColors.map((color) => {
    let needed = 0;
    let hardestCard: ScryfallCard | null = null;
    let hardestPips = 0;
    let hardestTurn = 0;
    let unreachable = false;
    const seen = new Set<string>();
    for (const card of castables) {
      const k = parsePips(card).strict[color] || 0;
      if (!k) continue;
      const turn = Math.max(1, Math.round(card.cmc || 0), k);
      const key = `${k}-${turn}`;
      if (seen.has(key) && hardestCard) continue;
      seen.add(key);
      const r = neededFor(k, turn);
      if (r.need > needed || (r.need === needed && !hardestCard)) {
        needed = r.need;
        hardestCard = card;
        hardestPips = k;
        hardestTurn = turn;
        unreachable = r.unreachable;
      }
    }
    const probability = hardestCard
      ? colorProbGivenLands(N, L, landSrc[color], Math.min(N, 7 + hardestTurn - 1), hardestPips, hardestTurn)
      : 1;
    return {
      color,
      pipWeight: pipW[color],
      pipShare: pipW[color] / pipTotal,
      landSources: landSrc[color],
      otherSources: otherSrc[color],
      sourceShare: landSrc[color] / srcTotal,
      needed,
      hardestCard,
      hardestPips,
      hardestTurn,
      probability,
      unreachable,
      basicsInDeck: basics[color]
    };
  });

  // Sugestie
  const suggestions: string[] = [];
  const recommendedLands = recommendLands(N + (deck.commander ? 1 : 0), avgMv);
  if (recommendedLands !== null && L < recommendedLands - 1) {
    suggestions.push(
      `Lands w talii: ${L} — przy średnim koszcie ${avgMv.toFixed(2).replace('.', ',')} zalecane jest ok. ${recommendedLands}. Dodaj ${recommendedLands - L} × Land (mniej, jeśli grasz dużo taniej rampy lub dobierania).`
    );
  } else if (recommendedLands !== null && L > recommendedLands + 2) {
    suggestions.push(`Lands w talii: ${L} — przy tym średnim koszcie wystarczy ok. ${recommendedLands}. Możesz zamienić ${L - recommendedLands} × Land na inne karty.`);
  }
  const surplus = colors
    .filter((c) => c.landSources - c.needed > 0 && c.basicsInDeck > 0)
    .map((c) => ({ ...c, free: Math.min(c.landSources - c.needed, c.basicsInDeck) }))
    .sort((a, b) => b.free - a.free);
  for (const c of colors) {
    const deficit = c.needed - c.landSources;
    if (deficit <= 0) continue;
    const name = COLOR_NAMES[c.color].toLowerCase();
    const plural = (n: number) => (n === 1 ? 'źródło' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'źródła' : 'źródeł');
    let text = `Kolor ${name}: masz ${c.landSources} ${plural(c.landSources)}, potrzebujesz ok. ${c.needed}, aby zagrać „${c.hardestCard?.name}” w ${c.hardestTurn}. turze z szansą 90%. Dodaj ${deficit} ${plural(deficit)} koloru ${COLOR_GENITIVE[c.color]}`;
    const donor = surplus.find((s) => s.color !== c.color && s.free > 0);
    if (donor) {
      const swap = Math.min(deficit, donor.free);
      text += ` — np. zamień ${swap} × ${BASIC_LAND[donor.color]} na ${BASIC_LAND[c.color]}`;
      donor.free -= swap;
      if (swap < deficit) text += ` i dodaj ${deficit - swap} × dual Land z tym kolorem`;
    } else {
      text += ' — najlepiej dual Lands lub zamieniając bezbarwne Lands';
    }
    if (c.unreachable) text += '. Nawet gdyby wszystkie Lands dawały ten kolor, szansa nie dobije do 90% — rozważ więcej Lands.';
    suggestions.push(text + (c.unreachable ? '' : '.'));
  }
  if (!suggestions.length && L > 0) suggestions.push('Baza many wygląda dobrze — liczba źródeł każdego koloru wystarcza do zagrywania kart na czas.');

  return { deckSize: N, lands: L, avgManaValue: avgMv, recommendedLands, colors, suggestions };
}
