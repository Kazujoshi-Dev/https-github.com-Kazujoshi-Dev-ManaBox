import React, { useEffect, useState } from 'react';
import { GAME_LIST, type GameId } from '../games';
import { useT, plural } from '../i18n';
import { gamesApi, type GameOverview } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import type { CurrencyCode } from '../types';
import { GAME_LOOK, GameTile, useCanHover } from './games/GameTile';

interface GamePickerProps {
  /** Gra wybrana ostatnio (wyróżniona). */
  current: GameId;
  username?: string;
  onChoose: (game: GameId) => void;
  /** Powrót bez zmiany gry (gdy ekran otwarto przełącznikiem w nagłówku). */
  onCancel?: () => void;
}

/**
 * Wybór kolekcji po zalogowaniu: każda gra karciana ma osobną kolekcję, klasery, listę życzeń
 * i ofertę „Sprzedam”. Kafelek pokazuje ilustrację karty dnia oraz liczbę kart i wartość kolekcji gracza.
 */
export const GamePicker: React.FC<GamePickerProps> = ({ current, username, onChoose, onCancel }) => {
  const t = useT();
  const canHover = useCanHover();
  const [overview, setOverview] = useState<{ currency: CurrencyCode; games: GameOverview[] } | null>(null);
  const [lit, setLit] = useState<GameId | null>(null);

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
  const roomLight = lit ? GAME_LOOK[lit].light : null;

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
          <p className="mt-4 text-[15px] leading-relaxed text-stone-400">{t('Każda gra ma własne klasery, listę życzeń i ofertę „Sprzedam”.')}</p>
        </div>

        <ul className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          {GAME_LIST.map((game, i) => {
            const data = info(game.id);
            const isCurrent = game.id === current;
            const disabled = !game.available;
            return (
              <li key={game.id}>
                <GameTile
                  game={game}
                  index={i}
                  art={data?.art || null}
                  lit={lit === game.id}
                  onLit={(on) => setLit((v) => (on ? game.id : v === game.id ? null : v))}
                  canHover={canHover}
                  highlighted={isCurrent}
                  badge={disabled ? { label: t('Wkrótce'), muted: true } : isCurrent ? { label: t('Ostatnio otwarta') } : null}
                  onClick={() => onChoose(game.id)}
                  disabled={disabled}
                  ariaLabel={`${game.name}${isCurrent ? `, ${t('ostatnio otwarta')}` : ''}${disabled ? `, ${t('wkrótce')}` : ''}`}
                >
                  <span className="text-[13px] leading-snug text-stone-300">{t(GAME_LOOK[game.id].tagline)}</span>
                  <span className="mt-2 flex items-baseline gap-3 text-[13px] tabular-nums">
                    {!data ? (
                      <span className="h-4 w-28 rounded bg-stone-800/80 animate-pulse" aria-hidden="true" />
                    ) : data.cards === 0 ? (
                      <span className="text-stone-400">{t('Jeszcze pusta')}</span>
                    ) : (
                      <>
                        <span className="font-semibold text-stone-50">
                          {plural(data.cards, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards'])}
                        </span>
                        {data.value > 0 && overview && <span className="text-emerald-400">{formatCurrency(data.value, overview.currency)}</span>}
                      </>
                    )}
                  </span>
                </GameTile>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-[13px] text-stone-500">{t('Grę zmienisz później przyciskiem obok logo.')}</p>
      </div>
    </div>
  );
};
