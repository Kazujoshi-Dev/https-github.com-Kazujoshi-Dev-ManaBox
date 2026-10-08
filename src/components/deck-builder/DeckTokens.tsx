import React, { useEffect, useMemo, useState } from 'react';
import { Layers3 } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';
import { handleCardImageError } from '../../utils/formatters';
import { useT } from '../../i18n';

interface DeckToken {
  key: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  oracleText?: string;
  colors: string[];
  image: string | null;
  card: ScryfallCard | null;
  sources: string[];
}

const TOKEN_TINT: Record<string, string> = {
  W: 'from-[#f4ecd2]/20',
  U: 'from-blue-500/20',
  B: 'from-stone-950',
  R: 'from-red-500/20',
  G: 'from-emerald-500/20'
};

/** Tokeny, które mogą stworzyć karty z talii (dane z lokalnej bazy kart Scryfall). */
export const DeckTokens: React.FC<{ deck: DeckItem; onViewCardDetails: (card: ScryfallCard) => void }> = ({ deck, onViewCardDetails }) => {
  const t = useT();
  const { ids, names, key } = useMemo(() => {
    const all = [...(deck.commander ? [deck.commander] : []), ...deck.cards.filter((e) => !e.isSideboard).map((e) => e.card)];
    const ids = [...new Set(all.map((c) => c.id))];
    const names = [...new Set(all.map((c) => c.name))];
    return { ids, names, key: ids.slice().sort().join(',') };
  }, [deck]);

  const [tokens, setTokens] = useState<DeckToken[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ids.length) {
      setTokens([]);
      return;
    }
    let cancelled = false;
    setFailed(false);
    // Krótkie opóźnienie: przy szybkim dodawaniu kart nie pytamy serwera po każdej zmianie
    const timer = setTimeout(() => {
      fetch('/api/cards/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, names })
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => !cancelled && setTokens(Array.isArray(d?.tokens) ? d.tokens : []))
        .catch(() => !cancelled && setFailed(true));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <section className="bg-stone-900 border border-stone-800 rounded-xl p-4 sm:p-5" aria-labelledby="deck-tokens-title">
      <h3 id="deck-tokens-title" className="text-base font-semibold text-stone-50 flex items-center gap-2">
        <Layers3 className="w-4 h-4 text-stone-400" />
        {t('Tokeny')}
        {tokens && tokens.length > 0 && <span className="text-sm font-normal text-stone-500 tabular-nums">{tokens.length}</span>}
      </h3>
      <p className="text-sm text-stone-400 mt-0.5 mb-4">{t('Tokeny, które mogą stworzyć karty z talii. Przyda się, gdy szykujesz je do gry.')}</p>

      {failed ? (
        <p className="text-sm text-stone-400">{t('Nie udało się wczytać tokenów. Odśwież stronę, aby spróbować ponownie.')}</p>
      ) : tokens === null ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[63/88] rounded-lg bg-stone-800/60 animate-pulse" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-stone-400">{t('Karty w talii nie tworzą tokenów.')}</p>
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-x-3 gap-y-4">
          {tokens.map((tok) => {
            const pt = tok.power != null && tok.toughness != null ? `${tok.power}/${tok.toughness}` : null;
            const tint = TOKEN_TINT[tok.colors[0]] || 'from-stone-700/40';
            const sourcesLabel = tok.sources.length > 1 ? `${tok.sources[0]} (+${tok.sources.length - 1})` : tok.sources[0];
            return (
              <li key={tok.key} className="min-w-0">
                <button
                  type="button"
                  onClick={() => tok.card && onViewCardDetails(tok.card)}
                  disabled={!tok.card}
                  title={t('{name}{v2}\nTworzą: {v3}', { name: tok.name, v2: pt ? ` ${pt}` : '', v3: tok.sources.join(', ') })}
                  className="group block w-full text-left cursor-pointer disabled:cursor-default"
                >
                  <span className="relative block aspect-[63/88] rounded-lg overflow-hidden bg-stone-800 ring-1 ring-stone-700 group-hover:ring-amber-400 group-disabled:ring-stone-700">
                    {tok.image ? (
                      <img
                        src={tok.image}
                        alt={tok.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleCardImageError(e, tok.image!)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className={`absolute inset-0 bg-gradient-to-b ${tint} to-stone-900 p-2.5 flex flex-col`}>
                        <span className="text-sm font-medium text-stone-100 leading-tight">{tok.name}</span>
                        <span className="text-[11px] text-stone-400 leading-tight mt-0.5">{tok.typeLine}</span>
                        {pt && <span className="mt-auto self-end text-base font-semibold text-stone-50 tabular-nums">{pt}</span>}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block text-sm text-stone-100 truncate">
                    {tok.name}
                    {pt && <span className="text-stone-400 tabular-nums"> {pt}</span>}
                  </span>
                  <span className="block text-xs text-stone-500 truncate">z {sourcesLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
