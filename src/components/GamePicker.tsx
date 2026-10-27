import React, { useEffect, useState } from 'react';
import { GAME_LIST, type GameId } from '../games';
import { useT, plural } from '../i18n';
import { gamesApi, type GameOverview } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import type { CurrencyCode } from '../types';

interface GamePickerProps {
  /** Gra wybrana ostatnio (wyróżniona). */
  current: GameId;
  username?: string;
  onChoose: (game: GameId) => void;
  /** Powrót bez zmiany gry (gdy ekran otwarto przełącznikiem w nagłówku). */
  onCancel?: () => void;
}

/**
 * Wygląd każdej gry na ekranie wyboru. Kolor światła pojawia się tylko po wskazaniu kafelka
 * (poświata u dołu karty i w całym pomieszczeniu); poza tym obowiązuje paleta aplikacji.
 * Zamiast logotypów (znaki towarowe wydawców) pokazujemy nazwę gry i ilustrację karty dnia.
 */
const LOOK: Record<GameId, { tagline: string; light: string; rights: string }> = {
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
    tagline: 'Wydania zwykłe i Enchanted, ceny z TCGplayer',
    light: '139, 92, 246',
    rights: '© Disney'
  }
};

/** Lekkie przechylenie kart przy wejściu, jakby właśnie je rozdano. */
const DEAL_TILT = ['-1.5deg', '0deg', '1.5deg'];

export const GamePicker: React.FC<GamePickerProps> = ({ current, username, onChoose, onCancel }) => {
  const t = useT();
  const [overview, setOverview] = useState<{ currency: CurrencyCode; games: GameOverview[] } | null>(null);
  const [lit, setLit] = useState<GameId | null>(null);
  const [loaded, setLoaded] = useState<Partial<Record<GameId, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<GameId, boolean>>>({});

  useEffect(() => {
    let cancelled = false;
    gamesApi
      .overview()
      .then((data) => !cancelled && setOverview(data as { currency: CurrencyCode; games: GameOverview[] }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const info = (id: GameId) => overview?.games.find((g) => g.id === id) || null;
  // Telefon i tablet bez kursora: ilustracje od razu w pełnym kolorze, bez efektu wskazania
  const [canHover] = useState(() => typeof window === 'undefined' || window.matchMedia('(hover: hover)').matches);
  const roomLight = lit ? LOOK[lit].light : null;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-stone-950 text-stone-100">
      {/* Światło w pomieszczeniu przejmuje kolor wskazanej gry */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: roomLight
            ? `radial-gradient(70% 55% at 50% 100%, rgba(${roomLight}, 0.16), transparent 70%)`
            : 'radial-gradient(70% 55% at 50% 100%, rgba(120, 113, 108, 0.08), transparent 70%)'
        }}
      />

      <div className="relative mx-auto w-full max-w-[1180px] px-4 sm:px-8 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="" width={36} height={36} className="w-9 h-9 shrink-0" />
            <span className="text-base font-semibold tracking-tight">Mana Screw</span>
          </div>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn btn-ghost">
              {t('Wróć do kolekcji')}
            </button>
          )}
        </header>

        <div className="mt-12 sm:mt-16 max-w-2xl">
          <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] leading-[1.05] font-semibold tracking-[-0.03em] text-stone-50">
            {username ? t('Którą kolekcję otwierasz, {name}?', { name: username }) : t('Którą kolekcję otwierasz?')}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-stone-400">
            {t('Każda gra ma własne klasery, listę życzeń i ofertę „Sprzedam”.')}
          </p>
        </div>

        <ul className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          {GAME_LIST.map((game, i) => {
            const look = LOOK[game.id];
            const data = info(game.id);
            const art = data?.art && !failed[game.id] ? data.art : null;
            const isCurrent = game.id === current;
            const disabled = !game.available;
            const isLit = lit === game.id;
            const empty = data && data.cards === 0;

            return (
              <li key={game.id} className="game-deal flex flex-col" style={{ animationDelay: `${0.08 + i * 0.09}s`, ['--deal-tilt' as string]: DEAL_TILT[i] }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoose(game.id)}
                  onMouseEnter={() => setLit(game.id)}
                  onMouseLeave={() => setLit((v) => (v === game.id ? null : v))}
                  onFocus={() => setLit(game.id)}
                  onBlur={() => setLit((v) => (v === game.id ? null : v))}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`${game.name}${isCurrent ? `, ${t('ostatnio otwarta')}` : ''}${disabled ? `, ${t('wkrótce')}` : ''}`}
                  className={`group relative w-full overflow-hidden rounded-[22px] bg-stone-900 text-left aspect-[16/10] sm:aspect-[5/7] outline-none cursor-pointer disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-4 focus-visible:ring-offset-stone-950 ${
                    isCurrent ? 'ring-1 ring-amber-400/70' : 'ring-1 ring-stone-800'
                  }`}
                  style={{ boxShadow: isLit ? `0 30px 80px -30px rgba(${look.light}, 0.55)` : '0 20px 50px -30px rgba(0,0,0,0.9)' }}
                >
                  {/* Bez ilustracji (np. baza kart jeszcze się wczytuje): spokojne tło w kolorze gry */}
                  {!art && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0"
                      style={{
                        background: `radial-gradient(90% 70% at 70% 20%, rgba(${look.light}, 0.22), transparent 60%), radial-gradient(80% 60% at 10% 90%, rgba(${look.light}, 0.12), transparent 70%)`
                      }}
                    />
                  )}
                  {/* Ilustracja dnia: przygaszona, ożywa po wskazaniu */}
                  {art && (
                    <img
                      src={art.image}
                      alt=""
                      referrerPolicy="no-referrer"
                      onLoad={() => setLoaded((v) => ({ ...v, [game.id]: true }))}
                      onError={() => setFailed((v) => ({ ...v, [game.id]: true }))}
                      className={`game-panel-art absolute inset-0 h-full w-full object-cover object-[50%_28%] ${
                        loaded[game.id] ? 'opacity-100' : 'opacity-0'
                      } ${isLit ? 'scale-[1.07] grayscale-0 brightness-100' : canHover ? 'scale-[1.02] grayscale-[0.6] brightness-[0.55]' : 'scale-[1.02] brightness-[0.85]'}`}
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
                    className={`game-panel-glow absolute inset-0 ${isLit ? 'opacity-100' : 'opacity-0'}`}
                    style={{ background: `radial-gradient(120% 60% at 50% 100%, rgba(${look.light}, 0.45), transparent 65%)` }}
                  />

                  {(isCurrent || disabled) && (
                    <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-stone-950/75 px-3 py-1 text-[12px] font-medium text-stone-100 backdrop-blur">
                      <span className={`h-1.5 w-1.5 rounded-full ${disabled ? 'bg-stone-500' : 'bg-amber-400'}`} />
                      {disabled ? t('Wkrótce') : t('Ostatnio otwarta')}
                    </span>
                  )}

                  <span className={`game-panel-copy absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-6 ${isLit ? '-translate-y-1' : ''}`}>
                    <span className="text-[26px] sm:text-[24px] lg:text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] text-white">
                      {game.name}
                    </span>
                    <span className="text-[13px] leading-snug text-stone-300">{t(look.tagline)}</span>
                    <span className="mt-2 flex items-baseline gap-3 text-[13px] tabular-nums">
                      {!data ? (
                        <span className="h-4 w-28 rounded bg-stone-800/80 animate-pulse" aria-hidden="true" />
                      ) : empty ? (
                        <span className="text-stone-400">{t('Jeszcze pusta')}</span>
                      ) : (
                        <>
                          <span className="font-semibold text-stone-50">
                            {plural(data.cards, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards'])}
                          </span>
                          {data.value > 0 && overview && (
                            <span className="text-emerald-400">{formatCurrency(data.value, overview.currency)}</span>
                          )}
                        </>
                      )}
                    </span>
                  </span>
                </button>

                {art && (
                  <p className="mt-2.5 px-1 text-[11px] leading-4 text-stone-500">
                    <span className="block truncate">{art.artist ? t('{card}, ilustracja: {artist}', { card: art.name, artist: art.artist }) : art.name}</span>
                    <span className="block truncate">{look.rights}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-[13px] text-stone-500">{t('Grę zmienisz później przyciskiem obok logo.')}</p>
      </div>
    </div>
  );
};
