import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Globe, Loader2, RefreshCw, Search } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { ArtistCredit } from './ui/ArtistCredit';
import { ManaSymbol } from './ManaSymbol';
import { CommunityDeckSummary } from '../types';
import { publicDeckApi } from '../services/api';
import { DECK_FORMATS, getDeckFormat, type DeckFormat } from '../utils/mtgFormats';
import { useT, locale } from '../i18n';

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

// Lista z ostatniego pobrania: po powrocie z podglądu talii nie migamy pustym ekranem
let cachedDecks: CommunityDeckSummary[] | null = null;

interface CommunityDecksProps {
  /** Login zalogowanej osoby (jej talie dostają oznaczenie „Twoja”). */
  currentUsername?: string;
  onOpenDeck: (deckId: string) => void;
}

/** Zakładka „Talie społeczności”: talie, które ich autorzy udostępnili publicznym linkiem. */
export const CommunityDecks: React.FC<CommunityDecksProps> = ({ currentUsername, onOpenDeck }) => {
  const t = useT();
  const [decks, setDecks] = useState<CommunityDeckSummary[] | null>(cachedDecks);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [formatTab, setFormatTab] = useState<string>('all');

  const load = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    publicDeckApi
      .list()
      .then((list) => {
        cachedDecks = list;
        setDecks(list);
      })
      .catch((err) => setError(err?.message || t('Nie udało się pobrać talii społeczności.')))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const all = decks || [];

  const formatTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of all) {
      const id = getDeckFormat(d.format).id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return DECK_FORMATS.filter((f) => counts.has(f.id)).map((f) => ({ format: f, count: counts.get(f.id)! }));
  }, [all]);

  useEffect(() => {
    if (formatTab !== 'all' && !formatTabs.some((ft) => ft.format.id === formatTab)) setFormatTab('all');
  }, [formatTab, formatTabs]);

  const visibleDecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => {
      if (formatTab !== 'all' && getDeckFormat(d.format).id !== formatTab) return false;
      if (!q) return true;
      return [d.name, d.commanderName || '', d.owner, d.description].some((s) => s.toLowerCase().includes(q));
    });
  }, [all, query, formatTab]);

  const tabLabel = (f: DeckFormat) => (f.id === 'commander' ? 'Commander' : f.platform === 'arena' ? `${f.name} (MTGA)` : f.name);
  const me = (currentUsername || '').toLowerCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Talie społeczności')}
        description={t('Talie, które inni gracze udostępnili publicznym linkiem. Swoją talię dodasz tutaj przyciskiem „Udostępnij” w edytorze talii.')}
        actions={
          <button type="button" onClick={load} disabled={isLoading} className="btn btn-secondary" title={t('Odśwież listę')}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('Odśwież')}
          </button>
        }
      />

      {decks === null && isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('Ładowanie talii...')}
        </div>
      ) : error && decks === null ? (
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6 text-center space-y-3">
          <p className="text-sm text-rose-300">{error}</p>
          <button type="button" onClick={load} className="btn btn-secondary">
            <RefreshCw className="w-4 h-4" />
            {t('Spróbuj ponownie')}
          </button>
        </div>
      ) : all.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-950/50 border border-amber-800/40 text-amber-400 mx-auto flex items-center justify-center">
            <Globe className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t('Nikt jeszcze nie udostępnił talii')}</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto mt-1">
              {t('Otwórz swoją talię i kliknij „Udostępnij”, aby pojawiła się tutaj jako pierwsza.')}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1 min-w-0 md:max-w-sm">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Szukaj po nazwie, dowódcy lub autorze')}
                aria-label={t('Szukaj talii')}
                className="w-full h-9 bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-stone-600"
              />
            </label>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label={t('Talie według formatu')}>
              {[{ id: 'all', label: t('Wszystkie'), count: all.length }, ...formatTabs.map((ft) => ({ id: ft.format.id, label: tabLabel(ft.format), count: ft.count }))].map((ft) => {
                const active = formatTab === ft.id;
                return (
                  <button
                    key={ft.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFormatTab(ft.id)}
                    className={`shrink-0 h-9 px-3.5 rounded-lg text-sm flex items-center gap-2 cursor-pointer border ${
                      active
                        ? 'bg-stone-800 border-stone-700 text-stone-50 font-medium'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                    }`}
                  >
                    {ft.label}
                    <span className={`text-xs tabular-nums ${active ? 'text-amber-300' : 'text-stone-500'}`}>{ft.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {visibleDecks.length === 0 ? (
            <p className="text-sm text-stone-400 py-10 text-center">{t('Żadna talia nie pasuje do wyszukiwania.')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {visibleDecks.map((deck) => {
                const fmt = getDeckFormat(deck.format);
                const count = deck.cardCount + (deck.commanderName && fmt.commander ? 1 : 0);
                const sizeOk = fmt.exactSize ? count === fmt.deckSize : count >= fmt.deckSize;
                const colors = WUBRG.filter((c) => deck.colors.includes(c));
                const isMine = Boolean(me) && deck.owner.toLowerCase() === me;
                return (
                  <article key={deck.id} className="group bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-xl overflow-hidden flex flex-col">
                    <button type="button" onClick={() => onOpenDeck(deck.id)} className="text-left flex-1 flex flex-col cursor-pointer" aria-label={t('Otwórz talię „{name}”', { name: deck.name })}>
                      <div className="relative h-28 w-full bg-stone-800 overflow-hidden">
                        {deck.art ? (
                          <>
                            <img src={deck.art} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover object-[center_30%] group-hover:scale-[1.03] transition-transform duration-500" />
                            <ArtistCredit artist={deck.artist || undefined} variant="overlay" />
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-600">
                            <Crown className="w-6 h-6" />
                          </div>
                        )}
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-950/80 text-amber-300">
                          {fmt.label.replace(/^EDH /, '')}
                        </span>
                        {isMine && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-950/80 text-stone-200">
                            {t('Twoja')}
                          </span>
                        )}
                      </div>

                      <div className="p-4 flex-1 flex flex-col gap-3 w-full">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-stone-50 truncate">{deck.name}</h3>
                          <p className="text-sm text-stone-400 truncate">
                            {fmt.commander ? (deck.commanderName || t('Bez dowódcy')) : t(fmt.description)}
                          </p>
                          {deck.description && <p className="mt-1.5 text-sm text-stone-500 line-clamp-2">{deck.description}</p>}
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-2 text-sm">
                          <span className="text-stone-400 truncate min-w-0">
                            {t('Autor:')} <span className="text-amber-300">@{deck.owner}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {colors.length > 0 && <ManaSymbol cost={colors.map((c) => `{${c}}`).join('')} size="sm" />}
                            <span
                              className={`tabular-nums ${sizeOk ? 'text-emerald-400' : 'text-stone-300'}`}
                              title={fmt.exactSize ? t('{n} z {total}', { n: count, total: fmt.deckSize }) : t('{n} kart, minimum {total}', { n: count, total: fmt.deckSize })}
                            >
                              {count}/{fmt.deckSize}
                            </span>
                          </span>
                        </div>
                        {deck.updatedAt && (
                          <p className="text-[11px] text-stone-500 tabular-nums">
                            {t('Zaktualizowano {date}', { date: new Date(deck.updatedAt).toLocaleDateString(locale()) })}
                          </p>
                        )}
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
