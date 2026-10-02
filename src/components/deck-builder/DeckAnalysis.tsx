import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shuffle, Plus, Hand, Percent, Droplets, Lightbulb, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError } from '../../utils/formatters';
import { ManaSymbol } from '../ManaSymbol';
import {
  analyzeMana, buildLibrary, categoryOdds, COLOR_NAMES, hyperAtLeast, isLand, shuffle, TARGET_PROBABILITY,
  type Color, type LibraryCard
} from './deckAnalysis';

interface DeckAnalysisProps {
  deck: DeckItem;
  onViewCardDetails: (card: ScryfallCard) => void;
}

const pct = (v: number) => {
  const p = v * 100;
  if (p > 0 && p < 0.1) return '<0,1%';
  if (p > 99.9 && p < 100) return '>99,9%';
  return `${p.toFixed(p < 10 ? 1 : 0).replace('.', ',')}%`;
};

const COLOR_DOT: Record<Color, string> = {
  W: 'bg-amber-100 text-stone-900',
  U: 'bg-blue-500 text-white',
  B: 'bg-stone-700 text-stone-100',
  R: 'bg-red-500 text-white',
  G: 'bg-emerald-500 text-white'
};
const COLOR_BAR: Record<Color, string> = {
  W: 'bg-amber-100',
  U: 'bg-blue-500',
  B: 'bg-stone-500',
  R: 'bg-red-500',
  G: 'bg-emerald-500'
};

const Panel: React.FC<{ title: string; subtitle: string; icon: React.ElementType; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title, subtitle, icon: Icon, actions, children
}) => (
  <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5 shadow-lg">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-stone-100">{title}</h3>
          <p className="text-xs text-stone-400">{subtitle}</p>
        </div>
      </div>
      {actions}
    </div>
    {children}
  </section>
);

/** Statystyki talii: losowa ręka, szanse na typy kart w ręce i wymagania kolorystyczne many. */
export const DeckAnalysis: React.FC<DeckAnalysisProps> = ({ deck, onViewCardDetails }) => {
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
  const landOdds = odds.find((o) => o.id === 'Lądy');
  const goodLandHand = useMemo(() => {
    if (!landOdds) return 0;
    const N = library.length;
    return hyperAtLeast(N, landOdds.count, Math.min(7, N), 2) - hyperAtLeast(N, landOdds.count, Math.min(7, N), 5);
  }, [landOdds, library.length]);

  /* --- kolory --- */
  const mana = useMemo(() => analyzeMana(deck, library), [deck, library]);

  if (library.length < 7) {
    return (
      <Panel title="Statystyki talii" subtitle="Losowa ręka, szanse i rozkład kolorów" icon={Percent}>
        <p className="text-sm text-stone-400">Dodaj co najmniej 7 kart do talii, aby zobaczyć statystyki.</p>
      </Panel>
    );
  }

  const turn = drawn - 6;

  return (
    <div className="space-y-4" aria-label="Statystyki talii">
      <h2 className="text-lg font-black text-stone-100 px-1">Statystyki talii</h2>

      {/* 1. Przykładowa ręka */}
      <Panel
        title="Przykładowa ręka startowa"
        subtitle={`Losowe 7 kart z ${library.length} w bibliotece${deck.commander ? ' (dowódca jest w strefie dowodzenia)' : ''}`}
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
              Dobierz kartę
            </button>
            <button
              type="button"
              onClick={newHand}
              className="h-10 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              Nowa ręka
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400 mb-3">
          <span>Ręka nr <strong className="text-stone-200">{handNo}</strong></span>
          <span>Lądy w ręce: <strong className={handLands >= 2 && handLands <= 4 ? 'text-emerald-400' : 'text-amber-300'}>{handLands}</strong> / {hand.length}</span>
          {turn > 1 && <span>Dobrano do tury <strong className="text-stone-200">{turn}</strong> (gra na wyjściu)</span>}
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
                className={`relative aspect-[63/88] rounded-lg overflow-hidden bg-stone-950 border cursor-pointer hover:-translate-y-1 transition-transform ${
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
                    className="w-full h-full object-cover"
                  />
                ) : null}
                <span className="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] text-stone-100 px-1 py-0.5 truncate">{l.card.name}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* 2. Prawdopodobieństwa */}
      <Panel title="Szanse w ręce startowej (7 kart)" subtitle="Prawdopodobieństwo wylosowania danej liczby kart każdego typu" icon={Percent}>
        {landOdds && (
          <p className="mb-3 text-sm text-stone-300">
            Szansa na grywalną liczbę lądów (2–4) w ręce startowej:{' '}
            <strong className={goodLandHand >= 0.7 ? 'text-emerald-400' : goodLandHand >= 0.55 ? 'text-amber-300' : 'text-rose-300'}>{pct(goodLandHand)}</strong>
          </p>
        )}
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px] text-sm [&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-stone-500 text-right">
                <th className="text-left font-bold py-2 pl-4 sm:pl-0">Typ</th>
                <th className="font-bold py-2">W talii</th>
                <th className="font-bold py-2">Średnio</th>
                {['0', '1', '2', '3', '4+'].map((h) => (
                  <th key={h} className="font-bold py-2">{h} szt.</th>
                ))}
                <th className="font-bold py-2 pr-4 sm:pr-0">Min. 1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {odds.map((o) => {
                const max = Math.max(...o.exact);
                return (
                  <tr key={o.id} className="text-right text-stone-300">
                    <td className="text-left py-2 pl-4 sm:pl-0 font-semibold text-stone-100">{o.label}</td>
                    <td className="py-2 font-mono">{o.count}</td>
                    <td className="py-2 font-mono">{o.expected.toFixed(1).replace('.', ',')}</td>
                    {o.exact.map((p, i) => (
                      <td key={i} className={`py-2 font-mono ${p === max ? 'text-amber-300 font-bold' : ''}`}>{pct(p)}</td>
                    ))}
                    <td className="py-2 pr-4 sm:pr-0 font-mono text-emerald-400">{pct(o.atLeastOne)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 3. Kolory many */}
      <Panel
        title="Rozkład i wymagania kolorów"
        subtitle={`${mana.lands} lądów w ${mana.deckSize} kartach · średni koszt czarów ${mana.avgManaValue.toFixed(2).replace('.', ',')}${
          mana.recommendedLands !== null ? ` · zalecane ok. ${mana.recommendedLands} lądów` : ''
        }`}
        icon={Droplets}
      >
        {mana.colors.length === 0 ? (
          <p className="text-sm text-stone-400">Talia jest bezbarwna — brak wymagań kolorystycznych.</p>
        ) : (
          <div className="space-y-4">
            {/* Udział kolorów: koszty vs źródła */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: 'Kolory w kosztach kart', key: 'pipShare' as const },
                { label: 'Kolory produkowane przez lądy', key: 'sourceShare' as const }
              ].map((row) => (
                <div key={row.key}>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">{row.label}</p>
                  <div className="flex h-4 rounded-full overflow-hidden bg-stone-800">
                    {mana.colors.map((c) =>
                      c[row.key] > 0 ? (
                        <div key={c.color} className={COLOR_BAR[c.color]} style={{ width: `${c[row.key] * 100}%` }} title={`${COLOR_NAMES[c.color]}: ${pct(c[row.key])}`} />
                      ) : null
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-stone-400">
                    {mana.colors.map((c) => (
                      <span key={c.color}>
                        {COLOR_NAMES[c.color]} <strong className="text-stone-200">{pct(c[row.key])}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela wymagań */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {mana.colors.map((c) => {
                const ok = c.landSources >= c.needed;
                return (
                  <div key={c.color} className={`rounded-xl border p-3 bg-stone-950 ${ok ? 'border-stone-800' : 'border-rose-500/40'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-bold text-stone-100">
                        <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${COLOR_DOT[c.color]}`}>{c.color}</span>
                        {COLOR_NAMES[c.color]}
                      </span>
                      {ok ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" aria-label="Wystarczająco źródeł" />
                      ) : (
                        <AlertTriangle className="w-4.5 h-4.5 text-rose-400" aria-label="Za mało źródeł" />
                      )}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-stone-500">Źródła (lądy)</dt>
                      <dd className={`text-right font-mono font-bold ${ok ? 'text-stone-100' : 'text-rose-300'}`}>{c.landSources}</dd>
                      <dt className="text-stone-500">Potrzebne</dt>
                      <dd className="text-right font-mono font-bold text-stone-100">{c.hardestCard ? c.needed : '—'}</dd>
                      {c.otherSources > 0 && (
                        <>
                          <dt className="text-stone-500">Inne źródła</dt>
                          <dd className="text-right font-mono text-stone-300" title="Artefakty i stwory dające manę (nie liczone do wymagań)">+{c.otherSources}</dd>
                        </>
                      )}
                      {c.hardestCard && (
                        <>
                          <dt className="text-stone-500">Szansa na czas</dt>
                          <dd className={`text-right font-mono font-bold ${c.probability >= TARGET_PROBABILITY ? 'text-emerald-400' : 'text-amber-300'}`}>{pct(c.probability)}</dd>
                        </>
                      )}
                    </dl>
                    {c.hardestCard && (
                      <p className="mt-2 text-[11px] text-stone-400 flex items-center gap-1 flex-wrap">
                        Najtrudniejsza:
                        <button type="button" onClick={() => onViewCardDetails(c.hardestCard!)} className="text-stone-200 hover:text-amber-300 font-semibold cursor-pointer truncate max-w-[10rem]">
                          {c.hardestCard.name}
                        </button>
                        <ManaSymbol cost={c.hardestCard.mana_cost || c.hardestCard.card_faces?.[0]?.mana_cost} size="sm" />
                        <span>w {c.hardestTurn}. turze</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sugestie */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4" />
                Sugestie
              </p>
              <ul className="space-y-1.5 text-sm text-stone-200 list-disc pl-5">
                {mana.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-stone-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              „Potrzebne” to liczba lądów danego koloru, przy której kartę wymagającą najwięcej symboli tego koloru zagrasz w turze równej jej
              kosztowi z szansą ok. 90% (gra na wyjściu, przy trafianiu lądu co turę) — metoda Franka Karstena. Hybrydy i koszty phyrexian
              liczą się do rozkładu po 0,5 i nie są wymaganiem.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
};
