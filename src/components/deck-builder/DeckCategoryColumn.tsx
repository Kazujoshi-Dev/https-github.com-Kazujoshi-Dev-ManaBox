import React from 'react';
import { DeckCategoryColumnProps } from './types';
import { DeckCardRow } from './DeckCardRow';

export const DeckCategoryColumn: React.FC<DeckCategoryColumnProps> = ({
  category,
  cards,
  settings,
  previewScale = 100,
  onHoverCard,
  onLeaveCard,
  onUpdateQuantity,
  onSetCommander,
  onViewCardDetails,
  issuesById,
  gameChangers,
}) => {
  if (cards.length === 0) return null;

  const totalCatQty = cards.reduce((sum, e) => sum + e.quantity, 0);

  return (
    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-3.5 shadow-xl flex flex-col space-y-2 backdrop-blur-md">
      {/* Category Header Badge */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-xs text-stone-200 ">
            {category.name}
          </h4>
        </div>
        <span className={`px-2 py-0.5 rounded-full tabular-nums text-[11px] font-bold ${category.badge}`}>
          {totalCatQty}
        </span>
      </div>

      {/* Stack of Cards */}
      <div className="space-y-1.5 pt-1">
        {cards.map(entry => (
          <DeckCardRow
            key={entry.card.id}
            entry={entry}
            settings={settings}
            previewScale={previewScale}
            onHover={onHoverCard}
            onLeave={onLeaveCard}
            onUpdateQuantity={onUpdateQuantity}
            onSetCommander={onSetCommander}
            onViewDetails={onViewCardDetails}
            issues={issuesById?.get(entry.card.id)}
            gameChanger={gameChangers?.has(entry.card.name)}
          />
        ))}
      </div>
    </div>
  );
};

