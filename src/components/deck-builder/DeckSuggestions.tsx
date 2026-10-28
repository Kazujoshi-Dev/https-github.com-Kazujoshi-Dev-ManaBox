import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Wand2, Loader2, ExternalLink, Plus, ArrowRight, Repeat, Library, AlertCircle, TrendingUp, Heart } from 'lucide-react';
import type { CollectionItem, DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError, scryfallNamedImageUrl } from '../../utils/formatters';
import type { EdhrecRecommendation } from '../../services/api';
import { useEdhrecCommander } from './useEdhrecCommander';
import { getCardCategory } from './constants';
import { ReplaceCardModal } from './ReplaceCardModal';
import { useT, locale, binderName } from '../../i18n';
import { computeCardAvailability, type CardAvailability } from '../../utils/cardAvailability';

interface DeckSuggestionsProps {
  deck: DeckItem;
  collection: CollectionItem[];
  /** Wszystkie talie użytkownika: karty z kolekcji, które już są w innych taliach, nie są „wolne”. */
  decks?: DeckItem[];
  onViewCardDetails: (card: ScryfallCard) => void;
  /** Dodaje kartę (gdy mamy jej dane) albo szuka jej po nazwie. */
  onAddCard: (rec: EdhrecRecommendation) => void;
  /** Zamienia kartę z talii na rekomendowaną. */
  onReplaceCard: (oldCard: ScryfallCard, rec: EdhrecRecommendation) => void;
  /** Nazwy kart z listy życzeń (małe litery, przednia strona). */
  wishlistNames?: Set<string>;
  onAddToWishlist?: (rec: EdhrecRecommendation) => Promise<void>;
  /** Włącza asystenta budowy (gdy jest wyłączony). */
  onEnableAssistant?: () => void;
}

const LIST_TO_CATEGORY: Record<string, string> = {
  creatures: 'Creatures',
  instants: 'Instants',
  sorceries: 'Sorceries',
  artifacts: 'Artifacts',
  utilityartifacts: 'Artifacts',
  manaartifacts: 'Artifacts',
  enchantments: 'Enchantments',
  planeswalkers: 'Planeswalkers',
  lands: 'Lands',
  utilitylands: 'Lands',
  battles: 'Other'
};

const CATEGORY_TABS = ['Wszystkie', 'Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Planeswalkers', 'Lands', 'Other'];

const frontName = (name: string) => name.split('//')[0].trim().toLowerCase();
const pct = (v: number) => `${Math.round(v * 100)}%`;

function categoryOf(rec: EdhrecRecommendation): string {
  return rec.card ? getCardCategory(rec.card) : LIST_TO_CATEGORY[rec.list] || 'Other';
}

const PREVIEW_W = 240;
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488);

type HoverPreview = { name: string; img: string; x: number; y: number };

/** Pozycja podglądu obok elementu: po prawej, a gdy brak miejsca, po lewej; zawsze w granicach okna. */
function previewPosition(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = r.right + gap;
  if (x + PREVIEW_W > vw - 8) x = Math.max(8, r.left - gap - PREVIEW_W);
  const y = Math.min(Math.max(8, r.top + r.height / 2 - PREVIEW_H / 2), vh - PREVIEW_H - 8);
  return { x, y };
}

const isBasicLand = (card: ScryfallCard) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

/** Sugestie z EDHREC: popularne karty dla dowódcy, których brak w talii, i lepsze odpowiedniki. */
export const DeckSuggestions: React.FC<DeckSuggestionsProps> = ({ deck, collection, decks, onViewCardDetails, onAddCard, onReplaceCard, wishlistNames, onAddToWishlist, onEnableAssistant }) => {
  const t = useT();
  const [wishBusy, setWishBusy] = useState<string | null>(null);
  const commanderName = deck.commander?.name || '';
  const { data, error, loading } = useEdhrecCommander(commanderName);
  const [tab, setTab] = useState('Wszystkie');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [limit, setLimit] = useState(18);
  const [replaceRec, setReplaceRec] = useState<EdhrecRecommendation | null>(null);
  // Podgląd grafiki karty po najechaniu myszą w sekcji „Lepsze odpowiedniki”
  const [preview, setPreview] = useState<HoverPreview | null>(null);
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [preview]);

  const previewProps = (name: string, card?: ScryfallCard) => {
    const img = card ? getCardImageUri(card, 'normal') : scryfallNamedImageUrl(name.split('//')[0].trim(), 'normal');
    const show = (el: HTMLElement) => img && setPreview({ name, img, ...previewPosition(el) });
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && show(e.currentTarget),
      onPointerLeave: () => setPreview(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(e.currentTarget),
      onBlur: () => setPreview(null),
      // Kliknięcie otwiera szczegóły karty, więc chowamy podgląd
      onClickCapture: () => setPreview(null),
    };
  };

  const deckNames = useMemo(() => {
    const s = new Set<string>();
    deck.cards.forEach((e) => s.add(frontName(e.card.name)));
    if (deck.commander) s.add(frontName(deck.commander.name));
    return s;
  }, [deck]);

  const owned = useMemo(() => new Set(collection.map((c) => frontName(c.card?.name || ''))), [collection]);
  // Wolne egzemplarze: posiadane minus te, które zajmują Twoje inne talie papierowe
  const availability = useMemo(() => computeCardAvailability(collection, decks || [], deck.id), [collection, decks, deck.id]);
  const availOf = (name: string): CardAvailability | undefined => availability.get(frontName(name));
  const hasFree = (name: string) => (availOf(name)?.free || 0) > 0;
  const collectionOnly = (deck.cardSource || 'collection') === 'collection';

  const inclusionByName = useMemo(
    () => new Map<string, number>((data?.cards || []).map((r) => [frontName(r.name), r.inclusion] as [string, number])),
    [data]
  );

  const missing = useMemo(
    () => (data?.cards || []).filter((r) => !deckNames.has(frontName(r.name))),
    [data, deckNames]
  );

  const visible = useMemo(
    () =>
      missing
        .filter((r) => tab === 'Wszystkie' || categoryOf(r) === tab)
        .filter((r) => !ownedOnly || (availability.get(frontName(r.name))?.free || 0) > 0),
    [missing, tab, ownedOnly, availability]
  );

  // Lepsze odpowiedniki: rzadko grane karty z talii → popularne karty tego samego typu i podobnego kosztu
  const upgrades = useMemo(() => {
    if (!data) return [];
    const byName = new Map<string, EdhrecRecommendation>(data.cards.map((r) => [frontName(r.name), r] as [string, EdhrecRecommendation]));
    const weak = deck.cards
      .filter((e) => !e.isCommander && !e.isSideboard && !isBasicLand(e.card))
      .map((e) => ({ card: e.card, inclusion: byName.get(frontName(e.card.name))?.inclusion ?? 0 }))
      .filter((w) => w.inclusion < 0.1)
      .sort((a, b) => a.inclusion - b.inclusion);
    const used = new Set<string>();
    const pool = missing.filter((r) => r.card && r.inclusion >= 0.2);
    const pairs: Array<{ from: ScryfallCard; fromInclusion: number; to: EdhrecRecommendation }> = [];
    for (const w of weak) {
      const cat = getCardCategory(w.card);
      const cmc = w.card.cmc || 0;
      const candidate = pool.find(
        (r) =>
          !used.has(r.name) &&
          getCardCategory(r.card!) === cat &&
          (r.card!.cmc || 0) <= cmc + 1 &&
          (!collectionOnly || (availability.get(frontName(r.name))?.free || 0) > 0)
      );
      if (!candidate) continue;
      used.add(candidate.name);
      pairs.push({ from: w.card, fromInclusion: w.inclusion, to: candidate });
      if (pairs.length >= 12) break;
    }
    return pairs;
  }, [data, deck.cards, missing, collectionOnly, availability]);

  if (!deck.commander) {
    return (
      <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> {t('Sugestie kart (EDHREC)')}
        </h3>
        <p className="text-sm text-stone-400 mt-2">{t('Wybierz dowódcę, aby zobaczyć karty najczęściej grane z nim przez innych graczy.')}</p>
        {onEnableAssistant && (
          <button type="button" onClick={onEnableAssistant} className="btn btn-secondary mt-3">
            <Wand2 className="w-4 h-4" /> {t('Włącz asystenta budowy')}
          </button>
        )}
      </section>
    );
  }

  /** Krótka i pełna informacja, gdzie leży karta: wolne egzemplarze w klaserach albo zajęte przez inne talie. */
  const availabilityNote = (avail?: CardAvailability): { short: string; full: string } | null => {
    if (!avail || avail.owned === 0) return null;
    if (avail.free > 0) {
      const [first, ...rest] = avail.freeBinders;
      const short = rest.length
        ? t('W klaserze „{name}” (+{n})', { name: binderName(first.binder), n: rest.length })
        : t('W klaserze „{name}”', { name: binderName(first.binder) });
      const list = avail.freeBinders.map((b) => `${binderName(b.binder)} (${b.qty})`).join(', ');
      const inDecks = avail.inDecks.length ? ' ' + t('Pozostałe są w taliach: {list}.', { list: avail.inDecks.map((d) => d.deckName).join(', ') }) : '';
      return { short, full: t('Wolne egzemplarze w klaserach: {list}.', { list }) + inDecks };
    }
    const names = avail.inDecks.map((d) => d.deckName);
    const short = names.length > 1
      ? t('W taliach: {list}', { list: names.join(', ') })
      : t('W talii „{name}”', { name: names[0] || '' });
    return {
      short,
      full: avail.owned > 1
        ? t('Wszystkie Twoje egzemplarze ({n}) są w innych taliach: {list}.', { n: avail.owned, list: names.join(', ') })
        : t('Masz tę kartę, ale jest w innej talii: {list}.', { list: names.join(', ') })
    };
  };

  const addDisabledReason = (rec: EdhrecRecommendation) =>
    collectionOnly && !owned.has(frontName(rec.name)) ? t('Talia korzysta tylko z kart z kolekcji. Przełącz źródło na „Wszystkie karty”, aby dodać') : null;

  return (
    <div className="space-y-4" aria-label={t('Sugestie kart')}>
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-lg font-semibold text-stone-50">{t('Sugestie dla {name}', { name: deck.commander.name })}</h2>
          <p className="text-xs text-stone-400">
            {data
              ? t('Na podstawie {n} talii z EDHREC: co grają inni gracze z tym dowódcą.', { n: data.numDecks.toLocaleString(locale()) })
              : t('Na podstawie talii z EDHREC: co grają inni gracze z tym dowódcą.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {onEnableAssistant && (
          <button type="button" onClick={onEnableAssistant} className="btn btn-secondary">
            <Wand2 className="w-4 h-4" /> {t('Włącz asystenta budowy')}
          </button>
        )}
        {data && (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1">
            {t('Zobacz na EDHREC')} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        </div>
      </div>

      {loading && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 flex items-center gap-3 text-sm text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" /> {t('Pobieranie rekomendacji z EDHREC...')}
        </div>
      )}
      {error && !loading && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex items-start gap-2 text-sm text-stone-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Lepsze odpowiedniki */}
          <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5">
            <div className="flex items-start gap-2.5 mb-3">
              <div>
                <h3 className="text-base font-semibold text-stone-50 flex items-center gap-2"><Repeat className="w-4 h-4 text-stone-400" />{t('Lepsze odpowiedniki')}</h3>
                <p className="text-sm text-stone-400 mt-0.5">
                  {t('Karty z talii, które gra mniej niż 10% graczy z tym dowódcą, i popularniejsze karty tego samego typu o podobnym koszcie.')}
                </p>
              </div>
            </div>
            {upgrades.length === 0 ? (
              <p className="text-sm text-stone-400">{t('Nie znaleźliśmy oczywistych zamienników. Karty w talii są popularne wśród graczy tego dowódcy.')}</p>
            ) : (
              <ul className="divide-y divide-stone-800">
                {upgrades.map(({ from, fromInclusion, to }) => (
                  <li key={from.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                      <button type="button" onClick={() => onViewCardDetails(from)} {...previewProps(from.name, from)} className="text-sm text-stone-300 hover:text-amber-300 truncate cursor-pointer text-left">
                        {from.name}
                      </button>
                      <span className="text-[11px] tabular-nums text-rose-300 shrink-0">{fromInclusion > 0 ? pct(fromInclusion) : t('rzadko')}</span>
                      <ArrowRight className="w-4 h-4 text-stone-500 shrink-0" />
                      <button type="button" onClick={() => to.card && onViewCardDetails(to.card)} {...previewProps(to.name, to.card)} className="text-sm font-semibold text-stone-100 hover:text-amber-300 truncate cursor-pointer text-left">
                        {to.name}
                      </button>
                      <span className="text-[11px] tabular-nums text-emerald-400 shrink-0">{pct(to.inclusion)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReplaceCard(from, to)}
                      className="h-9 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
                    >
                      <Repeat className="w-3.5 h-3.5" /> {t('Zamień')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Popularne karty spoza talii */}
          <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2.5">
                <div>
                  <h3 className="text-base font-semibold text-stone-50 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-stone-400" />{t('Najczęściej grane, których nie masz w talii')}</h3>
                  <p className="text-sm text-stone-400 mt-0.5">{t('Procent = ile talii z tym dowódcą gra kartę. Synergia = o ile częściej niż w innych taliach tych kolorów.')}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer h-9">
                <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <Library className="w-3.5 h-3.5 text-amber-400" /> {t('Tylko wolne z mojej kolekcji')}
              </label>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 mb-2">
              {CATEGORY_TABS.map((tb) => {
                const n = tb === 'Wszystkie' ? missing.length : missing.filter((r) => categoryOf(r) === tb).length;
                if (tb !== 'Wszystkie' && n === 0) return null;
                return (
                  <button
                    key={tb}
                    type="button"
                    onClick={() => { setTab(tb); setLimit(18); }}
                    className={`h-9 px-3 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                      tab === tb ? 'bg-stone-800 border-stone-600 text-stone-50' : 'bg-transparent border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
                    }`}
                  >
                    {t(tb)} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">{ownedOnly ? t('Brak w tej kategorii wolnych kart z Twojej kolekcji (spoza innych talii).') : t('Brak kart w tej kategorii.')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {visible.slice(0, limit).map((rec) => {
                  // Bez danych karty z bazy bierzemy obraz ze Scryfall po nazwie
                  const img = rec.card
                    ? getCardImageUri(rec.card, 'normal')
                    : scryfallNamedImageUrl(rec.name.split('//')[0].trim(), 'normal');
                  const avail = availOf(rec.name);
                  const free = avail?.free || 0;
                  // Masz kartę, ale wszystkie egzemplarze są w innych taliach
                  const allInDecks = Boolean(avail && avail.owned > 0 && free === 0);
                  const where = availabilityNote(avail);
                  const blocked = addDisabledReason(rec);
                  return (
                    <div key={rec.name} className="bg-stone-950 border border-stone-800 rounded-xl overflow-hidden flex flex-col">
                      <button
                        type="button"
                        onClick={() => rec.card && onViewCardDetails(rec.card)}
                        className="relative aspect-[488/680] bg-stone-900 cursor-pointer"
                        title={rec.name}
                      >
                        {img ? (
                          <img src={img} alt={rec.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, img)} className="w-full h-full object-contain" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center p-2 text-xs text-stone-300 text-center">{rec.name}</span>
                        )}
                        {free > 0 ? (
                          <span className="absolute top-1.5 left-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white tabular-nums">
                            {free > 1 ? t('Wolne: {n}', { n: free }) : t('Wolna')}
                          </span>
                        ) : allInDecks ? (
                          <span className="absolute top-1.5 left-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-stone-950">{t('W innej talii')}</span>
                        ) : null}
                      </button>
                      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
                        <p className="text-xs font-semibold text-stone-100 truncate" title={rec.name}>{rec.name}</p>
                        {where && (
                          <p className={`text-[11px] truncate ${free > 0 ? 'text-emerald-300' : 'text-amber-300'}`} title={where.full}>
                            {where.short}
                          </p>
                        )}
                        <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: pct(rec.inclusion) }} />
                        </div>
                        <p className="text-[11px] text-stone-400 flex justify-between gap-1">
                          <span><strong className="text-stone-200">{pct(rec.inclusion)}</strong> {t('talii')}</span>
                          {rec.synergy !== 0 && (
                            <span className={rec.synergy > 0 ? 'text-emerald-400' : 'text-stone-500'}>
                              {t('synergia')} {rec.synergy > 0 ? '+' : ''}{Math.round(rec.synergy * 100)}%
                            </span>
                          )}
                        </p>
                        <div className={`mt-auto grid gap-1.5 ${onAddToWishlist ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-2'}`}>
                          <button
                            type="button"
                            onClick={() => onAddCard(rec)}
                            disabled={Boolean(blocked)}
                            title={blocked || (allInDecks && where ? `${t('Dodaj do talii')}. ${where.full}` : t('Dodaj do talii'))}
                            className="h-8 rounded-md bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:bg-stone-800 disabled:text-stone-500 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3.5 h-3.5" /> {t('Dodaj')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplaceRec(rec)}
                            disabled={Boolean(blocked) || deck.cards.length === 0}
                            title={blocked || t('Wybierz kartę z talii, którą zastąpi')}
                            className="h-8 rounded-md ring-1 ring-stone-700 hover:bg-stone-800 text-stone-100 text-xs font-medium flex items-center justify-center gap-1 cursor-pointer disabled:text-stone-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            <Repeat className="w-3.5 h-3.5" /> {t('Zastąp')}
                          </button>
                          {onAddToWishlist && (() => {
                            const onList = wishlistNames?.has(frontName(rec.name));
                            return (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onList || wishBusy) return;
                                  setWishBusy(rec.name);
                                  try {
                                    await onAddToWishlist(rec);
                                  } finally {
                                    setWishBusy(null);
                                  }
                                }}
                                disabled={onList || wishBusy === rec.name}
                                aria-label={onList ? t('{name} jest na liście życzeń', { name: rec.name }) : t('Dodaj {name} do listy życzeń', { name: rec.name })}
                                title={onList ? t('Już na liście życzeń') : t('Dodaj do listy życzeń')}
                                className={`h-8 w-8 rounded-md ring-1 flex items-center justify-center cursor-pointer disabled:cursor-default ${
                                  onList ? 'ring-rose-500/40 bg-rose-500/10 text-rose-400' : 'ring-stone-700 text-stone-300 hover:bg-stone-800 hover:text-rose-300'
                                }`}
                              >
                                {wishBusy === rec.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className={`w-3.5 h-3.5 ${onList ? 'fill-rose-400' : ''}`} />}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {visible.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + 18)}
                className="mt-3 w-full h-10 rounded-xl bg-stone-950 border border-stone-800 text-sm font-semibold text-stone-300 hover:text-stone-100 cursor-pointer"
              >
                {t('Pokaż więcej')} ({visible.length - limit})
              </button>
            )}
            <p className="mt-3 text-[11px] text-stone-500">
              {t('Dane:')} <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">EDHREC</a> {t('(odświeżane raz na dobę).')}
            </p>
          </section>
        </>
      )}

      {preview &&
        createPortal(
          <div
            className="fixed z-[70] pointer-events-none hidden sm:block rounded-xl overflow-hidden ring-1 ring-stone-700 shadow-2xl bg-stone-950"
            style={{ left: preview.x, top: preview.y, width: PREVIEW_W, height: PREVIEW_H }}
            aria-hidden="true"
          >
            <img src={preview.img} alt="" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, preview.img)} className="w-full h-full object-contain" />
          </div>,
          document.body
        )}

      {replaceRec && (
        <ReplaceCardModal
          deck={deck}
          incoming={replaceRec}
          inclusionByName={inclusionByName}
          onClose={() => setReplaceRec(null)}
          onConfirm={(oldCard) => {
            onReplaceCard(oldCard, replaceRec);
            setReplaceRec(null);
          }}
        />
      )}
    </div>
  );
};
