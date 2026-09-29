import React from 'react';
import { PlusCircle, MinusCircle, Crown, ExternalLink } from 'lucide-react';
import { DeckCardRowProps } from './types';

export const DeckCardRow: React.FC<DeckCardRowProps> = ({
  entry,
  onHover,
  onLeave,
  onUpdateQuantity,
  onSetCommander,
  onViewDetails,
}) => {
  const card = entry.card;
  const isLegendary = (card.type_line || '').toLowerCase().includes('legendary');

  return (
    <div
      onMouseEnter={(e) => onHover(card, e)}
      onMouseLeave={onLeave}
      className="group relative h-10 w-full rounded-xl overflow-hidden border border-stone-700/80 hover:border-amber-400/80 transition-all shadow-md hover:shadow-amber-500/10 cursor-pointer flex items-center justify-between px-2.5"
    >
      {/* Artwork banner background crop */}
      <div
        className="absolute inset-0 bg-cover bg-center brightness-70 group-hover:brightness-95 transition-all scale-100 group-hover:scale-105"
        style={{
          backgroundImage: `url(${card.image_uris?.art_crop || card.image_uris?.normal || ''})`,
          backgroundPosition: 'center 25%'
        }}
      />

      {/* High-legibility text gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-stone-950/95 via-stone-950/70 to-stone-950/40 group-hover:from-stone-950/90 group-hover:via-stone-950/50 transition-colors" />

      {/* Left: Quantity Badge & Card Name */}
      <div className="relative z-10 flex items-center gap-2 min-w-0 pr-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 shrink-0">
          {entry.quantity}x
        </span>
        <span className="font-bold text-xs text-stone-100 truncate group-hover:text-amber-200 transition-colors drop-shadow-md">
          {card.name}
        </span>
      </div>

      {/* Right: Mana Cost & Quick Actions */}
      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
        {card.mana_cost && (
          <span className="text-[11px] font-mono font-bold text-amber-300 drop-shadow">
            {card.mana_cost}
          </span>
        )}

        {/* Action controls (visible on group hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-stone-950/90 rounded-lg px-1 py-0.5 border border-stone-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateQuantity(card.id, 1);
            }}
            className="text-stone-400 hover:text-emerald-400 p-0.5"
            title="Zwiększ ilość"
          >
            <PlusCircle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateQuantity(card.id, -1);
            }}
            className="text-stone-400 hover:text-rose-400 p-0.5"
            title="Zmniejsz ilość"
          >
            <MinusCircle className="w-3.5 h-3.5" />
          </button>

          {!entry.isCommander && isLegendary && onSetCommander && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetCommander(card);
              }}
              className="text-stone-400 hover:text-amber-300 p-0.5"
              title="Ustaw jako Dowódcę"
            >
              <Crown className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(card);
            }}
            className="text-stone-400 hover:text-blue-300 p-0.5"
            title="Szczegóły karty"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
