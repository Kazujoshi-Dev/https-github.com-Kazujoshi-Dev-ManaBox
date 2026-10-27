import React from 'react';
import { Check, Layers, Lock } from 'lucide-react';
import { GAME_LIST, type GameId } from '../games';
import { useT } from '../i18n';

interface GamePickerProps {
  /** Gra wybrana ostatnio (wyróżniona). */
  current: GameId;
  username?: string;
  onChoose: (game: GameId) => void;
  /** Powrót bez zmiany gry (gdy ekran otwarto przełącznikiem w nagłówku). */
  onCancel?: () => void;
}

/** Krótki opis każdej gry na kafelku wyboru. */
const GAME_TAGLINES: Record<GameId, string> = {
  mtg: 'Kolekcja, talie, skaner, ceny z Cardmarket i TCGplayer',
  pokemon: 'Karty i ceny z Cardmarket',
  lorcana: 'Karty i ceny z TCGplayer'
};

/**
 * Wybór kolekcji po zalogowaniu: każda gra karciana ma osobną kolekcję, klasery, listę życzeń
 * i ofertę „Sprzedam”. Gry jeszcze niedostępne są widoczne z oznaczeniem „Wkrótce”.
 */
export const GamePicker: React.FC<GamePickerProps> = ({ current, username, onChoose, onCancel }) => {
  const t = useT();

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 flex items-center justify-center px-4 py-[calc(2rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="" width={40} height={40} className="w-10 h-10 shrink-0" />
          <span className="text-base font-semibold tracking-tight">Mana Screw</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {username ? t('Cześć, {name}! Którą kolekcję otwierasz?', { name: username }) : t('Którą kolekcję otwierasz?')}
          </h1>
          <p className="text-sm text-stone-400">
            {t('Każda gra ma osobną kolekcję, klasery, listę życzeń i ofertę „Sprzedam”. Grę zmienisz w każdej chwili przyciskiem obok logo.')}
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {GAME_LIST.map((game) => {
            const isCurrent = game.id === current;
            const disabled = !game.available;
            return (
              <li key={game.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoose(game.id)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`group w-full h-full text-left rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                    disabled
                      ? 'border-stone-800 bg-stone-900/40 cursor-not-allowed'
                      : isCurrent
                        ? 'border-amber-400/70 bg-amber-400/5 hover:bg-amber-400/10 cursor-pointer'
                        : 'border-stone-800 bg-stone-900 hover:border-stone-600 hover:bg-stone-800/70 cursor-pointer'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        disabled ? 'bg-stone-800/60 text-stone-500' : 'bg-stone-800 text-amber-400'
                      }`}
                    >
                      {disabled ? <Lock className="w-4 h-4" /> : <Layers className="w-[18px] h-[18px]" />}
                    </span>
                    {disabled ? (
                      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400 bg-stone-800 rounded-full px-2 py-0.5">
                        {t('Wkrótce')}
                      </span>
                    ) : isCurrent ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-300">
                        <Check className="w-3.5 h-3.5" /> {t('Ostatnio wybrana')}
                      </span>
                    ) : null}
                  </span>
                  <span className="space-y-1">
                    <span className={`block text-base font-semibold ${disabled ? 'text-stone-400' : 'text-stone-100'}`}>{game.name}</span>
                    <span className={`block text-xs ${disabled ? 'text-stone-500' : 'text-stone-400'}`}>{t(GAME_TAGLINES[game.id])}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {onCancel && (
          <div>
            <button type="button" onClick={onCancel} className="btn btn-ghost">
              {t('Wróć do kolekcji')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
