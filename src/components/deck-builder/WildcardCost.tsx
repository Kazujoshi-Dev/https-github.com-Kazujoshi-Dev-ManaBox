import React from 'react';
import { WILDCARD_RARITIES, type WildcardCost as Cost, type WildcardRarity } from '../../utils/mtgFormats';

/** Kolory wildcardów jak w MTG Arena: szary, srebrny, złoty, pomarańczowy. */
const DOT: Record<WildcardRarity, string> = {
  common: 'bg-stone-400',
  uncommon: 'bg-sky-200',
  rare: 'bg-amber-400',
  mythic: 'bg-orange-500'
};

interface WildcardCostProps {
  cost: Cost;
  /** Wersja kompaktowa (kafelek na liście talii). */
  compact?: boolean;
}

/** Koszt talii MTG Arena w wildcardach, z podziałem na rzadkości. */
export const WildcardCost: React.FC<WildcardCostProps> = ({ cost, compact = false }) => {
  const title = WILDCARD_RARITIES.map((r) => `${r.label}: ${cost[r.id]}`).join(', ');
  return (
    <span
      className={`inline-flex items-center tabular-nums ${compact ? 'gap-2 text-sm' : 'gap-2.5 text-sm font-bold'}`}
      title={`Wildcardy potrzebne do stworzenia talii od zera (bez lądów podstawowych). ${title}`}
      aria-label={`Koszt w wildcardach: ${title}`}
    >
      {WILDCARD_RARITIES.map((r) => (
        <span key={r.id} className={`inline-flex items-center gap-1 ${cost[r.id] ? 'text-stone-100' : 'text-stone-500'}`}>
          <span className={`w-2.5 h-3.5 rounded-[3px] ${DOT[r.id]} ${cost[r.id] ? '' : 'opacity-40'}`} aria-hidden="true" />
          {cost[r.id]}
        </span>
      ))}
    </span>
  );
};
