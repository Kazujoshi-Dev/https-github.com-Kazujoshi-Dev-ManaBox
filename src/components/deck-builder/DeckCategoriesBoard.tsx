import React from 'react';
import { DeckCategoriesBoardProps } from './types';
import { DECK_CATEGORIES } from './constants';
import { DeckCategoryColumn } from './DeckCategoryColumn';

export const DeckCategoriesBoard: React.FC<DeckCategoriesBoardProps> = ({
  categorizedCards,
  onHoverCard,
  onLeaveCard,
  onUpdateQuantity,
  onSetCommander,
  onViewCardDetails,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
      {DECK_CATEGORIES.map(category => {
        const cardsInCat = categorizedCards.get(category.id) || [];
        if (cardsInCat.length === 0) return null;

        return (
          <DeckCategoryColumn
            key={category.id}
            category={category}
            cards={cardsInCat}
            onHoverCard={onHoverCard}
            onLeaveCard={onLeaveCard}
            onUpdateQuantity={onUpdateQuantity}
            onSetCommander={onSetCommander}
            onViewCardDetails={onViewCardDetails}
          />
        );
      })}
    </div>
  );
};
