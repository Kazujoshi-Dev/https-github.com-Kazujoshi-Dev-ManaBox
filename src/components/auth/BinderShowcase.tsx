import React from 'react';
import type { ShowcaseCard } from './useShowcaseCards';

/**
 * Strona klasera z popularnymi kartami (obrazy z Scryfall, karty z lokalnej bazy).
 * Dwie karty mają „foliowy” połysk — przesuwający się refleks pokazuje, że aplikacja
 * rozróżnia wersje foil. Przy prefers-reduced-motion refleks stoi w miejscu.
 */
export const BinderShowcase: React.FC<{ cards: ShowcaseCard[]; compact?: boolean }> = ({ cards, compact = false }) => {
  const page = cards.slice(0, compact ? 6 : 9);
  if (page.length < (compact ? 6 : 9)) return null;
  const foil = new Set([1, compact ? 5 : 7]);
  const tilt = ['-rotate-[1.2deg]', 'rotate-[0.6deg]', '-rotate-[0.4deg]', 'rotate-[1deg]', '-rotate-[0.8deg]', 'rotate-[0.3deg]', 'rotate-[1.1deg]', '-rotate-[0.5deg]', 'rotate-[0.7deg]'];

  return (
    <figure className="auth-binder relative" aria-label="Przykładowa strona klasera z kartami">
      <div className="relative rounded-[22px] bg-stone-900 ring-1 ring-stone-800 p-3 sm:p-4 lg:p-5 shadow-[0_30px_80px_-20px_rgba(12,10,9,0.9)]">
        {/* Kółka segregatora */}
        <div className="absolute left-0 top-0 bottom-0 hidden sm:flex flex-col justify-around -translate-x-1/2 py-10" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-5 h-5 rounded-full bg-stone-700 ring-4 ring-stone-950 shadow-inner" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
          {page.map((c, i) => (
            <div
              key={c.name}
              className={`auth-sleeve relative aspect-[63/88] rounded-[10px] bg-stone-950 p-[3px] ring-1 ring-white/10 ${tilt[i % tilt.length]}`}
              style={{ ['--i' as any]: i }}
            >
              <img
                src={c.image}
                alt={c.name}
                loading={i < 3 ? 'eager' : 'lazy'}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-[8px]"
              />
              {/* połysk koszulki */}
              <span className="pointer-events-none absolute inset-[3px] rounded-[8px] bg-gradient-to-br from-white/14 via-transparent to-transparent" aria-hidden="true" />
              {foil.has(i) && <span className="auth-foil pointer-events-none absolute inset-[3px] rounded-[8px]" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
};
