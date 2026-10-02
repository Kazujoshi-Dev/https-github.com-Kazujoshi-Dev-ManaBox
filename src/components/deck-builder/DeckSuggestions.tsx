import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, ExternalLink, Plus, ArrowRight, Repeat, Library, AlertCircle, TrendingUp } from 'lucide-react';
import type { CollectionItem, DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError } from '../../utils/formatters';
import { edhrecApi, type EdhrecCommanderData, type EdhrecRecommendation } from '../../services/api';
import { getCardCategory } from './constants';

interface DeckSuggestionsProps {
  deck: DeckItem;
  collection: CollectionItem[];
  onViewCardDetails: (card: ScryfallCard) => void;
  /** Dodaje kartę (gdy mamy jej dane) albo szuka jej po nazwie. */
  onAddCard: (rec: EdhrecRecommendation) => void;
  /** Zamienia kartę z talii na rekomendowaną. */
  onReplaceCard: (oldCard: ScryfallCard, rec: EdhrecRecommendation) => void;
}

const LIST_TO_CATEGORY: Record<string, string> = {
  creatures: 'Stwory',
  instants: 'Czary natychmiastowe',
  sorceries: 'Czary',
  artifacts: 'Artefakty',
  utilityartifacts: 'Artefakty',
  manaartifacts: 'Artefakty',
  enchantments: 'Zaczarowania',
  planeswalkers: 'Planeswalkerzy',
  lands: 'Lądy',
  utilitylands: 'Lądy',
  battles: 'Inne'
};

const CATEGORY_TABS = ['Wszystkie', 'Stwory', 'Czary natychmiastowe', 'Czary', 'Artefakty', 'Zaczarowania', 'Planeswalkerzy', 'Lądy'];

const frontName = (name: string) => name.split('//')[0].trim().toLowerCase();
const pct = (v: number) => `${Math.round(v * 100)}%`;

function categoryOf(rec: EdhrecRecommendation): string {
  return rec.card ? getCardCategory(rec.card) : LIST_TO_CATEGORY[rec.list] || 'Inne';
}

const isBasicLand = (card: ScryfallCard) => /\bbasic\b/i.test(card.type_line || '') && /\bland\b/i.test(card.type_line || '');

/** Sugestie z EDHREC: popularne karty dla dowódcy, których brak w talii, i lepsze odpowiedniki. */
export const DeckSuggestions: React.FC<DeckSuggestionsProps> = ({ deck, collection, onViewCardDetails, onAddCard, onReplaceCard }) => {
  const commanderName = deck.commander?.name || '';
  const [data, setData] = useState<EdhrecCommanderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('Wszystkie');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [limit, setLimit] = useState(18);

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
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Sugestie kart (EDHREC)
        </h3>
        <p className="text-sm text-stone-400 mt-2">Wybierz dowódcę, aby zobaczyć karty najczęściej grane z nim przez innych graczy.</p>
      </section>
    );
  }

  const addDisabledReason = (rec: EdhrecRecommendation) =>
    collectionOnly && !owned.has(frontName(rec.name)) ? 'Talia korzysta tylko z kart z kolekcji — przełącz źródło na „Wszystkie karty”, aby dodać' : null;

  return (
    <div className="space-y-4" aria-label="Sugestie kart">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-lg font-black text-stone-100">Sugestie dla {deck.commander.name}</h2>
          <p className="text-xs text-stone-400">
            Na podstawie {data ? `${data.numDecks.toLocaleString('pl-PL')} talii` : 'talii'} z EDHREC — co grają inni gracze z tym dowódcą.
          </p>
        </div>
        {data && (
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1">
            Zobacz na EDHREC <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {loading && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 flex items-center gap-3 text-sm text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" /> Pobieranie rekomendacji z EDHREC...
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
          <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
                <Repeat className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-100">Lepsze odpowiedniki</h3>
                <p className="text-xs text-stone-400">
                  Karty z talii, które gra mniej niż 10% graczy z tym dowódcą, i popularniejsze karty tego samego typu o podobnym koszcie.
                </p>
              </div>
            </div>
            {upgrades.length === 0 ? (
              <p className="text-sm text-stone-400">Nie znaleźliśmy oczywistych zamienników — karty w talii są popularne wśród graczy tego dowódcy.</p>
            ) : (
              <ul className="divide-y divide-stone-800">
                {upgrades.map(({ from, fromInclusion, to }) => (
                  <li key={from.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                      <button type="button" onClick={() => onViewCardDetails(from)} className="text-sm text-stone-300 hover:text-amber-300 truncate cursor-pointer text-left">
                        {from.name}
                      </button>
                      <span className="text-[11px] font-mono text-rose-300 shrink-0">{fromInclusion > 0 ? pct(fromInclusion) : 'rzadko'}</span>
                      <ArrowRight className="w-4 h-4 text-stone-500 shrink-0" />
                      <button type="button" onClick={() => to.card && onViewCardDetails(to.card)} className="text-sm font-semibold text-stone-100 hover:text-amber-300 truncate cursor-pointer text-left">
                        {to.name}
                      </button>
                      <span className="text-[11px] font-mono text-emerald-400 shrink-0">{pct(to.inclusion)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReplaceCard(from, to)}
                      className="h-9 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
                    >
                      <Repeat className="w-3.5 h-3.5" /> Zamień
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Popularne karty spoza talii */}
          <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-100">Najczęściej grane, których nie masz w talii</h3>
                  <p className="text-xs text-stone-400">Procent = ile talii z tym dowódcą gra kartę. Synergia = o ile częściej niż w innych taliach tych kolorów.</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer h-9">
                <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <Library className="w-3.5 h-3.5 text-amber-400" /> Tylko z mojej kolekcji
              </label>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 mb-2">
              {CATEGORY_TABS.map((t) => {
                const n = t === 'Wszystkie' ? missing.length : missing.filter((r) => categoryOf(r) === t).length;
                if (t !== 'Wszystkie' && n === 0) return null;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTab(t); setLimit(18); }}
                    className={`h-9 px-3 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                      tab === t ? 'bg-amber-500/15 border-amber-500/50 text-amber-200' : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {t} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">Brak kart w tej kategorii{ownedOnly ? ' w Twojej kolekcji' : ''}.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {visible.slice(0, limit).map((rec) => {
                  const img = rec.card ? getCardImageUri(rec.card, 'normal') : '';
                  const isOwned = owned.has(frontName(rec.name));
                  const blocked = addDisabledReason(rec);
                  return (
                    <div key={rec.name} className="bg-stone-950 border border-stone-800 rounded-xl overflow-hidden flex flex-col">
                      <button
                        type="button"
                        onClick={() => rec.card && onViewCardDetails(rec.card)}
                        className="relative aspect-[63/88] bg-stone-900 cursor-pointer"
                        title={rec.name}
                      >
                        {img ? (
                          <img src={img} alt={rec.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, img)} className="w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center p-2 text-xs text-stone-300 text-center">{rec.name}</span>
                        )}
                        {isOwned && (
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">W kolekcji</span>
                        )}
                      </button>
                      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
                        <p className="text-xs font-semibold text-stone-100 truncate" title={rec.name}>{rec.name}</p>
                        <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: pct(rec.inclusion) }} />
                        </div>
                        <p className="text-[11px] text-stone-400 flex justify-between gap-1">
                          <span><strong className="text-stone-200">{pct(rec.inclusion)}</strong> talii</span>
                          {rec.synergy !== 0 && (
                            <span className={rec.synergy > 0 ? 'text-emerald-400' : 'text-stone-500'}>
                              synergia {rec.synergy > 0 ? '+' : ''}{Math.round(rec.synergy * 100)}%
                            </span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => onAddCard(rec)}
                          disabled={Boolean(blocked)}
                          title={blocked || 'Dodaj do talii'}
                          className="mt-auto h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:bg-stone-800 disabled:text-stone-500 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" /> Dodaj
                        </button>
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
                Pokaż więcej ({visible.length - limit})
              </button>
            )}
            <p className="mt-3 text-[11px] text-stone-500">
              Dane: <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">EDHREC</a> (odświeżane raz na dobę).
            </p>
          </section>
        </>
      )}
    </div>
  );
};
