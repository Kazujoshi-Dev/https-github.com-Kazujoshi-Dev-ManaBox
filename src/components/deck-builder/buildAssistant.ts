/**
 * Asystent budowy talii Commander: liczy role kart w talii (Lands, rampa, dobieranie, usuwanie,
 * czyszczenie planszy) i wybiera kolejne karty do dodania z rekomendacji EDHREC oraz z wolnych
 * kart z kolekcji. Wszystko liczone lokalnie, bez płatnych usług.
 */
import type { CollectionItem, DeckItem, ScryfallCard } from '../../types';
import type { EdhrecRecommendation } from '../../services/api';
import type { CardAvailability, OwnedPrinting } from '../../utils/cardAvailability';
import { cardNameKey } from '../../utils/cardAvailability';
import { isLand } from './deckAnalysis';
import { tk } from '../../i18n';

export type Role = 'lands' | 'ramp' | 'draw' | 'removal' | 'wipe';
export const ROLES: Role[] = ['lands', 'ramp', 'draw', 'removal', 'wipe'];

export const ROLE_LABELS: Record<Role, string> = {
  lands: 'Lands',
  ramp: tk('Rampa'),
  draw: tk('Dobieranie'),
  removal: tk('Usuwanie'),
  wipe: tk('Czyszczenie planszy'),
};

export const ROLE_HINTS: Record<Role, string> = {
  lands: tk('Lądy, z których płacisz za karty.'),
  ramp: tk('Karty dające dodatkową manę albo dodatkowe Lands, np. Sol Ring, Cultivate.'),
  draw: tk('Karty, które dobierają lub odkrywają nowe karty.'),
  removal: tk('Karty usuwające jedno zagrożenie: niszczenie, wygnanie, obrażenia, kontrowanie.'),
  wipe: tk('Karty usuwające wiele stworów lub permanentów naraz.'),
};

/** Stałe cele dla 100-kartowej talii Commander (Lands liczymy osobno ze średniego kosztu). */
const BASE_TARGETS: Omit<Record<Role, number>, 'lands'> = { ramp: 10, draw: 10, removal: 8, wipe: 3 };

export const COMMANDER_DECK_SIZE = 100;

const TARGET = String.raw`(?:creature|artifact|enchantment|planeswalker|battle|permanent|nonland permanent|spell)`;
const REMOVAL_PATTERNS = [
  new RegExp(String.raw`\b(?:destroy|exile) (?:up to (?:one|two|three|x) )?(?:another )?target (?:[\w-]+ )*?${TARGET}s?\b(?! you control)`),
  /\bdeals? (?:\d+|x|that much) damage to (?:any target|(?:up to one )?target (?:creature|planeswalker|player or planeswalker|battle))/,
  new RegExp(String.raw`\breturn (?:up to one )?target (?:[\w-]+ )*?(?:creature|permanent|nonland permanent)s?(?! you control)[^.]* to (?:its|their) owner(?:'s|s') hands?`),
  /\bcounter target (?:[\w-]+ )*?spell/,
  /\btarget (?:player|opponent) sacrifices\b/,
  /\bfights? (?:up to one )?(?:another )?target creature/,
  /\btarget creature(?! you control)[^.]* gets -(?:\d+|x)\/-(?:\d+|x)/,
  /\bowner of target (?:[\w-]+ )*?permanent shuffles it into\b/,
  /\bput target (?:[\w-]+ )*?(?:creature|permanent|nonland permanent)(?! you control)[^.]* (?:on the bottom|on top|into) (?:of )?its owner's library/,
];
const WIPE_PATTERNS = [
  /\b(?:destroy|exile) all (?:other )?(?:[\w-]+ )*?(?:creatures|nonland permanents|permanents|artifacts|enchantments|planeswalkers)/,
  /\ball (?:other )?creatures get -(?:\d+|x)\/-(?:\d+|x)/,
  /\bdeals? (?:\d+|x) damage to each (?:other )?creature/,
  /\beach (?:player|opponent) sacrifices (?:all|a|two|three)\b/,
  /\breturn all (?:other )?(?:[\w-]+ )*?(?:creatures|nonland permanents|permanents) to (?:their|its) owners?'? hands?/,
];
const DRAW_PATTERNS = [
  /\bdraws? (?:a|an|one|two|three|four|five|six|seven|x|that many|\d+) (?:additional )?cards?\b/,
  /\bdraws? cards equal to\b/,
  /\bexile the top [^.]*?cards? of your library[^.]*\.[^.]*\byou may (?:play|cast)\b/,
];
const RAMP_PATTERNS = [
  /\bsearch your library for [^.]*?\b(?:land|forest|plains|island|swamp|mountain)s?\b[^.]*?onto the battlefield/,
  /\bput (?:up to (?:one|two) )?(?:a )?land cards? from your hand onto the battlefield/,
  /\byou may play (?:an|two) additional lands?\b/,
];
// Zdolność many na permanencie („{T}: Add {G}”, „Add one mana of any color”)
const MANA_ABILITY = /\badd (?:\{[wubrgcs0-9x]\}|one mana|two mana|three mana|an amount of)/;

function cardText(card: ScryfallCard): string {
  const parts = [card.oracle_text || '', ...(card.card_faces?.map((f) => f.oracle_text || '') ?? [])];
  return parts.join('\n').toLowerCase();
}

function frontType(card: ScryfallCard): string {
  return (card.card_faces?.[0]?.type_line || card.type_line || '').toLowerCase();
}

const isBasic = (card: ScryfallCard) => /\bbasic\b/.test(frontType(card)) && /\bland\b/.test(frontType(card));

/** Role karty rozpoznane z typu i tekstu reguł. */
export function cardRoles(card: ScryfallCard): Role[] {
  if (isLand(card)) return ['lands'];
  const text = cardText(card);
  const type = frontType(card);
  const roles: Role[] = [];
  const permanent = !/\b(?:instant|sorcery)\b/.test(type);
  if (RAMP_PATTERNS.some((r) => r.test(text)) || (permanent && MANA_ABILITY.test(text))) roles.push('ramp');
  if (DRAW_PATTERNS.some((r) => r.test(text))) roles.push('draw');
  if (WIPE_PATTERNS.some((r) => r.test(text))) roles.push('wipe');
  if (REMOVAL_PATTERNS.some((r) => r.test(text))) roles.push('removal');
  return roles;
}

/** Role z listy EDHREC, gdy nie mamy danych karty. */
function listRoles(list: string): Role[] {
  if (list === 'lands' || list === 'utilitylands') return ['lands'];
  if (list === 'manaartifacts') return ['ramp'];
  return [];
}

export interface RoleStatus {
  role: Role;
  have: number;
  target: number;
}

export interface DeckProgress {
  /** Karty w talii razem z dowódcą (bez sideboardu). */
  size: number;
  full: boolean;
  roles: RoleStatus[];
  /** Brakujący odsetek celu dla roli (0 = cel osiągnięty, 1 = nic z tej roli). */
  need: Record<Role, number>;
}

/** Liczy role w talii i cele dla 100 kart. */
export function deckProgress(deck: DeckItem): DeckProgress {
  const have: Record<Role, number> = { lands: 0, ramp: 0, draw: 0, removal: 0, wipe: 0 };
  let size = deck.commander ? 1 : 0;
  let mvSum = 0;
  let spells = 0;
  for (const e of deck.cards) {
    if (e.isCommander || e.isSideboard) continue;
    const qty = Math.max(0, e.quantity || 0);
    size += qty;
    const roles = cardRoles(e.card);
    roles.forEach((r) => (have[r] += qty));
    if (!roles.includes('lands')) {
      mvSum += (e.card.cmc || 0) * qty;
      spells += qty;
    }
  }
  // Wzór Franka Karstena dla 99 kart minus ok. 3 Lands za 10 kart rampy; przy prawie pustej talii średni koszt 2,8
  const avgMv = spells >= 10 ? mvSum / spells : 2.8;
  const landTarget = Math.min(40, Math.max(33, Math.round(31.42 + 3.13 * avgMv) - 3));
  const targets: Record<Role, number> = { lands: landTarget, ...BASE_TARGETS };
  const need = {} as Record<Role, number>;
  ROLES.forEach((r) => (need[r] = Math.max(0, targets[r] - have[r]) / targets[r]));
  return {
    size,
    full: size >= COMMANDER_DECK_SIZE,
    roles: ROLES.map((role) => ({ role, have: have[role], target: targets[role] })),
    need,
  };
}

export interface AssistantPick {
  name: string;
  card: ScryfallCard | null;
  roles: Role[];
  /** Odsetek talii z tym dowódcą grających kartę (tylko dla rekomendacji EDHREC). */
  inclusion: number | null;
  free: number;
  rec: EdhrecRecommendation;
}

interface PickOptions {
  deck: DeckItem;
  progress: DeckProgress;
  recommendations: EdhrecRecommendation[];
  availability: Map<string, CardAvailability>;
  /** Talia tylko z kolekcji: proponujemy wyłącznie wolne karty. */
  collectionOnly: boolean;
  preferFree: boolean;
  limit: number;
}

const ROLE_WEIGHT = 35;

function deckNameSet(deck: DeckItem): Set<string> {
  const s = new Set<string>();
  deck.cards.forEach((e) => s.add(cardNameKey(e.card.name)));
  if (deck.commander) s.add(cardNameKey(deck.commander.name));
  return s;
}

/** Następne karty z EDHREC: popularność + synergia + uzupełnianie brakujących ról + wolne egzemplarze. */
export function nextPicks({ deck, progress, recommendations, availability, collectionOnly, preferFree, limit }: PickOptions): AssistantPick[] {
  if (progress.full) return [];
  const inDeck = deckNameSet(deck);
  const landsFull = progress.need.lands === 0;
  const scored: Array<AssistantPick & { score: number }> = [];
  for (const rec of recommendations) {
    const key = cardNameKey(rec.name);
    if (inDeck.has(key)) continue;
    if (rec.card && isBasic(rec.card)) continue;
    const free = availability.get(key)?.free || 0;
    if (collectionOnly && free === 0) continue;
    const roles = rec.card ? cardRoles(rec.card) : listRoles(rec.list);
    if (landsFull && roles.includes('lands')) continue;
    const roleBonus = roles.reduce((s, r) => s + progress.need[r] * ROLE_WEIGHT, 0);
    const score = rec.inclusion * 100 + Math.max(0, rec.synergy) * 40 + roleBonus + (preferFree && free > 0 ? 25 : 0);
    scored.push({ name: rec.name, card: rec.card, roles, inclusion: rec.inclusion, free, rec, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Wolne karty z kolekcji spoza rekomendacji EDHREC, które uzupełniają brakujące role
 * (w kolorach dowódcy i dozwolone w Commanderze), od najpopularniejszych w ogóle (ranking EDHREC).
 */
export function collectionPicks(opts: {
  deck: DeckItem;
  progress: DeckProgress;
  collection: CollectionItem[];
  availability: Map<string, CardAvailability>;
  exclude: Set<string>;
  limit: number;
  /** Najlepszy posiadany egzemplarz każdej karty (wydanie i foil). */
  printings?: Map<string, OwnedPrinting>;
}): AssistantPick[] {
  const { deck, progress, collection, availability, exclude, limit, printings } = opts;
  if (progress.full || !deck.commander) return [];
  const identity = new Set(deck.commander.color_identity || []);
  const inDeck = deckNameSet(deck);
  const seen = new Set<string>();
  const out: Array<AssistantPick & { rank: number; gain: number }> = [];
  for (const item of collection) {
    const card = item.card;
    if (!card) continue;
    const key = cardNameKey(card.name);
    if (seen.has(key) || inDeck.has(key) || exclude.has(key)) continue;
    seen.add(key);
    if (isBasic(card)) continue;
    if (card.legalities && card.legalities.commander !== 'legal') continue;
    if (!(card.color_identity || []).every((c) => identity.has(c))) continue;
    const free = availability.get(key)?.free || 0;
    if (free === 0) continue;
    const roles = cardRoles(card);
    const gain = roles.reduce((s, r) => s + progress.need[r], 0);
    if (gain === 0) continue;
    const own = printings?.get(key);
    const shown = own?.card ?? card;
    const rec: EdhrecRecommendation = { name: card.name, inclusion: 0, numDecks: 0, synergy: 0, list: '', card: shown, isFoil: own?.isFoil };
    out.push({ name: card.name, card: shown, roles, inclusion: null, free, rec, rank: card.edhrec_rank ?? Number.MAX_SAFE_INTEGER, gain });
  }
  return out.sort((a, b) => b.gain - a.gain || a.rank - b.rank).slice(0, limit);
}
