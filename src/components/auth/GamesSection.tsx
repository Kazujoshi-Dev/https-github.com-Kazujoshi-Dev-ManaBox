import React, { useEffect, useState } from 'react';
import { GAME_LIST, type GameId } from '../../games';
import { locale, useT } from '../../i18n';
import { GAME_LOOK, GameTile, useCanHover, type GameArt } from '../games/GameTile';

interface PublicGame {
  id: GameId;
  art: GameArt | null;
  cards: number;
}

/** Co działa w danej grze: krótkie zdania z perspektywy gracza. */
const GAME_POINTS: Record<GameId, string[]> = {
  mtg: ['Skaner kart telefonem', 'Talie we wszystkich formatach, także MTG Arena', 'Alerty cenowe i spoilery nowych dodatków'],
  pokemon: ['Wersje zwykłe i reverse holo', 'Ceny z Cardmarket, zapasowo z TCGplayer', 'Wyszukiwanie po nazwie, dodatku i numerze'],
  lorcana: ['Wydania zwykłe i Enchanted', 'Filtry atramentu, kosztu i rzadkości', 'Ceny z TCGplayer przeliczone na złotówki']
};

/** Liczba kart w bazie gry (MTG liczy wszystkie wydania i wersje językowe). */
const COUNT_LABEL: Record<GameId, string> = {
  mtg: '{n} wydań kart w bazie',
  pokemon: '{n} kart w bazie',
  lorcana: '{n} kart w bazie'
};

/**
 * Strona główna: obsługiwane gry jako trzy karty z ilustracją dnia (ten sam wygląd co ekran
 * wyboru kolekcji po zalogowaniu), z tym, co działa w każdej grze, i liczbą kart w bazie.
 */
export const GamesSection: React.FC = () => {
  const t = useT();
  const canHover = useCanHover();
  const [games, setGames] = useState<PublicGame[] | null>(null);
  const [lit, setLit] = useState<GameId | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/games')
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((d) => !cancelled && setGames(Array.isArray(d?.games) ? d.games : []))
      .catch(() => !cancelled && setGames([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const roomLight = lit ? GAME_LOOK[lit].light : null;

  return (
    <section className="relative" aria-labelledby="auth-games">
      {/* Światło sekcji przejmuje kolor wskazanej gry */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-16 -bottom-8 transition-[background] duration-700"
        style={{ background: roomLight ? `radial-gradient(60% 50% at 50% 85%, rgba(${roomLight}, 0.14), transparent 70%)` : 'none' }}
      />
      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16 lg:pb-24">
        <div className="max-w-2xl space-y-3">
          <h2 id="auth-games" className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-50">
            {t('Trzy gry, jedno konto')}
          </h2>
          <p className="text-base text-stone-400 leading-relaxed">
            {t('Magic, Pokémon i Lorcana mają osobne kolekcje, klasery, listy życzeń i oferty „Sprzedam”. Między grami przełączasz się jednym kliknięciem.')}
          </p>
        </div>

        <ul className="mt-8 lg:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          {GAME_LIST.map((game, i) => {
            const data = games?.find((g) => g.id === game.id) || null;
            return (
              <li key={game.id}>
                <GameTile
                  game={game}
                  index={i}
                  art={data?.art || null}
                  lit={lit === game.id}
                  onLit={(on) => setLit((v) => (on ? game.id : v === game.id ? null : v))}
                  canHover={canHover}
                  badge={game.id !== 'mtg' ? { label: t('Nowość') } : null}
                >
                  <ul className="space-y-1 text-[13px] leading-snug text-stone-300">
                    {GAME_POINTS[game.id].map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-stone-500" />
                        {t(p)}
                      </li>
                    ))}
                  </ul>
                  {data && data.cards > 0 && (
                    <span className="mt-2 text-[13px] font-semibold text-stone-50 tabular-nums">
                      {t(COUNT_LABEL[game.id], { n: data.cards.toLocaleString(locale()) })}
                    </span>
                  )}
                </GameTile>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
