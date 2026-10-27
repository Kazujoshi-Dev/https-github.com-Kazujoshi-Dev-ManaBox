import React, { useEffect, useRef, useState } from 'react';
import type { ShowcaseCard } from './useShowcaseCards';
import { BinderShowcase } from './BinderShowcase';
import { GAMES, type GameId } from '../../games';
import { useT } from '../../i18n';

const ROTATE_MS = 7000;
const PRELOAD_TIMEOUT_MS = 4000;

/** Karty na stronę klasera dla Pokémon i Lorcany (MTG przychodzi z ekranu logowania). */
function useGamePages(): Partial<Record<GameId, ShowcaseCard[]>> {
  const [pages, setPages] = useState<Partial<Record<GameId, ShowcaseCard[]>>>({});
  useEffect(() => {
    let cancelled = false;
    (['pokemon', 'lorcana'] as GameId[]).forEach((game) => {
      fetch(`/api/public/showcase/${game}`)
        .then((r) => (r.ok ? r.json() : { cards: [] }))
        .then((d) => !cancelled && Array.isArray(d?.cards) && setPages((p) => ({ ...p, [game]: d.cards })))
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return pages;
}

/** Wczytuje obrazy strony zanim ją pokażemy, żeby przy zmianie nie było pustych koszulek. */
function preload(urls: string[]): Promise<void> {
  return new Promise((resolve) => {
    let left = urls.length;
    if (!left) return resolve();
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    const timer = window.setTimeout(resolve, PRELOAD_TIMEOUT_MS);
    urls.forEach((u) => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = img.onerror = () => {
        done();
        if (left <= 0) window.clearTimeout(timer);
      };
      img.src = u;
    });
  });
}

/**
 * Strona klasera na stronie głównej, która co kilka sekund przewraca się na karty innej gry
 * (Magic, Pokémon, Lorcana). Zatrzymuje się, gdy kursor jest nad klaserem albo karta przeglądarki
 * jest ukryta; pod klaserem można wybrać grę ręcznie.
 */
export const RotatingBinder: React.FC<{ mtgCards: ShowcaseCard[]; compact?: boolean }> = ({ mtgCards, compact = false }) => {
  const t = useT();
  const extra = useGamePages();
  const need = compact ? 6 : 9;
  const pages = (['mtg', 'pokemon', 'lorcana'] as GameId[])
    .map((game) => ({ game, cards: game === 'mtg' ? mtgCards : extra[game] || [] }))
    .filter((p) => p.cards.length >= need);

  const [active, setActive] = useState<GameId>('mtg');
  const [paused, setPaused] = useState(false);
  const switching = useRef(false);
  const current = pages.find((p) => p.game === active) || pages[0];

  const show = async (game: GameId) => {
    const page = pages.find((p) => p.game === game);
    if (!page || switching.current) return;
    switching.current = true;
    await preload(page.cards.slice(0, need).map((c) => c.image));
    setActive(game);
    switching.current = false;
  };

  useEffect(() => {
    if (paused || pages.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const i = pages.findIndex((p) => p.game === current?.game);
      show(pages[(i + 1) % pages.length].game);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, pages.length, current?.game]);

  if (!current) return null;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div key={current.game} className="binder-page-in">
        <BinderShowcase cards={current.cards} compact={compact} label={t('Przykładowa strona klasera z kartami {game}', { game: GAMES[current.game].name })} />
      </div>
      {pages.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1" role="group" aria-label={t('Gra na stronie klasera')}>
          {pages.map((p) => {
            const on = p.game === current.game;
            return (
              <button
                key={p.game}
                type="button"
                onClick={() => show(p.game)}
                aria-pressed={on}
                className={`h-8 px-3 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                  on ? 'bg-stone-800 text-stone-50' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {GAMES[p.game].shortName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
