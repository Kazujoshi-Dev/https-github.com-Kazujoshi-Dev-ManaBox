import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, ArrowRight, Repeat } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError } from '../../utils/formatters';
import type { EdhrecRecommendation } from '../../services/api';
import { getCardCategory, DECK_CATEGORIES } from './constants';
import { useBackToClose } from '../../hooks/useBackButton';

interface ReplaceCardModalProps {
  deck: DeckItem;
  incoming: EdhrecRecommendation;
  /** Popularność kart z talii wg EDHREC (nazwa małymi literami → 0..1). */
  inclusionByName: Map<string, number>;
  onConfirm: (oldCard: ScryfallCard) => void;
  onClose: () => void;
}

const frontName = (name: string) => name.split('//')[0].trim().toLowerCase();
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Wybór karty z talii, którą zastąpi karta z rekomendacji. Karty pokazane jak w talii (obrazki),
 * najpierw ten sam typ co nowa karta, w kolejności od najrzadziej granych z tym dowódcą.
 */
export const ReplaceCardModal: React.FC<ReplaceCardModalProps> = ({ deck, incoming, inclusionByName, onConfirm, onClose }) => {
  useBackToClose(true, onClose);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ScryfallCard | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const incomingCategory = incoming.card ? getCardCategory(incoming.card) : null;
  const incomingImg = incoming.card ? getCardImageUri(incoming.card, 'normal') : '';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const entries = deck.cards.filter((e) => !e.isCommander && !e.isSideboard && (!q || e.card.name.toLowerCase().includes(q)));
    const byCat = new Map<string, typeof entries>();
    for (const e of entries) {
      const cat = getCardCategory(e.card);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(e);
    }
    const order = DECK_CATEGORIES.map((c) => c.id).sort((a, b) => (a === incomingCategory ? -1 : b === incomingCategory ? 1 : 0));
    return order
      .filter((id) => byCat.has(id))
      .map((id) => ({
        id,
        name: DECK_CATEGORIES.find((c) => c.id === id)?.name || id,
        entries: byCat.get(id)!.sort(
          (a, b) => (inclusionByName.get(frontName(a.card.name)) ?? 0) - (inclusionByName.get(frontName(b.card.name)) ?? 0) || a.card.name.localeCompare(b.card.name)
        )
      }));
  }, [deck.cards, query, incomingCategory, inclusionByName]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Zastąp kartę kartą ${incoming.name}`}
    >
      <div className="w-full sm:max-w-5xl max-h-[92dvh] bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]">
        {/* Nagłówek: co wchodzi do talii */}
        <div className="flex items-center gap-4 p-4 sm:p-5 border-b border-stone-800">
          <span className="w-12 shrink-0 aspect-[63/88] rounded-md overflow-hidden bg-stone-800 ring-1 ring-stone-700">
            {incomingImg && <img src={incomingImg} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-stone-50 truncate">Zastąp kartą {incoming.name}</h3>
            <p className="text-sm text-stone-400">
              Wybierz kartę z talii, która ustąpi miejsca. Na górze karty typu {incomingCategory || 'tej samej kategorii'}, od najrzadziej granych.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="w-10 h-10 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center shrink-0 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 pt-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj w talii"
              aria-label="Szukaj karty w talii"
              className="w-full h-10 bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-stone-600"
            />
          </div>
        </div>

        {/* Karty talii */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          {groups.length === 0 && <p className="text-sm text-stone-400">Brak kart pasujących do wyszukiwania.</p>}
          {groups.map((g) => (
            <section key={g.id}>
              <h4 className="text-sm font-medium text-stone-300 mb-2">
                {g.name} <span className="text-stone-500 tabular-nums">{g.entries.length}</span>
              </h4>
              <ul className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {g.entries.map((e) => {
                  const img = getCardImageUri(e.card, 'normal');
                  const inc = inclusionByName.get(frontName(e.card.name));
                  const isSel = selected?.id === e.card.id;
                  return (
                    <li key={e.card.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(isSel ? null : e.card)}
                        aria-pressed={isSel}
                        title={e.card.name}
                        className={`group relative block w-full aspect-[63/88] rounded-lg overflow-hidden bg-stone-800 cursor-pointer ring-2 ${
                          isSel ? 'ring-amber-400' : 'ring-transparent hover:ring-stone-500'
                        }`}
                      >
                        {img ? (
                          <img src={img} alt={e.card.name} loading="lazy" referrerPolicy="no-referrer" onError={(ev) => handleCardImageError(ev, img)} className="w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 p-2 text-xs text-stone-300">{e.card.name}</span>
                        )}
                        {isSel && <span className="absolute inset-0 bg-amber-400/15" aria-hidden="true" />}
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-1 bg-gradient-to-t from-stone-950/95 to-transparent text-[11px]">
                          {e.quantity > 1 ? <span className="text-stone-100 tabular-nums">{e.quantity}×</span> : <span />}
                          {inc !== undefined && (
                            <span className={`tabular-nums ${inc < 0.1 ? 'text-rose-300' : 'text-stone-300'}`} title="Ile talii z tym dowódcą gra tę kartę (EDHREC)">
                              {pct(inc)}
                            </span>
                          )}
                        </span>
                      </button>
                      <p className={`mt-1 text-xs truncate ${isSel ? 'text-amber-300' : 'text-stone-400'}`} title={e.card.name}>
                        {e.card.name}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Potwierdzenie */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:px-5 border-t border-stone-800">
          <p className="text-sm text-stone-400 flex-1 min-w-0 truncate">
            {selected ? (
              <>
                <span className="text-stone-100">{selected.name}</span>
                <ArrowRight className="inline w-4 h-4 mx-1.5 -mt-0.5 text-stone-500" />
                <span className="text-stone-100">{incoming.name}</span>
              </>
            ) : (
              'Kliknij kartę, którą chcesz usunąć z talii.'
            )}
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Anuluj
            </button>
            <button type="button" disabled={!selected} onClick={() => selected && onConfirm(selected)} className="btn btn-primary">
              <Repeat className="w-4 h-4" />
              Zastąp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
