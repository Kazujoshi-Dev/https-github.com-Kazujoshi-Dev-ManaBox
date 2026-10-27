import React, { useState } from 'react';
import type { GameId, GameInfo } from '../../games';
import { useT } from '../../i18n';

/**
 * Wygląd każdej gry (ekran wyboru kolekcji i strona główna). Kolor światła pojawia się tylko po wskazaniu
 * kafelka; poza tym obowiązuje paleta aplikacji. Zamiast logotypów (znaki towarowe wydawców)
 * pokazujemy nazwę gry i ilustrację karty dnia.
 */
export const GAME_LOOK: Record<GameId, { tagline: string; light: string; rights: string }> = {
  mtg: {
    tagline: 'Klasery, talie, skaner i ceny z Cardmarket',
    light: '234, 88, 12',
    rights: '™ & © Wizards of the Coast'
  },
  pokemon: {
    tagline: 'Wersje zwykłe i reverse holo, ceny z Cardmarket',
    light: '250, 204, 21',
    rights: '© Pokémon / Nintendo / Creatures / GAME FREAK'
  },
  lorcana: {
    tagline: 'Skaner, wydania zwykłe i Enchanted, ceny z TCGplayer',
    light: '139, 92, 246',
    rights: '© Disney'
  }
};

export interface GameArt {
  image: string;
  name: string;
  artist: string | null;
}

/** Lekkie przechylenie kart przy wejściu, jakby właśnie je rozdano. */
const DEAL_TILT = ['-1.5deg', '0deg', '1.5deg'];

/** Urządzenie z kursorem: ilustracje przygaszone do czasu wskazania; na ekranach dotykowych od razu w kolorze. */
export function useCanHover(): boolean {
  const [canHover] = useState(() => typeof window === 'undefined' || window.matchMedia('(hover: hover)').matches);
  return canHover;
}

interface GameTileProps {
  game: GameInfo;
  /** Kolejność kafelka (opóźnienie i przechylenie przy wejściu). */
  index: number;
  art: GameArt | null;
  lit: boolean;
  onLit: (lit: boolean) => void;
  canHover: boolean;
  /** Wyróżnienie (np. ostatnio otwarta gra) i jego podpis. */
  badge?: { label: string; muted?: boolean } | null;
  highlighted?: boolean;
  /** Kafelek jako przycisk (ekran wyboru); bez tego tylko prezentacja (strona główna). */
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}

export const GameTile: React.FC<GameTileProps> = ({
  game,
  index,
  art,
  lit,
  onLit,
  canHover,
  badge,
  highlighted = false,
  onClick,
  disabled = false,
  ariaLabel,
  children
}) => {
  const t = useT();
  const look = GAME_LOOK[game.id];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownArt = art && !failed ? art : null;

  const surface = (
    <>
      {/* Bez ilustracji (np. baza kart jeszcze się wczytuje): spokojne tło w kolorze gry */}
      {!shownArt && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: `radial-gradient(90% 70% at 70% 20%, rgba(${look.light}, 0.22), transparent 60%), radial-gradient(80% 60% at 10% 90%, rgba(${look.light}, 0.12), transparent 70%)`
          }}
        />
      )}
      {/* Ilustracja dnia: przygaszona, ożywa po wskazaniu */}
      {shownArt && (
        <img
          src={shownArt.image}
          alt=""
          referrerPolicy="no-referrer"
          loading={onClick ? 'eager' : 'lazy'}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`game-panel-art absolute inset-0 h-full w-full object-cover object-[50%_28%] ${loaded ? 'opacity-100' : 'opacity-0'} ${
            lit ? 'scale-[1.07] grayscale-0 brightness-100' : canHover ? 'scale-[1.02] grayscale-[0.6] brightness-[0.55]' : 'scale-[1.02] brightness-[0.85]'
          }`}
        />
      )}
      {/* Miękkie przyciemnienie pod tekstem (bez widocznej krawędzi) */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[72%]"
        style={{ background: 'linear-gradient(to top, rgba(12,10,9,0.97) 0%, rgba(12,10,9,0.86) 28%, rgba(12,10,9,0.45) 62%, rgba(12,10,9,0) 100%)' }}
      />
      {/* Kolor gry: poświata od dołu karty */}
      <span
        aria-hidden="true"
        className={`game-panel-glow absolute inset-0 ${lit ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: `radial-gradient(120% 60% at 50% 100%, rgba(${look.light}, 0.45), transparent 65%)` }}
      />
      {badge && (
        <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-stone-950/75 px-3 py-1 text-[12px] font-medium text-stone-100 backdrop-blur">
          <span className={`h-1.5 w-1.5 rounded-full ${badge.muted ? 'bg-stone-500' : 'bg-amber-400'}`} />
          {badge.label}
        </span>
      )}
      <span className={`game-panel-copy absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-6 ${lit ? '-translate-y-1' : ''}`}>
        <span className="text-[26px] sm:text-[24px] lg:text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] text-white">{game.name}</span>
        {children}
      </span>
    </>
  );

  const shell = `relative w-full overflow-hidden rounded-[22px] bg-stone-900 text-left aspect-[16/10] sm:aspect-[5/7] ${
    highlighted ? 'ring-1 ring-amber-400/70' : 'ring-1 ring-stone-800'
  }`;
  const shadow = { boxShadow: lit ? `0 30px 80px -30px rgba(${look.light}, 0.55)` : '0 20px 50px -30px rgba(0,0,0,0.9)' };
  const hover = { onMouseEnter: () => onLit(true), onMouseLeave: () => onLit(false) };

  return (
    <div className="game-deal flex flex-col" style={{ animationDelay: `${0.08 + index * 0.09}s`, ['--deal-tilt' as string]: DEAL_TILT[index % 3] }}>
      {onClick ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          {...hover}
          onFocus={() => onLit(true)}
          onBlur={() => onLit(false)}
          aria-current={highlighted ? 'true' : undefined}
          aria-label={ariaLabel}
          className={`${shell} outline-none cursor-pointer disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-4 focus-visible:ring-offset-stone-950`}
          style={shadow}
        >
          {surface}
        </button>
      ) : (
        <div {...hover} className={shell} style={shadow}>
          {surface}
        </div>
      )}
      {shownArt && (
        <p className="mt-2.5 px-1 text-[11px] leading-4 text-stone-500">
          <span className="block truncate">
            {shownArt.artist ? t('{card}, ilustracja: {artist}', { card: shownArt.name, artist: shownArt.artist }) : shownArt.name}
          </span>
          <span className="block truncate">{look.rights}</span>
        </p>
      )}
    </div>
  );
};
