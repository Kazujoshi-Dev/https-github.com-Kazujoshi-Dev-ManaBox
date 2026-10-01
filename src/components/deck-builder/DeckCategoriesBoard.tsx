import React, { useMemo } from 'react';
import { DeckCategoriesBoardProps } from './types';
import { DECK_CATEGORIES } from './constants';
import { DeckCategoryColumn } from './DeckCategoryColumn';

export const DeckCategoriesBoard: React.FC<DeckCategoriesBoardProps> = ({
  categorizedCards,
  settings,
  previewScale = 100,
  onHoverCard,
  onLeaveCard,
  onUpdateQuantity,
  onSetCommander,
  onViewCardDetails,
}) => {
  // Sort categories from the one with the most cards to the one with the fewest cards
  const sortedCategories = useMemo(() => {
    return [...DECK_CATEGORIES]
      .map(category => {
        const cardsInCat = categorizedCards.get(category.id) || [];
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
  }, [categorizedCards]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
      {sortedCategories.map(({ category, cards }) => (
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
        />
      ))}
    </div>
  );
};

