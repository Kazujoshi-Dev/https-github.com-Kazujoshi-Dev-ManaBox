import type { DeckItem, ScryfallCard } from '../../types';

export interface LegalityIssue {
  cardId: string;
  name: string;
  reasons: string[];
}

export interface LegalityReport {
  /** Czy talia jest sprawdzana według zasad Commandera. */
  active: boolean;
  /** Problemy kart z talii, po id karty. */
  byCardId: Map<string, string[]>;
  cards: LegalityIssue[];
  /** Problemy z samym dowódcą. */
  commander: string[];
  total: number;
}

const COLOR_NAME: Record<string, string> = { W: 'biały', U: 'niebieski', B: 'czarny', R: 'czerwony', G: 'zielony' };
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const oracleText = (card: ScryfallCard) =>
  [card.oracle_text, ...(card.card_faces || []).map((f) => f?.oracle_text)].filter(Boolean).join('\n');

const isBasicLand = (card: ScryfallCard) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

/** Ile kopii karty wolno mieć w talii singleton (1, bez limitu albo „up to seven”). */
function copyLimit(card: ScryfallCard): number {
  if (isBasicLand(card)) return Infinity;
  const text = oracleText(card);
  if (/a deck can have any number of cards named/i.test(text)) return Infinity;
  const m = text.match(/a deck can have up to (\w+) cards named/i);
  if (m) return NUMBER_WORDS[m[1].toLowerCase()] || Number(m[1]) || 1;
  return 1;
}

function legalityReason(card: ScryfallCard, asCommander: boolean): string | null {
  const status = card.legalities?.commander;
  if (!status) return null; // brak danych o legalności (np. stara kopia karty) – nie zgadujemy
  if (status === 'banned') return asCommander ? 'Zbanowany w formacie Commander' : 'Zbanowana w formacie Commander';
  if (status === 'not_legal') return 'Niedozwolona w formacie Commander';
  return null;
}

/** Czy karta może być dowódcą: legendarny stwór albo karta z tekstem „can be your commander”. */
function canBeCommander(card: ScryfallCard): boolean {
  const type = (card.card_faces?.[0]?.type_line || card.type_line || '').toLowerCase();
  if (type.includes('legendary') && type.includes('creature')) return true;
  return /can be your commander/i.test(oracleText(card));
}

export function isCommanderFormat(deck: DeckItem): boolean {
  return Boolean(deck.commander) || /commander|edh/i.test(deck.format || '');
}

/** Sprawdza talię według zasad Commandera: legalność kart, tożsamość kolorów i zasadę jednej kopii. */
export function checkCommanderLegality(deck: DeckItem): LegalityReport {
  const byCardId = new Map<string, string[]>();
  const commanderIssues: string[] = [];
  if (!isCommanderFormat(deck)) return { active: false, byCardId, cards: [], commander: [], total: 0 };

  const add = (card: ScryfallCard, reason: string) => {
    const list = byCardId.get(card.id) || [];
    if (!list.includes(reason)) list.push(reason);
    byCardId.set(card.id, list);
  };

  const commander = deck.commander || null;
  const identity = new Set(commander?.color_identity || []);
  if (commander) {
    const r = legalityReason(commander, true);
    if (r) commanderIssues.push(r);
    if (!canBeCommander(commander)) commanderIssues.push('Ta karta nie może być dowódcą (to nie legendarny stwór)');
  }

  const main = deck.cards.filter((e) => !e.isSideboard && !e.isCommander);

  // Liczba kopii po nazwie (ta sama karta może być w kilku wydaniach)
  const copies = new Map<string, number>();
  for (const e of main) copies.set(e.card.name, (copies.get(e.card.name) || 0) + e.quantity);

  for (const e of main) {
    const card = e.card;
    const r = legalityReason(card, false);
    if (r) add(card, r);

    if (commander) {
      const outside = (card.color_identity || []).filter((c) => !identity.has(c));
      if (outside.length) {
        add(card, `Kolor spoza tożsamości dowódcy: ${outside.map((c) => COLOR_NAME[c] || c).join(', ')}`);
      }
    }

    const limit = copyLimit(card);
    const n = copies.get(card.name) || 0;
    const kopie = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'kopie' : 'kopii';
    if (n > limit) add(card, limit === 1 ? `${n} ${kopie} w talii, a w Commanderze dozwolona jest 1` : `${n} ${kopie} w talii, a dozwolone jest ${limit}`);

    if (commander && card.name === commander.name) add(card, 'To jest dowódca talii, nie może być też wśród 99 kart');
  }

  const cards = main
    .filter((e) => byCardId.has(e.card.id))
    .map((e) => ({ cardId: e.card.id, name: e.card.name, reasons: byCardId.get(e.card.id)! }));

  return { active: true, byCardId, cards, commander: commanderIssues, total: cards.length + (commanderIssues.length ? 1 : 0) };
}
