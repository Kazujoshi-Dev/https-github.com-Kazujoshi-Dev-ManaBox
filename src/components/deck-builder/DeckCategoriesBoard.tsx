import React, { useMemo } from 'react';
import { DeckCategoriesBoardProps } from './types';
import { DECK_CATEGORIES } from './constants';
import { DeckCategoryColumn } from './DeckCategoryColumn';
import { sortDeckEntries, type DeckCardSort } from './cardSort';

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

  return (
    <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
      {sortedCategories.map(({ category, cards }) => (
        <div key={category.id} className="break-inside-avoid mb-4">
        <DeckCategoryColumn
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
        </div>
      ))}
    </div>
  );
};

