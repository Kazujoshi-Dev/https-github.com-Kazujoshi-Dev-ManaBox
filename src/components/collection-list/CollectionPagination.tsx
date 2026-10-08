import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';

interface CollectionPaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
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
  rangeLabel,
}) => {
  const t = useT();
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={t('Strony kolekcji')}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2"
    >
      <span className="text-xs text-stone-400 tabular-nums">{rangeLabel}</span>

      <div className="flex items-center gap-1 self-center sm:self-auto">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('Poprzednia strona')}
            className={`${pageBtn} text-stone-300 hover:bg-stone-800`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Telefon: zwięzły licznik zamiast numerów */}
          <span className="sm:hidden px-2 text-xs text-stone-300 tabular-nums">
            {t('Strona {page} z {count}', { page, count: pageCount })}
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
            aria-label={t('Następna strona')}
            className={`${pageBtn} text-stone-300 hover:bg-stone-800`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
      </div>
    </nav>
  );
};
