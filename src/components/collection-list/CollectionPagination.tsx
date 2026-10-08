import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROWS_PER_PAGE_OPTIONS } from './constants';

interface CollectionPaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Wybór liczby wierszy pokazujemy tylko w górnym pasku. */
  rowsPerPage?: number;
  onRowsPerPageChange?: (rows: number) => void;
  /** Zakres wyświetlanych pozycji, np. „1–72 z 1158”. */
  rangeLabel?: string;
}

/** Numery stron z wielokropkami: 1 … 4 5 6 … 20 */
function pageItems(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const items: Array<number | 'gap'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push('gap');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < pageCount - 1) items.push('gap');
  items.push(pageCount);
  return items;
}

const pageBtn =
  'h-8 min-w-8 px-2 rounded-lg text-xs font-medium tabular-nums flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40';

export const CollectionPagination: React.FC<CollectionPaginationProps> = ({
  page,
  pageCount,
  onPageChange,
  rowsPerPage,
  onRowsPerPageChange,
  rangeLabel,
}) => {
  const showPager = pageCount > 1;
  const showRows = rowsPerPage !== undefined && onRowsPerPageChange;
  if (!showPager && !showRows) return null;

  return (
    <nav
      aria-label="Strony kolekcji"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2"
    >
      {showRows ? (
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span>Wiersze na stronie:</span>
          <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-stone-800">
            {ROWS_PER_PAGE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onRowsPerPageChange!(n)}
                aria-pressed={rowsPerPage === n}
                className={`h-7 min-w-9 px-2 rounded-md text-xs font-medium tabular-nums cursor-pointer transition-colors ${
                  rowsPerPage === n ? 'bg-stone-800 text-amber-400' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {rangeLabel && <span className="max-sm:hidden tabular-nums">{rangeLabel}</span>}
        </div>
      ) : (
        <span className="text-xs text-stone-400 tabular-nums">{rangeLabel}</span>
      )}

      {showPager && (
        <div className="flex items-center gap-1 self-center sm:self-auto">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Poprzednia strona"
            className={`${pageBtn} text-stone-300 hover:bg-stone-800`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Telefon: zwięzły licznik zamiast numerów */}
          <span className="sm:hidden px-2 text-xs text-stone-300 tabular-nums">
            Strona {page} z {pageCount}
          </span>

          <div className="max-sm:hidden flex items-center gap-1">
            {pageItems(page, pageCount).map((item, i) =>
              item === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-stone-500">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-current={item === page ? 'page' : undefined}
                  className={`${pageBtn} ${
                    item === page
                      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40'
                      : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Następna strona"
            className={`${pageBtn} text-stone-300 hover:bg-stone-800`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </nav>
  );
};
