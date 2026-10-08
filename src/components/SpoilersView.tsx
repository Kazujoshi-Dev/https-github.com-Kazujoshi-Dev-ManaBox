import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderHeart, Search, RefreshCw, X, RotateCw, Sparkles, CalendarDays, Eye } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { ManaSymbol } from './ManaSymbol';
import { ScryfallCard } from '../types';
import { getCardImageUri, handleCardImageError, getRarityColor, getRarityLabel } from '../utils/formatters';
import { useBackToClose } from '../hooks/useBackButton';

/** Karta z dodatku w zapowiedziach: pola Scryfall, których nie ma w ogólnym typie. */
interface SpoilerCard extends ScryfallCard {
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  booster?: boolean;
  preview?: { previewed_at?: string; source?: string; source_uri?: string };
  card_faces?: Array<NonNullable<ScryfallCard['card_faces']>[number] & {
    flavor_text?: string; power?: string; toughness?: string; loyalty?: string; defense?: string;
  }>;
}

interface SpoilerSet {
  code: string;
  name: string;
  released_at: string;
  set_type: string;
  card_count: number;
  printed_size: number | null;
  icon_svg_uri?: string;
  scryfall_uri?: string;
}

interface SpoilerGroup {
  set: SpoilerSet;
  children: SpoilerSet[];
  total_cards: number;
}

interface SpoilersViewProps {
  onAddToWishlist?: (card: ScryfallCard) => Promise<void> | void;
}

type SortMode = 'newest' | 'number' | 'rarity';
type RarityFilter = 'all' | 'mythic' | 'rare' | 'uncommon' | 'common';
type ColorFilter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'M';

const SET_TYPE_LABELS: Record<string, string> = {
  expansion: 'Dodatek', core: 'Edycja podstawowa', masters: 'Masters', draft_innovation: 'Dodatek draftowy',
  commander: 'Commander', funny: 'Humorystyczny', starter: 'Startowy', box: 'Zestaw', duel_deck: 'Duel Deck',
  from_the_vault: 'From the Vault', spellbook: 'Signature Spellbook', premium_deck: 'Premium Deck',
  planechase: 'Planechase', archenemy: 'Archenemy', arsenal: 'Arsenal', masterpiece: 'Masterpiece',
};

const RARITY_ORDER: Record<string, number> = { mythic: 0, special: 1, bonus: 1, rare: 2, uncommon: 3, common: 4 };

const COLOR_FILTERS: Array<{ key: ColorFilter; label: string }> = [
  { key: 'W', label: 'Biały' }, { key: 'U', label: 'Niebieski' }, { key: 'B', label: 'Czarny' },
  { key: 'R', label: 'Czerwony' }, { key: 'G', label: 'Zielony' }, { key: 'M', label: 'Wielokolorowe' },
  { key: 'C', label: 'Bezbarwne' },
];

const RARITY_FILTERS: Array<{ key: RarityFilter; label: string }> = [
  { key: 'all', label: 'Wszystkie' }, { key: 'mythic', label: 'Mythic' }, { key: 'rare', label: 'Rare' },
  { key: 'uncommon', label: 'Uncommon' }, { key: 'common', label: 'Common' },
];

const DAY_MS = 86400000;

/** Data Scryfall (RRRR-MM-DD) jako polski tekst, bez przesunięć strefy czasowej. */
function formatDay(day?: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!day) return '';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('pl-PL', { ...opts, timeZone: 'UTC' });
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function releaseLabel(releasedAt: string, today: string) {
  const d = daysBetween(today, releasedAt);
  if (d > 1) return `premiera za ${d} dni`;
  if (d === 1) return 'premiera jutro';
  if (d === 0) return 'premiera dziś';
  return 'już w sprzedaży';
}

function cardColors(card: SpoilerCard): string[] {
  return card.colors ?? card.card_faces?.flatMap((f) => f.colors || []) ?? [];
}

function collectorKey(n: string) {
  const num = parseInt(n, 10);
  return Number.isFinite(num) ? num : 99999;
}

/** Tekst zasad z symbolami many w miejscu zapisu {T}, {2}{W} itd. */
const RulesText: React.FC<{ text?: string }> = ({ text }) => {
  if (!text) return null;
  return (
    <>
      {text.split(/(\{[^}]+\})/g).map((part, i) =>
        /^\{[^}]+\}$/.test(part)
          ? <span key={i} className="inline-block align-[-3px] mx-px"><ManaSymbol cost={part} size="sm" /></span>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
};

export const SpoilersView: React.FC<SpoilersViewProps> = ({ onAddToWishlist }) => {
  const [groups, setGroups] = useState<SpoilerGroup[]>([]);
  const [today, setToday] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [setCode, setSetCode] = useState<string | null>(null);

  const [cards, setCards] = useState<SpoilerCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [colors, setColors] = useState<ColorFilter[]>([]);
  const [sort, setSort] = useState<SortMode>('newest');
  const [showVariants, setShowVariants] = useState(false);
  const [openCard, setOpenCard] = useState<SpoilerCard | null>(null);

  // Lista nadchodzących dodatków
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setGroupsLoading(true);
        setGroupsError(null);
        const res = await fetch('/api/scryfall/spoilers');
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (cancelled) return;
        const list: SpoilerGroup[] = Array.isArray(json.data) ? json.data : [];
        setGroups(list);
        if (json.today) setToday(json.today);
        if (list.length) {
          setGroupCode(list[0].set.code);
          setSetCode(list[0].set.code);
        }
      } catch {
        if (!cancelled) setGroupsError('Nie udało się pobrać listy nadchodzących dodatków. Spróbuj ponownie za chwilę.');
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Karty wybranego dodatku
  useEffect(() => {
    if (!setCode) return;
    let cancelled = false;
    (async () => {
      try {
        setCardsLoading(true);
        setCardsError(null);
        const res = await fetch(`/api/scryfall/spoilers/${setCode}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setCards(Array.isArray(json.cards) ? json.cards : []);
      } catch {
        if (!cancelled) {
          setCards([]);
          setCardsError('Nie udało się pobrać kart z tego dodatku. Spróbuj ponownie za chwilę.');
        }
      } finally {
        if (!cancelled) setCardsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setCode, reloadKey]);

  const group = groups.find((g) => g.set.code === groupCode) || null;
  const groupSets = group ? [group.set, ...group.children] : [];
  const activeSet = groupSets.find((s) => s.code === setCode) || group?.set || null;

  const selectGroup = (g: SpoilerGroup) => {
    setGroupCode(g.set.code);
    setSetCode(g.set.code);
  };

  // Warianty grafik (showcase, borderless…) zwijamy do podstawowej wersji karty
  const baseCards = useMemo(() => {
    if (showVariants) return cards;
    const seen = new Map<string, SpoilerCard>();
    const sorted = [...cards].sort((a, b) => collectorKey(a.collector_number) - collectorKey(b.collector_number));
    for (const c of sorted) {
      const key = c.oracle_id || c.name;
      if (!seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
  }, [cards, showVariants]);

  const variantCount = cards.length - baseCards.length;

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = baseCards.filter((c) => {
      if (rarity !== 'all' && c.rarity !== rarity) return false;
      if (colors.length) {
        const cs = cardColors(c);
        const matches = colors.some((f) =>
          f === 'M' ? cs.length > 1 : f === 'C' ? cs.length === 0 : cs.includes(f)
        );
        if (!matches) return false;
      }
      if (q) {
        const hay = [c.name, c.printed_name, c.type_line, c.oracle_text, ...(c.card_faces || []).map((f) => `${f.name} ${f.type_line || ''} ${f.oracle_text || ''}`)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byNumber = (a: SpoilerCard, b: SpoilerCard) =>
      collectorKey(a.collector_number) - collectorKey(b.collector_number) || a.collector_number.localeCompare(b.collector_number);
    return list.sort((a, b) => {
      if (sort === 'newest') {
        const pa = a.preview?.previewed_at || '';
        const pb = b.preview?.previewed_at || '';
        return pb.localeCompare(pa) || byNumber(a, b);
      }
      if (sort === 'rarity') return (RARITY_ORDER[a.rarity] ?? 5) - (RARITY_ORDER[b.rarity] ?? 5) || byNumber(a, b);
      return byNumber(a, b);
    });
  }, [baseCards, query, rarity, colors, sort]);

  const newCount = useMemo(
    () => baseCards.filter((c) => c.preview?.previewed_at && daysBetween(c.preview.previewed_at, today) <= 1).length,
    [baseCards, today]
  );

  const toggleColor = (c: ColorFilter) =>
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const hasFilters = query || rarity !== 'all' || colors.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spoilery"
        description="Karty zapowiedziane z nadchodzących dodatków, na bieżąco ze Scryfall. Nowe zapowiedzi pojawiają się tu w ciągu kilkudziesięciu minut."
      />

      {groupsLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 w-60 shrink-0 rounded-xl bg-stone-900 border border-stone-800 animate-pulse" />)}
        </div>
      ) : groupsError ? (
        <p className="text-sm text-rose-300">{groupsError}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6 text-sm text-stone-400">
          Obecnie nie ma zapowiedzianych dodatków. Zajrzyj tu, gdy ruszy sezon spoilerów.
        </div>
      ) : (
        <>
          {/* Nadchodzące dodatki */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto pb-1 snap-x">
            {groups.map((g) => {
              const active = g.set.code === groupCode;
              return (
                <button
                  key={g.set.code}
                  type="button"
                  onClick={() => selectGroup(g)}
                  className={`snap-start shrink-0 w-64 text-left rounded-xl border p-3 transition-colors ${
                    active ? 'border-amber-500/60 bg-amber-500/10' : 'border-stone-800 bg-stone-900/60 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {g.set.icon_svg_uri && (
                      <img src={g.set.icon_svg_uri} alt="" className={`w-7 h-7 shrink-0 mt-0.5 invert ${active ? 'opacity-100' : 'opacity-70'}`} />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${active ? 'text-amber-200' : 'text-stone-100'}`}>{g.set.name}</p>
                      <p className="text-xs text-stone-400 tabular-nums">
                        {formatDay(g.set.released_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {releaseLabel(g.set.released_at, today)}
                      </p>
                      <p className="text-xs text-stone-500 tabular-nums mt-0.5">
                        {g.total_cards > 0 ? `${g.total_cards} kart` : 'jeszcze bez kart'}
                        {g.children.length > 0 && ` · ${g.children.length + 1} kategorie`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {group && (
            <div className="space-y-4">
              {/* Kategorie w dodatku (główny set, Commander, bonusy…) */}
              {groupSets.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {groupSets.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSetCode(s.code)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        s.code === activeSet?.code
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                          : 'border-stone-800 bg-stone-900 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="truncate max-w-[16rem]">{s.code === group.set.code ? 'Główny dodatek' : s.name}</span>
                      <span className="text-xs text-stone-500 tabular-nums">{s.card_count}</span>
                    </button>
                  ))}
                </div>
              )}

              {activeSet && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-400">
                  <span className="font-medium text-stone-200">{activeSet.name}</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{formatDay(activeSet.released_at)}</span>
                  <span className="tabular-nums">
                    {activeSet.printed_size && activeSet.printed_size >= baseCards.length
                      ? `zapowiedziano ${baseCards.length} z ${activeSet.printed_size} kart`
                      : `${baseCards.length} kart`}
                  </span>
                  {newCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300"><Sparkles className="w-4 h-4" />{newCount} nowych od wczoraj</span>
                  )}
                  <span className="text-stone-500">{SET_TYPE_LABELS[activeSet.set_type] || activeSet.set_type}</span>
                </div>
              )}

              {/* Filtry */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative lg:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Szukaj w nazwie, typie, tekście"
                    className="w-full rounded-lg bg-stone-900 border border-stone-800 pl-9 pr-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {RARITY_FILTERS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRarity(r.key)}
                      className={`rounded-md px-2.5 py-1 text-xs border ${rarity === r.key ? 'border-amber-500/60 bg-amber-500/10 text-amber-200' : 'border-stone-800 text-stone-400 hover:text-stone-200'}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLOR_FILTERS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      aria-pressed={colors.includes(c.key)}
                      onClick={() => toggleColor(c.key)}
                      className={`rounded-full p-0.5 border transition-opacity ${colors.includes(c.key) ? 'border-amber-400 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    >
                      {c.key === 'M'
                        ? <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[11px] font-bold bg-gradient-to-br from-amber-300 via-red-500 to-blue-600 text-white">M</span>
                        : <ManaSymbol cost={`{${c.key}}`} size="md" />}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 lg:ml-auto">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortMode)}
                    className="rounded-lg bg-stone-900 border border-stone-800 px-2.5 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/60"
                    aria-label="Sortowanie"
                  >
                    <option value="newest">Najnowsze zapowiedzi</option>
                    <option value="number">Numer w dodatku</option>
                    <option value="rarity">Rzadkość</option>
                  </select>
                  <button type="button" className="btn btn-ghost" title="Odśwież" onClick={() => setReloadKey((k) => k + 1)}>
                    <RefreshCw className={`w-4 h-4 ${cardsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              {(variantCount > 0 || showVariants) && (
                <label className="inline-flex items-center gap-2 text-sm text-stone-400 cursor-pointer select-none">
                  <input type="checkbox" checked={showVariants} onChange={(e) => setShowVariants(e.target.checked)} className="accent-amber-500" />
                  Pokaż alternatywne grafiki {!showVariants && <span className="tabular-nums">({variantCount})</span>}
                </label>
              )}

              {/* Karty */}
              {cardsLoading && cards.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="aspect-[488/680] rounded-xl bg-stone-900 border border-stone-800 animate-pulse" />
                  ))}
                </div>
              ) : cardsError ? (
                <p className="text-sm text-rose-300">{cardsError}</p>
              ) : visibleCards.length === 0 ? (
                <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6 text-sm text-stone-400">
                  {cards.length === 0
                    ? 'W tej kategorii nie zapowiedziano jeszcze żadnej karty.'
                    : 'Żadna karta nie pasuje do wybranych filtrów.'}
                  {hasFilters && cards.length > 0 && (
                    <button type="button" className="btn btn-ghost ml-2" onClick={() => { setQuery(''); setRarity('all'); setColors([]); }}>
                      Wyczyść filtry
                    </button>
                  )}
                </div>
              ) : (
                <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 transition-opacity ${cardsLoading ? 'opacity-60' : ''}`}>
                  {visibleCards.map((card) => {
                    const img = getCardImageUri(card, 'normal');
                    const isNew = card.preview?.previewed_at && daysBetween(card.preview.previewed_at, today) <= 1;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => setOpenCard(card)}
                        className="group text-left"
                      >
                        <div className="relative">
                          <img
                            src={img}
                            alt={card.name}
                            loading="lazy"
                            onError={(e) => handleCardImageError(e, img)}
                            className="w-full aspect-[488/680] object-cover rounded-[4.5%] bg-stone-900 shadow-md transition-transform group-hover:-translate-y-0.5"
                          />
                          {isNew && (
                            <span className="absolute top-2 right-2 rounded-md bg-amber-500 text-stone-950 text-[11px] font-bold px-1.5 py-0.5 shadow">NOWA</span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs text-stone-300 truncate group-hover:text-amber-200">{card.name}</p>
                        <p className="text-[11px] text-stone-500 tabular-nums truncate">
                          #{card.collector_number} · {getRarityLabel(card.rarity)}
                          {card.preview?.previewed_at && ` · ${formatDay(card.preview.previewed_at, { day: 'numeric', month: 'short' })}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-stone-500">
        Dane i grafiki kart: Scryfall. Karty i grafiki Magic: The Gathering należą do Wizards of the Coast.
      </p>

      {openCard && (
        <SpoilerCardModal
          card={openCard}
          onClose={() => setOpenCard(null)}
          onAddToWishlist={onAddToWishlist}
        />
      )}
    </div>
  );
};

const SpoilerCardModal: React.FC<{
  card: SpoilerCard;
  onClose: () => void;
  onAddToWishlist?: (card: ScryfallCard) => Promise<void> | void;
}> = ({ card, onClose, onAddToWishlist }) => {
  useBackToClose(true, onClose);
  const [faceIdx, setFaceIdx] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const faces = card.card_faces && card.card_faces.length > 1 ? card.card_faces : null;
  const hasFaceImages = Boolean(faces && faces.every((f) => f.image_uris));
  const img = hasFaceImages
    ? faces![faceIdx].image_uris!.large || faces![faceIdx].image_uris!.normal || ''
    : getCardImageUri(card, 'large');

  // Tekst: dla kart dwustronnych każda strona osobno
  const sections = faces
    ? faces.map((f) => ({ name: f.name, mana: f.mana_cost, type: f.type_line, text: f.oracle_text, flavor: f.flavor_text, power: f.power, toughness: f.toughness, loyalty: f.loyalty, defense: f.defense }))
    : [{ name: card.name, mana: card.mana_cost, type: card.type_line, text: card.oracle_text, flavor: card.flavor_text, power: card.power, toughness: card.toughness, loyalty: card.loyalty, defense: card.defense }];

  const handleWishlist = async () => {
    if (!onAddToWishlist || added) return;
    await onAddToWishlist(card);
    setAdded(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/80 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 btn btn-ghost z-10" aria-label="Zamknij">
          <X className="w-5 h-5" />
        </button>
        <div className="grid sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-5 p-5">
          <div className="space-y-2">
            <img
              src={img}
              alt={card.name}
              onError={(e) => handleCardImageError(e, img)}
              className="w-full max-w-xs mx-auto rounded-[4.5%] shadow-lg bg-stone-950"
            />
            {hasFaceImages && (
              <button type="button" className="btn btn-secondary w-full max-w-xs mx-auto flex justify-center" onClick={() => setFaceIdx((i) => (i + 1) % faces!.length)}>
                <RotateCw className="w-4 h-4" /> Odwróć kartę
              </button>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 pr-10">
              <span className="text-xs tabular-nums font-semibold bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                {card.set.toUpperCase()} #{card.collector_number}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getRarityColor(card.rarity)}`}>{getRarityLabel(card.rarity)}</span>
            </div>

            {sections.map((s, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-stone-50">{s.name}</h3>
                  <ManaSymbol cost={s.mana} size="md" />
                </div>
                {s.type && <p className="text-sm text-stone-300">{s.type}</p>}
                {(s.text || s.flavor) && (
                  <div className="p-3.5 bg-stone-950/90 rounded-xl border border-stone-800 text-sm leading-relaxed text-stone-200 whitespace-pre-wrap">
                    <RulesText text={s.text} />
                    {s.flavor && <p className={`italic text-stone-400 ${s.text ? 'mt-3' : ''}`}>{s.flavor}</p>}
                  </div>
                )}
                {(s.power || s.loyalty || s.defense) && (
                  <p className="text-sm text-stone-300 tabular-nums">
                    {s.power && <>Siła / Wytrzymałość: <span className="font-semibold text-stone-100">{s.power}/{s.toughness}</span></>}
                    {s.loyalty && <>Lojalność: <span className="font-semibold text-stone-100">{s.loyalty}</span></>}
                    {s.defense && <>Obrona: <span className="font-semibold text-stone-100">{s.defense}</span></>}
                  </p>
                )}
              </div>
            ))}

            <div className="text-xs text-stone-400 space-y-1">
              {card.artist && <p>Ilustracja: <span className="text-stone-300">{card.artist}</span></p>}
              {card.preview?.previewed_at && (
                <p className="flex flex-wrap items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Zapowiedź {formatDay(card.preview.previewed_at)}
                  {card.preview.source && (
                    <>
                      {' przez '}
                      {card.preview.source_uri ? (
                        <a href={card.preview.source_uri} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">
                          {card.preview.source}
                        </a>
                      ) : (
                        <span className="text-stone-300">{card.preview.source}</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {onAddToWishlist && (
                <button type="button" className="btn btn-primary" onClick={handleWishlist} disabled={added}>
                  <FolderHeart className="w-4 h-4" /> {added ? 'Na liście życzeń' : 'Dodaj do listy życzeń'}
                </button>
              )}
              {card.scryfall_uri && (
                <a href={card.scryfall_uri} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  <ExternalLink className="w-4 h-4" /> Scryfall
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
