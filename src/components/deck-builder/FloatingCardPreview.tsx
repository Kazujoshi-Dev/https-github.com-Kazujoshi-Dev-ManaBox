import React from 'react';
import { FloatingCardPreviewProps } from './types';
import { EdhrecBadge } from '../EdhrecBadge';
import { getCardEdhrecRank, getCardImageUri } from '../../utils/formatters';

export const FloatingCardPreview: React.FC<FloatingCardPreviewProps> = ({
  card,
  position,
  scale = 100,
}) => {
  if (!card || !position) return null;
  const rank = getCardEdhrecRank(card);

  // Dynamic width based on scale percentage (default 224px / 14rem at 100%)
  const baseWidth = 224;
  const cardWidth = Math.round(baseWidth * (scale / 100));
  const cardHeight = Math.round(cardWidth * 1.396); // MTG aspect ratio ~63x88mm (1:1.396)

  const posX = Math.max(10, Math.min(window.innerWidth - cardWidth - 24, position.x));
  const posY = Math.max(10, Math.min(window.innerHeight - cardHeight - 24, position.y));

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-150 animate-fadeIn"
      style={{
        left: `${posX}px`,
        top: `${posY}px`,
        width: `${cardWidth}px`,
      }}
    >
      <div 
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-amber-500/50 bg-stone-900 ring-4 ring-black/80"
        style={{ width: `${cardWidth}px` }}
      >
        <img
          src={getCardImageUri(card, 'normal')}
          alt={card.name}
          className="w-full h-auto object-cover"
        />
        {rank != null && (
          <div className="absolute bottom-2 left-2 z-10">
            <EdhrecBadge rank={rank} size={scale > 115 ? 'sm' : 'xs'} />
          </div>
        )}
      </div>
    </div>
  );
};

