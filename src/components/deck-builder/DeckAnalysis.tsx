import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shuffle, Plus, Hand, Percent, Droplets, Lightbulb, CheckCircle2, Info, Mountain } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError, getCardArtist } from '../../utils/formatters';
import { ArtistCredit } from '../ui/ArtistCredit';
import { ManaSymbol } from '../ManaSymbol';
import {
  analyzeMana, buildLibrary, categoryOdds, COLOR_NAMES, hyperAtLeast, isLand, shuffle, TARGET_PROBABILITY,
  type Color, type LibraryCard
} from './deckAnalysis';
import { useT, fixed, useLang } from '../../i18n';

interface DeckAnalysisProps {
  deck: DeckItem;
  onViewCardDetails: (card: ScryfallCard) => void;
}

const pct = (v: number) => {
  const p = v * 100;
  if (p > 0 && p < 0.1) return `<${fixed(0.1, 1)}%`;
  if (p > 99.9 && p < 100) return `>${fixed(99.9, 1)}%`;
  return `${fixed(p, p < 10 ? 1 : 0)}%`;
};

const COLOR_DOT: Record<Color, string> = {
  W: 'bg-amber-100 text-stone-900',
  U: 'bg-blue-500 text-white',
  B: 'bg-stone-700 text-stone-100',
  R: 'bg-red-500 text-white',
  G: 'bg-emerald-500 text-white'
};
const COLOR_BAR: Record<Color, string> = {
  W: 'bg-[#f4ecd2]',
  U: 'bg-blue-500',
  // czarny jak w symbolu many; jasna obwódka, żeby był widoczny na ciemnym tle
  B: 'bg-[#0b0908] ring-1 ring-inset ring-stone-500',
  R: 'bg-red-500',
  G: 'bg-emerald-500'
};

const Panel: React.FC<{ title: string; subtitle: string; icon: React.ElementType; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title, subtitle, icon: Icon, actions, children
}) => (
  <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-stone-50 flex items-center gap-2">
          <Icon className="w-4 h-4 text-stone-400" />
          {title}
        </h3>
        <p className="text-sm text-stone-400 mt-0.5">{subtitle}</p>
      </div>
      {actions}
    </div>
    {children}
  </section>
);

/** Statystyki talii: losowa ręka, szanse na typy kart w ręce i wymagania kolorystyczne many. */
export const DeckAnalysis: React.FC<DeckAnalysisProps> = ({ deck, onViewCardDetails }) => {
  const t = useT();
  const library = useMemo(() => buildLibrary(deck), [deck]);
  const libraryKey = useMemo(() => library.map((l) => l.card.id).join(','), [library]);

  /* --- przykładowa ręka --- */
  const [order, setOrder] = useState<LibraryCard[]>([]);
  const [drawn, setDrawn] = useState(7);
  const [handNo, setHandNo] = useState(1);
  const newHand = useCallback(() => {
    setOrder(shuffle(library));
    setDrawn(7);
    setHandNo((n) => n + 1);
  }, [library]);
  // Nowa ręka przy zmianie zawartości talii
  useEffect(() => {
    setOrder(shuffle(library));
    setDrawn(7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryKey]);
  const hand = order.slice(0, Math.min(drawn, order.length));
  const handLands = hand.filter((l) => isLand(l.card)).length;

  /* --- prawdopodobieństwa --- */
  const odds = useMemo(() => categoryOdds(library, 7), [library]);
  const landOdds = odds.find((o) => o.id === 'Lands');
  const goodLandHand = useMemo(() => {
    if (!landOdds) return 0;
    const N = library.length;
    return hyperAtLeast(N, landOdds.count, Math.min(7, N), 2) - hyperAtLeast(N, landOdds.count, Math.min(7, N), 5);
  }, [landOdds, library.length]);

  /* --- kolory --- */
  const lang = useLang();
  const mana = useMemo(() => analyzeMana(deck, library), [deck, library, lang]);

  if (library.length < 7) {
    return (
      <Panel title={t('Statystyki talii')} subtitle={t('Losowa ręka, szanse i rozkład kolorów')} icon={Percent}>
        <p className="text-sm text-stone-400">{t('Dodaj co najmniej 7 kart do talii, aby zobaczyć statystyki.')}</p>
      </Panel>
    );
  }

  const turn = drawn - 6;

  return (
    <div className="space-y-4" aria-label={t('Statystyki talii')}>
      <h2 className="text-lg font-bold text-stone-100 px-1">{t('Statystyki talii')}</h2>

      {/* 1. Przykładowa ręka */}
      <Panel
        title={t('Przykładowa ręka startowa')}
        subtitle={deck.commander ? t('Losowe 7 kart z {n} w bibliotece (dowódca jest w strefie dowodzenia)', { n: library.length }) : t('Losowe 7 kart z {n} w bibliotece', { n: library.length })}
        icon={Hand}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDrawn((d) => Math.min(d + 1, order.length))}
              disabled={drawn >= order.length}
              className="h-10 px-3.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              {t('Dobierz kartę')}
            </button>
            <button
              type="button"
              onClick={newHand}
              className="h-10 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              {t('Nowa ręka')}
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400 mb-3">
          <span>{t('Ręka nr')} <strong className="text-stone-200">{handNo}</strong></span>
          <span>{t('Lands w ręce:')} <strong className={handLands >= 2 && handLands <= 4 ? 'text-emerald-400' : 'text-amber-300'}>{handLands}</strong> / {hand.length}</span>
          {turn > 1 && <span>{t('Dobrano do tury')} <strong className="text-stone-200">{turn}</strong> {t('(gra na wyjściu)')}</span>}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="list">
          {hand.map((l, i) => {
            const img = getCardImageUri(l.card, 'normal');
            return (
              <button
                key={`${handNo}-${l.key}`}
                type="button"
                role="listitem"
                onClick={() => onViewCardDetails(l.card)}
                title={l.card.name}
                className={`relative aspect-[488/680] rounded-lg overflow-hidden bg-stone-950 border cursor-pointer hover:-translate-y-1 transition-transform ${
                  i >= 7 ? 'border-amber-500/60' : 'border-stone-800'
                }`}
              >
                {img ? (
                  <img
                    src={img}
                    alt={l.card.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, img)}
                    className="w-full h-full object-contain"
                  />
                ) : null}
                <span className="absolute inset-x-0 top-0 bg-black/75 text-[11px] text-stone-100 px-1 py-0.5 truncate">{l.card.name}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* 2. Prawdopodobieństwa */}
      <Panel title={t('Szanse w ręce startowej (7 kart)')} subtitle={t('Prawdopodobieństwo wylosowania danej liczby kart każdego typu')} icon={Percent}>
        {landOdds && (
          <p className="mb-3 text-sm text-stone-300">
            {t('Szansa na grywalną liczbę Lands (2–4) w ręce startowej:')}{' '}
            <strong className={goodLandHand >= 0.7 ? 'text-emerald-400' : goodLandHand >= 0.55 ? 'text-amber-300' : 'text-rose-300'}>{pct(goodLandHand)}</strong>
          </p>
        )}
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px] text-sm [&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-[11px] text-stone-500 text-right">
                <th className="text-left font-bold py-2 pl-4 sm:pl-0">{t('Typ')}</th>
                <th className="font-bold py-2">{t('W talii')}</th>
                <th className="font-bold py-2">{t('Średnio')}</th>
                {['0', '1', '2', '3', '4+'].map((h) => (
                  <th key={h} className="font-bold py-2">{h} {t('szt.')}</th>
                ))}
                <th className="font-bold py-2 pr-4 sm:pr-0">{t('Min. 1')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {odds.map((o) => {
                const max = Math.max(...o.exact);
                return (
                  <tr key={o.id} className="text-right text-stone-300">
                    <td className="text-left py-2 pl-4 sm:pl-0 font-semibold text-stone-100">{o.label}</td>
                    <td className="py-2 tabular-nums">{o.count}</td>
                    <td className="py-2 tabular-nums">{fixed(o.expected, 1)}</td>
                    {o.exact.map((p, i) => (
                      <td key={i} className={`py-2 tabular-nums ${p === max ? 'text-amber-300 font-bold' : ''}`}>{pct(p)}</td>
                    ))}
                    <td className="py-2 pr-4 sm:pr-0 tabular-nums text-emerald-400">{pct(o.atLeastOne)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 3. Kolory many */}
      <Panel
        title={t('Kolory many')}
        subtitle={
          t('{lands} Lands na {deckSize} kart, średni koszt pozostałych {avg}', { lands: mana.lands, deckSize: mana.deckSize, avg: fixed(mana.avgManaValue, 2) }) +
          (mana.recommendedLands !== null ? t(', zalecane ok. {n} Lands', { n: mana.recommendedLands }) : '')
        }
        icon={Droplets}
      >
        {mana.colors.length === 0 ? (
          <p className="text-sm text-stone-400">{t('Talia jest bezbarwna, więc nie ma wymagań kolorystycznych.')}</p>
        ) : (
          <div className="space-y-6">
            {/* Udział kolorów: koszty kart nad źródłami z Lands */}
            <div className="space-y-2.5">
              {[
                { label: t('Koszty kart'), hint: t('Udział symboli many w kosztach kart'), key: 'pipShare' as const },
                { label: t('Lands dają'), hint: t('Udział kolorów, które produkują Lands'), key: 'sourceShare' as const }
              ].map((row) => (
                <div key={row.key} className="grid grid-cols-[5.5rem_1fr] sm:grid-cols-[6.5rem_1fr] items-center gap-3">
                  <span className="text-sm text-stone-400" title={row.hint}>{row.label}</span>
                  <div className="flex h-3 gap-0.5" role="img" aria-label={`${row.label}: ${mana.colors.map((c) => `${t(COLOR_NAMES[c.color])} ${pct(c[row.key])}`).join(', ')}`}>
                    {mana.colors.map((c) =>
                      c[row.key] > 0 ? (
                        <div
                          key={c.color}
                          className={`h-full first:rounded-l-full last:rounded-r-full ${COLOR_BAR[c.color]}`}
                          style={{ width: `${c[row.key] * 100}%` }}
                          title={`${t(COLOR_NAMES[c.color])}: ${pct(c[row.key])}`}
                        />
                      ) : null
                    )}
                  </div>
                </div>
              ))}
              <div className="sm:grid sm:grid-cols-[6.5rem_1fr] gap-3">
                <span className="hidden sm:block" />
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {mana.colors.map((c) => (
                    <li key={c.color} className="flex items-center gap-1.5 text-stone-400">
                      <span className={`w-2.5 h-2.5 rounded-full ${COLOR_BAR[c.color]}`} aria-hidden="true" />
                      {t(COLOR_NAMES[c.color])}:
                      <span className="text-stone-200 tabular-nums">{pct(c.pipShare)}</span> {t('kosztów,')}
                      <span className="text-stone-200 tabular-nums">{pct(c.sourceShare)}</span> {t('z Lands')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Wymagania każdego koloru */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {mana.colors.map((c) => {
                const ok = c.landSources >= c.needed;
                const scale = Math.max(c.needed, c.landSources, 1);
                const art = c.hardestCard ? getCardImageUri(c.hardestCard, 'art_crop') : '';
                return (
                  <div key={c.color} className="rounded-xl bg-stone-950/60 ring-1 ring-stone-800 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-stone-100">
                        <ManaSymbol cost={`{${c.color}}`} size="md" />
                        {t(COLOR_NAMES[c.color])}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {ok ? t('Wystarczy') : t('Brakuje {v1}', { v1: c.needed - c.landSources })}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm text-stone-400">
                        <span className="text-2xl font-semibold text-stone-50 tabular-nums">{c.landSources}</span>
                        {c.hardestCard ? (
                          <> / {c.needed} {t('źródeł z Lands')}</>
                        ) : (
                          <> {t('źródeł z Lands')}</>
                        )}
                        {c.otherSources > 0 && (
                          <span className="ml-1.5 text-stone-500" title={t('Artifacts i Creatures dające manę (nie liczone do wymagań)')}>
                            +{c.otherSources} {t('inne')}
                          </span>
                        )}
                      </p>
                      {c.hardestCard && (
                        <div className="relative mt-2 h-1.5 rounded-full bg-stone-800" aria-hidden="true">
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            style={{ width: `${Math.min(100, (c.landSources / scale) * 100)}%` }}
                          />
                          <div className="absolute -top-1 -bottom-1 w-0.5 bg-stone-300" style={{ left: `calc(${(c.needed / scale) * 100}% - 1px)` }} />
                        </div>
                      )}
                    </div>

                    {c.hardestCard && (
                      <button
                        type="button"
                        onClick={() => onViewCardDetails(c.hardestCard!)}
                        className="w-full flex items-center gap-3 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-stone-900 cursor-pointer"
                      >
                        <span className="w-12 h-9 rounded-md overflow-hidden bg-stone-800 shrink-0">
                          {art && <img src={art} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm text-stone-100 truncate">{c.hardestCard.name}</span>
                            <ManaSymbol cost={c.hardestCard.mana_cost || c.hardestCard.card_faces?.[0]?.mana_cost} size="sm" />
                          </span>
                          <span className="block text-xs text-stone-400">
                            {t('Najbardziej wymagająca: tura {turn}, szansa', { turn: c.hardestTurn })}{' '}
                            <span className={c.probability >= TARGET_PROBABILITY ? 'text-emerald-400' : 'text-amber-300'}>{pct(c.probability)}</span>
                          </span>
                          <ArtistCredit artist={getCardArtist(c.hardestCard)} />
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sugestie */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-stone-200 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                {t('Sugestie')}
              </h4>
              <ul className="divide-y divide-stone-800 rounded-xl ring-1 ring-stone-800 overflow-hidden">
                {mana.suggestions.map((sug, i) => {
                  const img = sug.card ? getCardImageUri(sug.card, 'normal') : '';
                  return (
                    <li key={i} className="flex items-start gap-3.5 p-3.5 bg-stone-950/40">
                      {sug.card ? (
                        <button
                          type="button"
                          onClick={() => onViewCardDetails(sug.card!)}
                          className="w-14 shrink-0 aspect-[488/680] rounded-md overflow-hidden bg-stone-800 ring-1 ring-stone-700 hover:ring-amber-400 cursor-pointer"
                          title={t('Szczegóły: {name}', { name: sug.card.name })}
                        >
                          {img && (
                            <img src={img} alt={sug.card.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, img)} className="w-full h-full object-contain" />
                          )}
                        </button>
                      ) : (
                        <span
                          className={`w-14 shrink-0 aspect-[488/680] rounded-md flex items-center justify-center ${
                            sug.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-800 text-stone-300'
                          }`}
                          aria-hidden="true"
                        >
                          {sug.kind === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <Mountain className="w-5 h-5" />}
                        </span>
                      )}
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-medium text-stone-100">
                          {sug.color && (
                            <span className="inline-block align-[-3px] mr-1.5">
                              <ManaSymbol cost={`{${sug.color}}`} size="sm" />
                            </span>
                          )}
                          {sug.title}
                        </p>
                        {sug.card && <p className="text-sm text-stone-300 mt-0.5">{sug.card.name}</p>}
                        <p className="text-sm text-stone-400 mt-0.5">{sug.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="text-xs text-stone-500 flex items-start gap-1.5 max-w-[90ch]">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t('Liczba potrzebnych źródeł to tyle Lands danego koloru, by najbardziej wymagającą kartę zagrać w turze równej jej kosztowi z szansą ok. 90% (gra na wyjściu, Land co turę), według metody Franka Karstena. Hybrydy i koszty phyrexian liczą się do rozkładu po 0,5.')}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
};
