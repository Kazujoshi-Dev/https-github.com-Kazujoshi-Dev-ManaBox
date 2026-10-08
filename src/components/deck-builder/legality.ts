import type { DeckItem, ScryfallCard } from '../../types';
import { getDeckFormat, isDigitalOnly, isOnArena, type DeckFormat } from '../../utils/mtgFormats';

export interface LegalityIssue {
  cardId: string;
  name: string;
  reasons: string[];
}

export interface LegalityReport {
  /** Czy talia jest sprawdzana (zawsze, gdy format jest znany). */
  active: boolean;
  format: DeckFormat;
  /** Problemy kart z talii, po id karty. */
  byCardId: Map<string, string[]>;
  cards: LegalityIssue[];
  /** Problemy z samym dowódcą. */
  commander: string[];
  /** Uwagi do całej talii (liczba kart, sideboard). Nie liczą się do `total`. */
  deck: string[];
  total: number;
}

const COLOR_NAME: Record<string, string> = { W: 'biały', U: 'niebieski', B: 'czarny', R: 'czerwony', G: 'zielony' };
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const RARITY_PLURAL: Record<string, string> = { common: 'pospolite', uncommon: 'niepospolite', rare: 'rzadkie', mythic: 'mityczne' };
const RARITY_ONE: Record<string, string> = { common: 'pospolita', uncommon: 'niepospolita', rare: 'rzadka', mythic: 'mityczna' };

const oracleText = (card: ScryfallCard) =>
  [card.oracle_text, ...(card.card_faces || []).map((f) => f?.oracle_text)].filter(Boolean).join('\n');

const isBasicLand = (card: ScryfallCard) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

const pluralKopie = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'kopie' : 'kopii');
const pluralKart = (n: number) => (n === 1 ? 'kartę' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'karty' : 'kart');

/** Ile kopii karty wolno mieć w talii: limit formatu, „any number”, „up to seven”, lądy podstawowe. */
function copyLimit(card: ScryfallCard, format: DeckFormat): number {
  if (isBasicLand(card)) return Infinity;
  const text = oracleText(card);
  if (/a deck can have any number of cards named/i.test(text)) return Infinity;
  const m = text.match(/a deck can have up to (\w+) cards named/i);
  if (m) return NUMBER_WORDS[m[1].toLowerCase()] || Number(m[1]) || format.maxCopies;
  if (format.legalityKey && card.legalities?.[format.legalityKey] === 'restricted') return 1;
  return format.maxCopies;
}

/** Powody, dla których sama karta nie pasuje do formatu (legalność, platforma, rzadkość). */
function cardReasons(card: ScryfallCard, format: DeckFormat, asCommander: boolean): string[] {
  const out: string[] = [];
  const name = format.label.replace(/^EDH /, '');

  if (format.platform === 'paper' && isDigitalOnly(card)) {
    out.push('Ta wersja istnieje tylko w MTG Arena, w formacie papierowym jej nie użyjesz');
    return out;
  }
  if (format.platform === 'arena' && !isOnArena(card)) {
    out.push('Karta niedostępna w MTG Arena');
    return out;
  }

  const status = format.legalityKey ? card.legalities?.[format.legalityKey] : undefined;
  // brak danych o legalności (np. stara kopia karty): nie zgadujemy
  if (status === 'banned') out.push(`${asCommander ? 'Zbanowany' : 'Zbanowana'} w formacie ${name}`);
  else if (status === 'not_legal') out.push(`Niedozwolona w formacie ${name}`);

  if (format.rarities && card.rarity && !format.rarities.includes(card.rarity) && !isBasicLand(card)) {
    const allowed = format.rarities.map((r) => RARITY_PLURAL[r] || r).join(' i ');
    out.push(`W formacie ${name} dozwolone są tylko karty ${allowed} (ta jest ${RARITY_ONE[card.rarity] || card.rarity})`);
  }
  return out;
}

/** Czy karta może być dowódcą: legendarny stwór (w Brawlu też planeswalker) albo tekst „can be your commander”. */
function canBeCommander(card: ScryfallCard, format: DeckFormat): boolean {
  const type = (card.card_faces?.[0]?.type_line || card.type_line || '').toLowerCase();
  if (type.includes('legendary') && type.includes('creature')) return true;
  if (format.planeswalkerCommander && type.includes('legendary') && type.includes('planeswalker')) return true;
  return /can be your commander/i.test(oracleText(card));
}

export function isCommanderFormat(deck: DeckItem): boolean {
  return getDeckFormat(deck.format).commander;
}

/** Sprawdza talię według zasad jej formatu: legalność kart, liczba kopii, rozmiar talii, zasady dowódcy. */
export function checkDeckLegality(deck: DeckItem): LegalityReport {
  const format = getDeckFormat(deck.format);
  const byCardId = new Map<string, string[]>();
  const commanderIssues: string[] = [];
  const deckIssues: string[] = [];

  const add = (card: ScryfallCard, reason: string) => {
    const list = byCardId.get(card.id) || [];
    if (!list.includes(reason)) list.push(reason);
    byCardId.set(card.id, list);
  };

  const commander = format.commander ? deck.commander || null : null;
  const identity = new Set(commander?.color_identity || []);
  if (commander) {
    commanderIssues.push(...cardReasons(commander, format, true));
    if (!canBeCommander(commander, format)) {
      commanderIssues.push(
        format.planeswalkerCommander
          ? 'Ta karta nie może być dowódcą (to nie legendarny stwór ani planeswalker)'
          : 'Ta karta nie może być dowódcą (to nie legendarny stwór)'
      );
    }
  }

  const main = deck.cards.filter((e) => !e.isSideboard && !e.isCommander);
  const side = deck.cards.filter((e) => e.isSideboard && !e.isCommander);

  // Liczba kopii po nazwie (ta sama karta może być w kilku wydaniach); sideboard liczy się razem z talią
  const copies = new Map<string, number>();
  for (const e of [...main, ...side]) copies.set(e.card.name, (copies.get(e.card.name) || 0) + e.quantity);

  for (const e of [...main, ...side]) {
    const card = e.card;
    for (const r of cardReasons(card, format, false)) add(card, r);

    if (commander) {
      const outside = (card.color_identity || []).filter((c) => !identity.has(c));
      if (outside.length) {
        add(card, `Kolor spoza tożsamości dowódcy: ${outside.map((c) => COLOR_NAME[c] || c).join(', ')}`);
      }
      if (card.name === commander.name) add(card, 'To jest dowódca talii, nie może być też wśród pozostałych kart');
    }

    const limit = copyLimit(card, format);
    const n = copies.get(card.name) || 0;
    if (n > limit) {
      const restricted = format.legalityKey && card.legalities?.[format.legalityKey] === 'restricted';
      const fmt = format.label.replace(/^EDH /, '');
      add(
        card,
        restricted
          ? `${n} ${pluralKopie(n)} w talii, a karta jest na liście ograniczonych (najwyżej 1)`
          : limit === 1
            ? `${n} ${pluralKopie(n)} w talii, a w formacie ${fmt} dozwolona jest 1`
            : `${n} ${pluralKopie(n)} w talii, limit to ${limit}`
      );
    }
  }

  // Rozmiar talii (z dowódcą) i sideboardu
  const mainCount = main.reduce((s, e) => s + e.quantity, 0) + (commander ? 1 : 0);
  const sideCount = side.reduce((s, e) => s + e.quantity, 0);
  if (mainCount > 0) {
    if (format.exactSize && mainCount !== format.deckSize) {
      deckIssues.push(
        mainCount < format.deckSize
          ? `Brakuje ${format.deckSize - mainCount} ${pluralKart(format.deckSize - mainCount)} do ${format.deckSize}`
          : `Talia ma ${mainCount} kart, o ${mainCount - format.deckSize} za dużo (dokładnie ${format.deckSize})`
      );
    } else if (!format.exactSize && mainCount < format.deckSize) {
      deckIssues.push(`Talia ma ${mainCount} kart, minimum to ${format.deckSize}`);
    }
  }
  if (format.commander && !commander && mainCount > 0) deckIssues.push('Wybierz dowódcę talii');
  if (sideCount > format.maxSideboard) {
    deckIssues.push(
      format.maxSideboard === 0
        ? `W formacie ${format.label.replace(/^EDH /, '')} nie ma sideboardu (jest ${sideCount} ${pluralKart(sideCount)})`
        : `Sideboard ma ${sideCount} kart, najwyżej ${format.maxSideboard}`
    );
  }

  const cards = [...main, ...side]
    .filter((e, i, arr) => byCardId.has(e.card.id) && arr.findIndex((x) => x.card.id === e.card.id) === i)
    .map((e) => ({ cardId: e.card.id, name: e.card.name, reasons: byCardId.get(e.card.id)! }));

  return {
    active: true,
    format,
    byCardId,
    cards,
    commander: commanderIssues,
    deck: deckIssues,
    total: cards.length + (commanderIssues.length ? 1 : 0)
  };
}

/** Dawna nazwa, zostawiona dla zgodności. */
export const checkCommanderLegality = checkDeckLegality;
