import React, { useEffect, useState } from 'react';
import { ArrowLeft, Layers } from 'lucide-react';
import type { SetOption } from './useCollectionFilters';
import { useT, plural } from '../../i18n';

/** Ikony dodatków (symbole z Scryfall), pobierane raz na sesję. */
let setIconsMemo: Record<string, string> | null = null;
let setIconsRequest: Promise<Record<string, string>> | null = null;

function loadSetIcons(): Promise<Record<string, string>> {
  if (setIconsMemo) return Promise.resolve(setIconsMemo);
  if (!setIconsRequest) {
    setIconsRequest = fetch('/api/scryfall/sets')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        const icons: Record<string, string> = {};
        (Array.isArray(d?.data) ? d.data : []).forEach((s: any) => {
          if (s?.code && s?.icon_svg_uri) icons[String(s.code).toLowerCase()] = s.icon_svg_uri;
        });
        if (Object.keys(icons).length) setIconsMemo = icons;
        else setIconsRequest = null;
        return icons;
      })
      .catch(() => {
        setIconsRequest = null;
        return {};
      });
  }
  return setIconsRequest;
}

export function useSetIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>(() => setIconsMemo || {});
  useEffect(() => {
    if (setIconsMemo) return;
    let cancelled = false;
    loadSetIcons().then((i) => {
      if (!cancelled) setIcons(i);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return icons;
}

/** Procent skompletowania zaokrąglony w dół, żeby niekompletny dodatek nie pokazywał 100%. */
function completion(set: SetOption): { pct: number | null; label: string } {
  if (!set.total) return { pct: null, label: '' };
  const pct = (set.owned / set.total) * 100;
  return { pct, label: pct > 0 && pct < 1 ? '<1%' : `${Math.floor(pct)}%` };
}

function cardsWord(n: number): string {
  return plural(n, ['karta', 'karty', 'kart'], ['card', 'cards']);
}

export const SetSymbol: React.FC<{ code: string; icons: Record<string, string>; className?: string }> = ({ code, icons, className = '' }) => {
  const lower = code.toLowerCase();
  const [failed, setFailed] = useState(false);
  // Gdy lista dodatków jeszcze się wczytuje lub nie zna kodu, próbujemy bezpośredniego adresu symbolu
  const src = icons[lower] || `https://svgs.scryfall.io/sets/${encodeURIComponent(lower)}.svg`;
  if (failed) return <Layers className={`text-stone-500 ${className}`} aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-contain invert opacity-90 ${className}`}
    />
  );
};

interface CollectionSetsViewProps {
  sets: SetOption[];
  onSelectSet: (code: string) => void;
}

/** Siatka dodatków, z których masz przynajmniej jedną kartę, z procentem skompletowania. */
export const CollectionSetsView: React.FC<CollectionSetsViewProps> = ({ sets, onSelectSet }) => {
  const icons = useSetIcons();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {sets.map((set) => {
        const { pct, label } = completion(set);
        const complete = set.total !== null && set.owned >= set.total;
        return (
          <button
            key={set.code}
            type="button"
            onClick={() => onSelectSet(set.code)}
            title={`${set.name} [${set.code.toUpperCase()}]`}
            className="group flex flex-col items-center gap-2 rounded-xl border border-stone-800 bg-stone-900 px-2 pt-4 pb-3 text-center transition-colors hover:border-amber-500/50 hover:bg-stone-800/60 cursor-pointer"
          >
            <div className="h-12 w-12 flex items-center justify-center">
              <SetSymbol code={set.code} icons={icons} className="h-11 w-11 transition-transform group-hover:scale-105" />
            </div>
            <div className="w-full min-w-0">
              <p className="text-xs font-semibold text-stone-100 truncate">{set.name}</p>
              <p className="text-[11px] text-stone-500 tabular-nums">{set.code.toUpperCase()}</p>
            </div>
            {pct !== null ? (
              <div className="w-full space-y-1">
                <p className={`text-sm font-bold tabular-nums ${complete ? 'text-amber-300' : 'text-stone-100'}`}>{label}</p>
                <div className="h-1 w-full rounded-full bg-stone-800 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className="text-[11px] text-stone-400 tabular-nums">
                  {set.owned}/{set.total}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-stone-400 tabular-nums">
                {set.owned} {cardsWord(set.owned)}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
};

interface CollectionSetHeaderProps {
  set: SetOption | undefined;
  code: string;
  onBack: () => void;
}

/** Nagłówek listy kart wybranego dodatku, z powrotem do siatki dodatków. */
export const CollectionSetHeader: React.FC<CollectionSetHeaderProps> = ({ set, code, onBack }) => {
  const t = useT();
  const icons = useSetIcons();
  const { pct, label } = set ? completion(set) : { pct: null, label: '' };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900 p-3">
      <button type="button" onClick={onBack} className="btn btn-ghost shrink-0" aria-label={t('Wróć do listy dodatków')}>
        <ArrowLeft className="w-4 h-4" />
        <span className="max-sm:hidden">{t('Dodatki')}</span>
      </button>
      <SetSymbol code={code} icons={icons} className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-100 truncate">{set?.name || code.toUpperCase()}</p>
        <p className="text-xs text-stone-400 tabular-nums">
          {code.toUpperCase()}
          {set && (set.total ? ` · ${t('{owned}/{total} różnych kart', { owned: set.owned, total: set.total })}` : ` · ${set.owned} ${cardsWord(set.owned)}`)}
          {set?.released ? ` · ${set.released.substring(0, 4)}` : ''}
        </p>
      </div>
      {pct !== null && (
        <div className="shrink-0 w-20 sm:w-32 text-right space-y-1">
          <p className="text-sm font-bold text-stone-100 tabular-nums">{label}</p>
          <div className="h-1 w-full rounded-full bg-stone-800 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};
