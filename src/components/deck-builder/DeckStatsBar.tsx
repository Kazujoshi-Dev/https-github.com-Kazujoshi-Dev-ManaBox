import React, { useEffect, useState } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { DeckStatsBarProps, BasicLandCount } from './types';
import { ManaSymbol } from '../ManaSymbol';

/** Licznik jednego Basic Land: −, pole z liczbą (można wpisać), +. */
const BasicStepper: React.FC<{
  basic: BasicLandCount;
  busy: boolean;
  onSet: (name: string, count: number) => void | Promise<void>;
}> = ({ basic, busy, onSet }) => {
  const [draft, setDraft] = useState(String(basic.count));
  useEffect(() => setDraft(String(basic.count)), [basic.count]);

  const commit = () => {
    const n = Math.max(0, Math.min(99, Math.floor(Number(draft.replace(/\D/g, '')) || 0)));
    if (n !== basic.count) onSet(basic.name, n);
    else setDraft(String(basic.count));
  };
  const btn =
    'w-8 h-8 rounded-md flex items-center justify-center text-stone-300 hover:bg-stone-800 hover:text-stone-50 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer';

  return (
    <div className="flex items-center gap-2.5">
      <ManaSymbol cost={`{${basic.color}}`} size="md" />
      <span className="text-sm text-stone-200 w-[4.75rem] truncate">{basic.name}</span>
      <div className="flex items-center rounded-lg ring-1 ring-stone-700 bg-stone-950">
        <button type="button" onClick={() => onSet(basic.name, basic.count - 1)} disabled={busy || basic.count <= 0} className={btn} aria-label={`Usuń jeden ${basic.name}`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={`Liczba ${basic.name} w talii`}
          className="w-9 h-8 bg-transparent text-center text-sm text-stone-50 tabular-nums focus:outline-none"
        />
        <button type="button" onClick={() => onSet(basic.name, basic.count + 1)} disabled={busy} className={btn} aria-label={`Dodaj jeden ${basic.name}`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

export const DeckStatsBar: React.FC<DeckStatsBarProps> = ({ manaCurve, colorIdentity, basics, onSetBasicCount, basicsBusy = null }) => {
  const maxVal = Math.max(...manaCurve, 1);
  const total = manaCurve.reduce((s, n) => s + n, 0);
  const showBasics = Boolean(basics && basics.length && onSetBasicCount);

  return (
    <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-10">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6">
        {/* Krzywa many */}
        <div>
          <h3 className="text-sm font-medium text-stone-200">
            Krzywa many <span className="text-stone-500 font-normal">({total} kart bez Lands)</span>
          </h3>
          <div className="mt-3 flex items-end gap-2 h-24" role="img" aria-label={`Krzywa many: ${manaCurve.map((n, i) => `${i === 6 ? '6+' : i}: ${n}`).join(', ')}`}>
            {manaCurve.map((count, cmc) => (
              <div key={cmc} className="flex-1 min-w-6 max-w-12 h-full flex flex-col items-center justify-end gap-1">
                <span className="text-xs text-stone-300 tabular-nums h-4 leading-4">{count || ''}</span>
                <div className="flex-1 w-full flex items-end">
                  <div
                    className={`w-full rounded-t-md ${count ? 'bg-amber-400' : 'bg-stone-800'}`}
                    style={{ height: count ? `${Math.max(6, (count / maxVal) * 100)}%` : '3px' }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 border-t border-stone-800 pt-1.5">
            {manaCurve.map((_, cmc) => (
              <span key={cmc} className="flex-1 min-w-6 max-w-12 text-center text-xs text-stone-500 tabular-nums">
                {cmc === 6 ? '6+' : cmc}
              </span>
            ))}
          </div>
        </div>

        {/* Tożsamość kolorów */}
        {colorIdentity.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-stone-200">Tożsamość kolorów</h3>
            <div className="mt-3">
              <ManaSymbol cost={colorIdentity.map((c) => `{${c}}`).join('')} size="lg" />
            </div>
          </div>
        )}
      </div>

      {/* Basic Lands w kolorach dowódcy */}
      {showBasics && (
        <div className="lg:border-l lg:border-stone-800 lg:pl-10">
          <h3 className="text-sm font-medium text-stone-200">Basic Lands</h3>
          <p className="text-xs text-stone-500 mb-3">W kolorach dowódcy. Wpisz liczbę albo użyj + i −.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {basics!.map((b) => (
              <BasicStepper key={b.name} basic={b} busy={basicsBusy === b.name} onSet={onSetBasicCount!} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
