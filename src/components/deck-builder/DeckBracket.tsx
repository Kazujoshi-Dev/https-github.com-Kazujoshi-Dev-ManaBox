import React, { useEffect, useMemo, useState } from 'react';
import { getDeckFormat } from '../../utils/mtgFormats';
import { Gauge, Gem, Loader2, AlertCircle, ExternalLink, ChevronDown } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';

export interface BracketCard {
  name: string;
  quantity: number;
  banned: boolean;
  gameChanger: boolean;
  massLandDenial: boolean;
  extraTurn: boolean;
}
export interface BracketCombo {
  id: string;
  cards: string[];
  results: string[];
  relevant: boolean;
  definitelyTwoCard: boolean;
  arguablyTwoCard: boolean;
  speed: number;
  massLandDenial: boolean;
  extraTurn: boolean;
  lock: boolean;
  controlAllOpponents: boolean;
}
export interface BracketEstimate {
  bracketTag: 'R' | 'S' | 'P' | 'O' | 'C' | 'E' | 'B' | null;
  cards: BracketCard[];
  combos: BracketCombo[];
}

/** Opis tagów Commander Spellbook w skali oficjalnych bracketów 1–5. */
const TAGS: Record<string, { range: string; name: string; text: string }> = {
  E: { range: '1+', name: 'Exhibition', text: 'Nic nie wymusza wyższego bracketu. Ostateczny poziom zależy od tego, jak talia gra.' },
  C: { range: '2+', name: 'Core', text: 'Talia na poziomie gotowej talii (precon) lub wyżej, np. przez karty dodatkowych tur albo wolną kombinację.' },
  O: { range: '2–3', name: 'Oddball', text: 'Coś między 2 a 3: kombinacje, które mogą być mocne, ale wymagają trzeciej karty albo nie wygrywają od razu.' },
  P: { range: '3+', name: 'Powerful', text: 'Co najmniej bracket 3 (Upgraded): Game Changers albo wolna kombinacja dwóch kart.' },
  S: { range: '3–4', name: 'Spicy', text: 'Na granicy 3 i 4: szybkie kombinacje, które mogą wymagać trzeciej karty, albo blokady (lock) i pomijanie tur.' },
  R: { range: '4+', name: 'Ruthless', text: 'Co najmniej bracket 4 (Optimized): więcej niż 3 Game Changers, mass land denial, łańcuch dodatkowych tur albo szybka kombinacja dwóch kart.' },
  B: { range: '–', name: 'Niedozwolona', text: 'Talia ma kartę zbanowaną w Commanderze, więc nie pasuje do żadnego bracketu.' }
};

const SPEED_LABEL: Record<number, string> = { 5: 'bardzo szybka', 4: 'szybka', 3: 'średnia', 2: 'wolna', 1: 'bardzo wolna' };

/** Szacuje bracket talii przez Commander Spellbook; odświeża po zmianie kart (z opóźnieniem). */
export function useDeckBracket(deck: DeckItem) {
  // Bracket dotyczy tylko Commandera: w innych formatach nie pytamy Spellbooka
  const enabled = getDeckFormat(deck.format).id === 'commander';
  const payload = useMemo(() => {
    if (!enabled) return { commanders: [] as { card: string; quantity: number }[], main: [] as { card: string; quantity: number }[] };
    const main = deck.cards
      .filter((e) => !e.isSideboard && !e.isCommander)
      .map((e) => ({ card: e.card.name, quantity: e.quantity }));
    const commanders = deck.commander ? [{ card: deck.commander.name, quantity: 1 }] : [];
    return { commanders, main };
  }, [deck, enabled]);
  const key = useMemo(
    () => JSON.stringify([payload.commanders.map((c) => c.card), payload.main.map((m) => `${m.quantity}${m.card}`).sort()]),
    [payload]
  );
  const [data, setData] = useState<BracketEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!payload.main.length && !payload.commanders.length) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch('/api/spellbook/estimate-bracket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || 'Nie udało się oszacować bracketu.');
          return d as BracketEstimate;
        })
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
        })
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setLoading(false));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Game Changers: z odpowiedzi Spellbook i z pola game_changer w danych Scryfall (gdy Spellbook niedostępny)
  const gameChangers = useMemo(() => {
    const set = new Set<string>();
    data?.cards.forEach((c) => c.gameChanger && set.add(c.name));
    if (deck.commander?.game_changer) set.add(deck.commander.name);
    deck.cards.forEach((e) => e.card.game_changer && set.add(e.card.name));
    return set;
  }, [data, deck]);

  return { data, error, loading, gameChangers };
}

const Row: React.FC<{ label: string; ok: boolean; value: React.ReactNode; children?: React.ReactNode }> = ({ label, ok, value, children }) => (
  <li className="py-2.5">
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-stone-300">{label}</span>
      <span className={`tabular-nums font-medium ${ok ? 'text-stone-400' : 'text-amber-300'}`}>{value}</span>
    </div>
    {children}
  </li>
);

/** Panel bracketu: szacowany poziom talii i powody (Game Changers, MLD, dodatkowe tury, kombinacje). */
export const DeckBracketPanel: React.FC<{
  deck: DeckItem;
  bracket: ReturnType<typeof useDeckBracket>;
  onViewCardByName?: (name: string) => void;
}> = ({ deck, bracket, onViewCardByName }) => {
  const [showCombos, setShowCombos] = useState(false);
  const { data, error, loading, gameChangers } = bracket;
  const tag = data?.bracketTag ? TAGS[data.bracketTag] : null;
  const gcList = [...gameChangers].sort();
  const mld = data?.cards.filter((c) => c.massLandDenial) || [];
  const extra = data?.cards.filter((c) => c.extraTurn) || [];
  const twoCard = (data?.combos || []).filter((c) => c.relevant && c.definitelyTwoCard).sort((a, b) => b.speed - a.speed);
  const otherCombos = (data?.combos || []).filter((c) => !(c.relevant && c.definitelyTwoCard));
  const fastTwoCard = twoCard.filter((c) => c.speed >= 4);
  const nameBtn = (n: string) => (
    <button key={n} type="button" onClick={() => onViewCardByName?.(n)} className="text-stone-200 hover:text-amber-300 cursor-pointer">
      {n}
    </button>
  );
  const joinNames = (names: string[]) =>
    names.map((n, i) => (
      <React.Fragment key={n}>
        {i > 0 && ', '}
        {nameBtn(n)}
      </React.Fragment>
    ));

  if (getDeckFormat(deck.format).id !== 'commander') return null;

  return (
    <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5" aria-labelledby="deck-bracket-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="deck-bracket-title" className="text-base font-semibold text-stone-50 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-stone-400" />
            Bracket talii
          </h3>
          <p className="text-sm text-stone-400 mt-0.5">Szacunek według zasad Commander Brackets, z kombinacjami z Commander Spellbook.</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" aria-label="Liczenie bracketu" />}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-5">
        {/* Wynik */}
        <div className="rounded-xl bg-stone-950/60 ring-1 ring-stone-800 p-4 flex flex-col">
          {error && !data ? (
            <div className="text-sm text-stone-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {error}
                {gcList.length > 0 && (
                  <span className="block mt-2 text-stone-400">
                    Game Changers w talii: {gcList.length}, więc co najmniej bracket {gcList.length > 3 ? '4' : '3'}.
                  </span>
                )}
              </span>
            </div>
          ) : !data ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-10 w-20 rounded-md bg-stone-800 animate-pulse" />
              <div className="h-4 w-40 rounded bg-stone-800 animate-pulse" />
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-400">Bracket</p>
              <p className="text-5xl font-semibold tracking-tight text-stone-50 tabular-nums leading-none mt-1">{tag?.range ?? '?'}</p>
              <p className="mt-2 text-sm font-medium text-amber-300">{tag?.name}</p>
              <p className="mt-1 text-sm text-stone-400">{tag?.text}</p>
            </>
          )}
        </div>

        {/* Powody */}
        <ul className="divide-y divide-stone-800 -my-2.5">
          <Row label="Game Changers" ok={gcList.length === 0} value={`${gcList.length} (bracket 3: do 3)`}>
            {gcList.length > 0 && (
              <p className="mt-1 text-sm text-stone-400 flex items-start gap-1.5">
                <Gem className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-[3px]" />
                <span>{joinNames(gcList)}</span>
              </p>
            )}
          </Row>
          <Row label="Mass land denial" ok={mld.length === 0} value={mld.length ? mld.length : 'brak'}>
            {mld.length > 0 && <p className="mt-1 text-sm text-stone-400">{joinNames(mld.map((c) => c.name))}</p>}
          </Row>
          <Row label="Karty dodatkowych tur" ok={extra.length === 0} value={extra.length ? extra.length : 'brak'}>
            {extra.length > 0 && <p className="mt-1 text-sm text-stone-400">{joinNames(extra.map((c) => c.name))}</p>}
          </Row>
          <Row
            label="Kombinacje dwóch kart"
            ok={twoCard.length === 0}
            value={twoCard.length ? `${twoCard.length}${fastTwoCard.length ? `, szybkie: ${fastTwoCard.length}` : ''}` : 'brak'}
          >
            {twoCard.length > 0 && (
              <ul className="mt-1 space-y-1">
                {twoCard.slice(0, 6).map((c) => (
                  <li key={c.id} className="text-sm text-stone-400">
                    {joinNames(c.cards)}
                    <span className="text-stone-500">
                      {' '}
                      ({SPEED_LABEL[Math.min(5, Math.max(1, c.speed))]}
                      {c.results[0] ? `, ${c.results[0]}` : ''})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
          {otherCombos.length > 0 && (
            <li className="py-2.5">
              <button
                type="button"
                onClick={() => setShowCombos((v) => !v)}
                aria-expanded={showCombos}
                className="w-full flex items-center justify-between gap-3 text-sm text-stone-300 cursor-pointer"
              >
                Inne kombinacje
                <span className="flex items-center gap-1 text-stone-400 tabular-nums">
                  {otherCombos.length}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showCombos ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {showCombos && (
                <ul className="mt-1 space-y-1">
                  {otherCombos.slice(0, 15).map((c) => (
                    <li key={c.id} className="text-sm text-stone-400">
                      {joinNames(c.cards)}
                      {c.results[0] && <span className="text-stone-500"> ({c.results[0]})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      </div>

      <p className="mt-4 text-xs text-stone-500">
        To szacunek z listy kart, a nie ocena gry. Bracket ustala się z grupą przed grą.{' '}
        <a href="https://commanderspellbook.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300 inline-flex items-center gap-0.5">
          Commander Spellbook <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </section>
  );
};

export type { ScryfallCard };
