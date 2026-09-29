import React from 'react';
import { FloatingCardPreviewProps } from './types';

export const FloatingCardPreview: React.FC<FloatingCardPreviewProps> = ({
  card,
  position,
}) => {
  if (!card || !position) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-150 animate-fadeIn"
      style={{
        left: `${Math.min(window.innerWidth - 260, position.x)}px`,
        top: `${Math.min(window.innerHeight - 380, position.y)}px`,
      }}
    >
      <div className="w-56 rounded-2xl overflow-hidden shadow-2xl border border-amber-500/50 bg-stone-900 ring-4 ring-black/80">
        <img
          src={card.image_uris?.normal || card.image_uris?.large}
          alt={card.name}
          className="w-full h-auto object-cover"
        />
      </div>
    </div>
  );
};
