import React, { useMemo } from 'react';
import { Crown, SearchX } from 'lucide-react';
import { DeckItem, ScryfallCard } from '../../types';
import { getDeckFormat } from '../../utils/mtgFormats';
import { useT } from '../../i18n';

/** Minimalna długość frazy, od której przeszukujemy talie. */
export const DECK_CARD_SEARCH_MIN = 2;
const MAX_GROUPS = 60;

type Role = 'commander' | 'main' | 'sideboard';

interface DeckHit {
  deck: DeckItem;
  role: Role;
  quantity: number;
  isFoil: boolean;
}

interface CardGroup {
  key: string;
  card: ScryfallCard;
  hits: DeckHit[];
  rank: number;
}

/** Małe litery, bez polskich znaków i akcentów (Æther → aether, Łódź → lodz). */
export function normalizeCardName(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function cardNames(card: ScryfallCard): string[] {
  const names = [card.name, card.printed_name];
  for (const f of card.card_faces || []) names.push(f.name);
  return names.filter((n): n is string => Boolean(n)).map(normalizeCardName);
}

/** 0 = dokładnie ta nazwa, 1 = nazwa zaczyna się od frazy, 2 = fraza w środku, -1 = brak. */
function matchRank(card: ScryfallCard, q: string): number {
  let best = -1;
  for (const n of cardNames(card)) {
    const r = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : -1;
    if (r !== -1 && (best === -1 || r < best)) best = r;
  }
  return best;
}

export function searchCardsInDecks(decks: DeckItem[], rawQuery: string): CardGroup[] {
  const q = normalizeCardName(rawQuery);
  if (q.length < DECK_CARD_SEARCH_MIN) return [];
  const groups = new Map<string, CardGroup>();

  const add = (card: ScryfallCard, deck: DeckItem, role: Role, quantity: number, isFoil: boolean) => {
    const rank = matchRank(card, q);
    if (rank === -1) return;
    const key = card.name.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { key, card, hits: [], rank };
      groups.set(key, g);
    }
    // Ta sama karta w kilku wydaniach w jednej talii: sumujemy w jeden wpis
    const existing = g.hits.find((h) => h.deck.id === deck.id && h.role === role);
    if (existing) {
      existing.quantity += quantity;
      existing.isFoil = existing.isFoil || isFoil;
    } else {
      g.hits.push({ deck, role, quantity, isFoil });
    }
  };

  for (const deck of decks) {
    if (deck.commander && getDeckFormat(deck.format).commander) add(deck.commander, deck, 'commander', 1, Boolean(deck.commanderIsFoil));
    for (const entry of deck.cards || []) {
      if (!entry.card?.name) continue;
      add(entry.card, deck, entry.isCommander ? 'commander' : entry.isSideboard ? 'sideboard' : 'main', entry.quantity || 1, Boolean(entry.isFoil));
    }
  }

  const roleOrder: Record<Role, number> = { commander: 0, main: 1, sideboard: 2 };
  const list = [...groups.values()];
  for (const g of list) {
    g.hits.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.deck.name.localeCompare(b.deck.name));
  }
  return list.sort((a, b) => a.rank - b.rank || a.card.name.localeCompare(b.card.name));
}

function thumb(card: ScryfallCard): string {
  return card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '';
}

interface Props {
  decks: DeckItem[];
  query: string;
  onSelectDeck: (deck: DeckItem) => void;
}

export const DeckCardSearchResults: React.FC<Props> = ({ decks, query, onSelectDeck }) => {
  const t = useT();
  const groups = useMemo(() => searchCardsInDecks(decks, query), [decks, query]);

  if (normalizeCardName(query).length < DECK_CARD_SEARCH_MIN) {
    return <p className="text-sm text-stone-500">{t('Wpisz co najmniej {n} znaki nazwy karty.', { n: DECK_CARD_SEARCH_MIN })}</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-xl p-8 text-center space-y-2">
        <SearchX className="w-6 h-6 text-stone-500 mx-auto" />
        <p className="text-sm text-stone-300">{t('Żadna z Twoich talii nie zawiera karty „{q}”.', { q: query.trim() })}</p>
      </div>
    );
  }

  const shown = groups.slice(0, MAX_GROUPS);
  const deckCount = new Set(groups.flatMap((g) => g.hits.map((h) => h.deck.id))).size;
  const roleLabel = (role: Role) => (role === 'commander' ? t('Dowódca') : role === 'sideboard' ? t('Sideboard') : null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-400 tabular-nums">
        {t('Znalezione karty: {cards}, w taliach: {decks}', { cards: groups.length, decks: deckCount })}
      </p>
      <ul className="bg-stone-900 border border-stone-800 rounded-xl divide-y divide-stone-800 overflow-hidden">
        {shown.map((g) => {
          const img = thumb(g.card);
          const total = g.hits.reduce((s, h) => s + h.quantity, 0);
          return (
            <li key={g.key} className="p-3 sm:p-4 flex gap-3 sm:gap-4">
              <div className="w-12 sm:w-14 shrink-0 aspect-[488/680] rounded-md overflow-hidden bg-stone-800">
                {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-stone-50 truncate">{g.card.name}</h3>
                  <p className="text-xs text-stone-500 truncate">
                    {g.card.type_line}
                    <span className="tabular-nums">
                      {' · '}
                      {t('{n} szt. w {d} taliach', { n: total, d: new Set(g.hits.map((h) => h.deck.id)).size })}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.hits.map((h) => {
                    const role = roleLabel(h.role);
                    return (
                      <button
                        key={`${h.deck.id}-${h.role}`}
                        type="button"
                        onClick={() => onSelectDeck(h.deck)}
                        title={t('Otwórz talię „{name}”', { name: h.deck.name })}
                        className="max-w-full h-8 px-2.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-stone-600 text-xs text-stone-200 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {h.role === 'commander' && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        <span className="tabular-nums text-amber-300 shrink-0">{h.quantity}×</span>
                        <span className="truncate">{h.deck.name}</span>
                        {role && h.role !== 'commander' && <span className="text-stone-500 shrink-0">· {role}</span>}
                        {h.isFoil && <span className="text-stone-400 shrink-0">· Foil</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {groups.length > shown.length && (
        <p className="text-xs text-stone-500">{t('Pokazano {n} pierwszych wyników. Doprecyzuj nazwę, żeby zawęzić listę.', { n: shown.length })}</p>
      )}
    </div>
  );
};
