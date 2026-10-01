import React from 'react';
import { PlusCircle, MinusCircle, Crown, ExternalLink } from 'lucide-react';
import { DeckCardRowProps } from './types';
import { formatCurrency, getCardPrice } from '../../utils/formatters';

export const DeckCardRow: React.FC<DeckCardRowProps> = ({
  entry,
  settings,
  previewScale = 100,
  onHover,
  onLeave,
  onUpdateQuantity,
  onSetCommander,
  onViewDetails,
}) => {
  const card = entry.card;
  const isLegendary = (card.type_line || '').toLowerCase().includes('legendary');
  const singlePrice = settings ? getCardPrice(card, Boolean(entry.isFoil), settings) : 0;
  const totalPrice = singlePrice * entry.quantity;

  // Scale row height smoothly with user scale preference (36px to 54px)
  const rowHeight = Math.max(36, Math.min(54, Math.round(40 * (previewScale / 100))));

  return (
    <div
      onMouseEnter={(e) => onHover(card, e)}
      onMouseLeave={onLeave}
      onClick={() => onViewDetails(card)}
      style={{ height: `${rowHeight}px` }}
      className={`group relative w-full rounded-xl overflow-hidden border transition-all shadow-md cursor-pointer flex items-center justify-between px-2.5 ${
        entry.isFoil
          ? 'border-amber-400/60 hover:border-amber-300 shadow-amber-500/10'
          : 'border-stone-700/80 hover:border-amber-400/80 hover:shadow-amber-500/10'
      }`}
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

      {/* Left: Quantity Badge, Foil tag & Card Name */}
      <div className="relative z-10 flex items-center gap-2 min-w-0 pr-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 shrink-0">
          {entry.quantity}x
        </span>
        {entry.isFoil && (
          <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500/30 to-purple-500/30 text-amber-300 font-mono text-[9px] font-black border border-amber-400/40 shrink-0 flex items-center gap-0.5">
            ✨ FOIL
          </span>
        )}
        <span className="font-bold text-xs text-stone-100 truncate group-hover:text-amber-200 transition-colors drop-shadow-md">
          {card.name}
        </span>
      </div>

      {/* Right: Price, Mana Cost & Quick Actions */}
      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
        {settings && singlePrice > 0 && (
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow ${
            entry.isFoil
              ? 'text-amber-300 bg-amber-950/70 border border-amber-500/40'
              : 'text-emerald-300 bg-stone-900/80 border border-stone-700/60'
          }`}>
            {formatCurrency(totalPrice, settings.currency)}
          </span>
        )}

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
