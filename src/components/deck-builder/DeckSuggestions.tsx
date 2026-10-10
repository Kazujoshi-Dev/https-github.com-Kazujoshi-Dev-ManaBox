import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, ExternalLink, Plus, ArrowRight, Repeat, Library, AlertCircle, TrendingUp, Heart } from 'lucide-react';
import type { CollectionItem, DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError, scryfallNamedImageUrl } from '../../utils/formatters';
import { edhrecApi, type EdhrecCommanderData, type EdhrecRecommendation } from '../../services/api';
import { getCardCategory } from './constants';
import { ReplaceCardModal } from './ReplaceCardModal';
import { useT, locale } from '../../i18n';

interface DeckSuggestionsProps {
  deck: DeckItem;
  collection: CollectionItem[];
  onViewCardDetails: (card: ScryfallCard) => void;
  /** Dodaje kartę (gdy mamy jej dane) albo szuka jej po nazwie. */
  onAddCard: (rec: EdhrecRecommendation) => void;
  /** Zamienia kartę z talii na rekomendowaną. */
  onReplaceCard: (oldCard: ScryfallCard, rec: EdhrecRecommendation) => void;
  /** Nazwy kart z listy życzeń (małe litery, przednia strona). */
  wishlistNames?: Set<string>;
  onAddToWishlist?: (rec: EdhrecRecommendation) => Promise<void>;
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

const isBasicLand = (card: ScryfallCard) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

/** Sugestie z EDHREC: popularne karty dla dowódcy, których brak w talii, i lepsze odpowiedniki. */
export const DeckSuggestions: React.FC<DeckSuggestionsProps> = ({ deck, collection, onViewCardDetails, onAddCard, onReplaceCard, wishlistNames, onAddToWishlist }) => {
  const t = useT();
  const [wishBusy, setWishBusy] = useState<string | null>(null);
  const commanderName = deck.commander?.name || '';
  const [data, setData] = useState<EdhrecCommanderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('Wszystkie');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [limit, setLimit] = useState(18);
  const [replaceRec, setReplaceRec] = useState<EdhrecRecommendation | null>(null);

  useEffect(() => {
    if (!commanderName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    edhrecApi
      .commander(commanderName)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && (setError(e.message), setData(null)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [commanderName]);

  const deckNames = useMemo(() => {
    const s = new Set<string>();
    deck.cards.forEach((e) => s.add(frontName(e.card.name)));
    if (deck.commander) s.add(frontName(deck.commander.name));
    return s;
  }, [deck]);

  const owned = useMemo(() => new Set(collection.map((c) => frontName(c.card?.name || ''))), [collection]);
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
        .filter((r) => !ownedOnly || owned.has(frontName(r.name))),
    [missing, tab, ownedOnly, owned]
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
          (!collectionOnly || owned.has(frontName(r.name)))
      );
      if (!candidate) continue;
      used.add(candidate.name);
      pairs.push({ from: w.card, fromInclusion: w.inclusion, to: candidate });
      if (pairs.length >= 12) break;
    }
    return pairs;
  }, [data, deck.cards, missing, collectionOnly, owned]);

  if (!deck.commander) {
    return (
      <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> {t('Sugestie kart (EDHREC)')}
        </h3>
        <p className="text-sm text-stone-400 mt-2">{t('Wybierz dowódcę, aby zobaczyć karty najczęściej grane z nim przez innych graczy.')}</p>
      </section>
    );
  }

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
        {data && (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1">
            {t('Zobacz na EDHREC')} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
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
                      <button type="button" onClick={() => onViewCardDetails(from)} className="text-sm text-stone-300 hover:text-amber-300 truncate cursor-pointer text-left">
                        {from.name}
                      </button>
                      <span className="text-[11px] tabular-nums text-rose-300 shrink-0">{fromInclusion > 0 ? pct(fromInclusion) : 'rzadko'}</span>
                      <ArrowRight className="w-4 h-4 text-stone-500 shrink-0" />
                      <button type="button" onClick={() => to.card && onViewCardDetails(to.card)} className="text-sm font-semibold text-stone-100 hover:text-amber-300 truncate cursor-pointer text-left">
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
                <Library className="w-3.5 h-3.5 text-amber-400" /> {t('Tylko z mojej kolekcji')}
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
              <p className="text-sm text-stone-400 py-2">{ownedOnly ? t('Brak kart w tej kategorii w Twojej kolekcji.') : t('Brak kart w tej kategorii.')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {visible.slice(0, limit).map((rec) => {
                  // Bez danych karty z bazy bierzemy obraz ze Scryfall po nazwie
                  const img = rec.card
                    ? getCardImageUri(rec.card, 'normal')
                    : scryfallNamedImageUrl(rec.name.split('//')[0].trim(), 'normal');
                  const isOwned = owned.has(frontName(rec.name));
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
                        {isOwned && (
                          <span className="absolute top-1.5 left-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">{t('W kolekcji')}</span>
                        )}
                      </button>
                      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
                        <p className="text-xs font-semibold text-stone-100 truncate" title={rec.name}>{rec.name}</p>
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
                            title={blocked || t('Dodaj do talii')}
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
