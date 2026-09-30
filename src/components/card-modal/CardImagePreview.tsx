import React from 'react';
import { RotateCw, Sparkles } from 'lucide-react';
import { handleCardImageError } from '../../utils/formatters';
import { EdhrecBadge } from '../EdhrecBadge';
import { CardImagePreviewProps } from './types';

export const CardImagePreview: React.FC<CardImagePreviewProps> = ({
  imageUri,
  cardName,
  setCode,
  collectorNumber,
  isFoil,
  hasMultipleFaces,
  onFlipCard,
  edhrecRank,
}) => {
  return (
    <div className="relative group max-w-[280px] w-full rounded-2xl overflow-hidden shadow-2xl border border-stone-800 bg-stone-950">
      <img
        src={imageUri}
        alt={cardName}
        referrerPolicy="no-referrer"
        onError={(e) => handleCardImageError(e, imageUri)}
        className="w-full h-auto object-cover rounded-2xl shadow-inner"
      />

      {/* Flip Button for transform cards */}
      {hasMultipleFaces && onFlipCard && (
        <button
          type="button"
          onClick={onFlipCard}
          className="absolute bottom-3 right-3 bg-stone-950/90 hover:bg-amber-600 text-amber-300 hover:text-stone-950 p-2.5 rounded-full border border-amber-500/40 shadow-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="Obróć kartę na drugą stronę"
        >
          <RotateCw className="w-4 h-4 animate-spin-once" />
          <span>Obróć kartę</span>
        </button>
      )}

      {/* Set & collector badge over image */}
      <div className="absolute top-2 left-2 bg-stone-950/85 backdrop-blur-md px-2 py-1 rounded-lg border border-stone-800 text-[10px] font-mono text-amber-300">
        [{setCode.toUpperCase()}] #{collectorNumber}
      </div>

      {/* Foil Badge over image */}
      {isFoil && (
        <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-stone-950 font-black text-[10px] px-2 py-0.5 rounded-lg shadow-xl flex items-center gap-1 border border-amber-200 animate-pulse">
          <Sparkles className="w-3 h-3 fill-stone-950" />
          <span>FOIL</span>
        </div>
      )}

      {/* EDHREC Rank Badge in bottom-left corner of card graphic */}
      {edhrecRank != null && (
        <div className="absolute bottom-3 left-3 z-10">
          <EdhrecBadge rank={edhrecRank} size="sm" />
        </div>
      )}
    </div>
  );
};
