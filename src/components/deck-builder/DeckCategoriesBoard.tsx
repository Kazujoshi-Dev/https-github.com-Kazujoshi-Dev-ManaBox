import React, { useEffect, useMemo, useState } from 'react';
import { DeckCategoriesBoardProps } from './types';
import { DECK_CATEGORIES } from './constants';
import { DeckCategoryColumn } from './DeckCategoryColumn';
import { sortDeckEntries, type DeckCardSort } from './cardSort';

/** Liczba kolumn planszy jak w siatce Tailwind: 1 / md 2 / lg 3 / xl 4. */
function useColumnCount(): number {
  const get = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return 4;
    if (window.matchMedia('(min-width: 1280px)').matches) return 4;
    if (window.matchMedia('(min-width: 1024px)').matches) return 3;
    if (window.matchMedia('(min-width: 768px)').matches) return 2;
    return 1;
  };
  const [n, setN] = useState(get);
  useEffect(() => {
    const onResize = () => setN(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return n;
}

export const DeckCategoriesBoard: React.FC<DeckCategoriesBoardProps> = ({
  categorizedCards,
  settings,
  previewScale = 100,
  onHoverCard,
  onLeaveCard,
  onUpdateQuantity,
  onSetCommander,
  onViewCardDetails,
  issuesById,
  sortMode = 'name',
}) => {
  // Sort categories from the one with the most cards to the one with the fewest cards
  const sortedCategories = useMemo(() => {
    return [...DECK_CATEGORIES]
      .map(category => {
        const cardsInCat = sortDeckEntries(categorizedCards.get(category.id) || [], sortMode as DeckCardSort);
        const totalQty = cardsInCat.reduce((sum, e) => sum + (e.quantity || 1), 0);
        return {
          category,
          cards: cardsInCat,
          totalQty,
        };
      })
      .filter(item => item.cards.length > 0)
      .sort((a, b) => {
        // 1. Sort by total number of cards in category descending
        if (b.totalQty !== a.totalQty) {
          return b.totalQty - a.totalQty;
        }
        // 2. Tiebreaker: unique card entries count descending
        if (b.cards.length !== a.cards.length) {
          return b.cards.length - a.cards.length;
        }
        // 3. Fallback to default categories order
        return DECK_CATEGORIES.indexOf(a.category) - DECK_CATEGORIES.indexOf(b.category);
      });
  }, [categorizedCards, sortMode]);

  // Kategorie rozkładamy do kolumn „najkrótsza kolumna pierwsza”: duża kategoria zajmuje
  // jedną kolumnę, a małe układają się pod sobą w pozostałych (zawsze pełna liczba kolumn).
  const columnCount = useColumnCount();
  const columns = useMemo(() => {
    const cols: Array<{ height: number; items: typeof sortedCategories }> = Array.from({ length: columnCount }, () => ({ height: 0, items: [] }));
    for (const item of sortedCategories) {
      const target = cols.reduce((min, c) => (c.height < min.height ? c : min), cols[0]);
      target.items.push(item);
      target.height += item.cards.length + 2.5; // wiersze kart + nagłówek i odstęp
    }
    return cols.filter((c) => c.items.length > 0);
  }, [sortedCategories, columnCount]);

  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col gap-4 min-w-0">
          {col.items.map(({ category, cards }) => (
            <DeckCategoryColumn
              key={category.id}
              category={category}
              cards={cards}
              settings={settings}
              previewScale={previewScale}
              onHoverCard={onHoverCard}
              onLeaveCard={onLeaveCard}
              onUpdateQuantity={onUpdateQuantity}
              onSetCommander={onSetCommander}
              onViewCardDetails={onViewCardDetails}
              issuesById={issuesById}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
