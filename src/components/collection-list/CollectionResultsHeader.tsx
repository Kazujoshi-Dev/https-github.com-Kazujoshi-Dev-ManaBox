import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import { CollectionResultsHeaderProps } from './types';

export const CollectionResultsHeader: React.FC<CollectionResultsHeaderProps> = ({
  displayedCount,
  totalCardsCount,
  totalValue,
  currency,
  hasActiveFilters,
  onResetFilters,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 text-xs gap-2">
      <div className="flex items-center gap-2 text-stone-400 flex-wrap">
        <span>
          Wyświetlono: <strong className="text-stone-100 tabular-nums">{displayedCount}</strong> pozycji ({totalCardsCount} kart)
        </span>
        <span>•</span>
        <span>
          Wartość: <strong className="text-emerald-400 tabular-nums font-bold">{formatCurrency(totalValue, currency)}</strong>
        </span>
      </div>

      {hasActiveFilters && (
        <button
          onClick={onResetFilters}
          className="text-amber-400 hover:text-amber-300 underline text-xs cursor-pointer self-start sm:self-auto"
        >
          Wyczyść wszystkie filtry
        </button>
      )}
    </div>
  );
};
