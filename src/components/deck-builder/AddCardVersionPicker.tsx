import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Plus, Sparkles, Loader2, Check } from 'lucide-react';
import type { AppSettings, CollectionItem, DeckCardEntry, ScryfallCard } from '../../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../../utils/formatters';

interface AddCardVersionPickerProps {
  card: ScryfallCard;
  /** Dodawanie jako dowódca zamiast do 99 kart. */
  asCommander: boolean;
  collection: CollectionItem[];
  deckCards: DeckCardEntry[];
  settings?: AppSettings;
  /** Tylko wersje z kolekcji (talia budowana z własnych kart). */
  collectionOnly: boolean;
  onBack: () => void;
  onConfirm: (card: ScryfallCard, isFoil: boolean, asCommander: boolean) => void;
}

const hasFinish = (c: ScryfallCard, finish: 'foil' | 'nonfoil') => {
  if (Array.isArray(c.finishes) && c.finishes.length) return c.finishes.includes(finish) || (finish === 'foil' && c.finishes.includes('etched'));
  return finish === 'nonfoil' ? true : Boolean(c.prices?.eur_foil || c.prices?.usd_foil);
};

/**
 * Drugi krok dodawania karty do talii: wybór wydania (grafiki) i wersji Foil / Standard.
 * Wydania z kolekcji są na początku listy.
 */
export const AddCardVersionPicker: React.FC<AddCardVersionPickerProps> = ({
  card,
  asCommander,
  collection,
  deckCards,
  settings,
  collectionOnly,
  onBack,
  onConfirm
}) => {
  const owned = useMemo(
    () => collection.filter((c) => c.card.name.toLowerCase() === card.name.toLowerCase()),
    [collection, card.name]
  );
  const ownedIds = useMemo(() => new Map(owned.map((o) => [o.card.id, o])), [owned]);

  const [prints, setPrints] = useState<ScryfallCard[] | null>(null);
  const [selected, setSelected] = useState<ScryfallCard>(card);
  const [foil, setFoil] = useState(() => {
    const o = owned.find((x) => x.card.id === card.id);
    return Boolean(o && o.quantityFoil > 0 && o.quantity === 0);
  });

  useEffect(() => {
    let cancelled = false;
    setPrints(null);
    const q = new URLSearchParams();
    if (card.id) q.set('cardId', card.id);
    if (card.oracle_id) q.set('oracle_id', card.oracle_id);
    q.set('name', card.name);
    fetch(`/api/scryfall/prints?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => !cancelled && setPrints(Array.isArray(d?.data) && d.data.length ? d.data : [card]))
      .catch(() => !cancelled && setPrints([card]));
    return () => {
      cancelled = true;
    };
  }, [card]);

  // Wydania z kolekcji na początku; przy talii z kolekcji tylko one
  const list = useMemo(() => {
    const all = prints || [card];
    const mine = owned.map((o) => o.card);
    const merged = [...mine, ...all.filter((p) => !ownedIds.has(p.id))];
    return collectionOnly && mine.length ? mine : merged;
  }, [prints, card, owned, ownedIds, collectionOnly]);

  const canFoil = hasFinish(selected, 'foil');
  const canNonfoil = hasFinish(selected, 'nonfoil');
  useEffect(() => {
    if (foil && !canFoil) setFoil(false);
    if (!foil && !canNonfoil && canFoil) setFoil(true);
  }, [selected, canFoil, canNonfoil, foil]);

  const ownedSel = ownedIds.get(selected.id);
  const isBasic = /\bbasic\b/i.test(selected.type_line || '') && /\bland\b/i.test(selected.type_line || '');
  const inDeck = deckCards.find((e) => !e.isCommander && e.card.name === selected.name);
  const replacing = !asCommander && inDeck && !isBasic;
  const img = getCardImageUri(selected, 'normal');
  const price = settings ? getCardPrice(selected, foil, settings) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5">
        {/* Podgląd wybranej wersji */}
        <div className="space-y-3">
          <div className={`relative aspect-[63/88] w-40 sm:w-full mx-auto rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700 ${foil ? 'ms-foil-preview' : ''}`}>
            {img && (
              <img src={img} alt={selected.name} referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, img)} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium text-stone-100">{selected.name}</p>
            <p className="text-xs text-stone-400">
              {selected.set_name} ({selected.set.toUpperCase()}) #{selected.collector_number}
            </p>
            {settings && price > 0 && <p className="text-sm text-stone-200 tabular-nums mt-1">{formatCurrency(price, settings.currency)}</p>}
            {ownedSel && (
              <p className="text-xs text-emerald-300 mt-1">
                W kolekcji: {ownedSel.quantity} zwykłe, {ownedSel.quantityFoil} foil
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          {/* Foil / Standard */}
          <div>
            <p className="text-sm text-stone-300 mb-2">Wersja</p>
            <div className="inline-grid grid-cols-2 p-1 rounded-lg bg-stone-950 ring-1 ring-stone-800" role="radiogroup" aria-label="Wersja karty">
              {[
                { v: false, label: 'Standard', ok: canNonfoil },
                { v: true, label: 'Foil', ok: canFoil }
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={foil === o.v}
                  disabled={!o.ok}
                  onClick={() => setFoil(o.v)}
                  title={o.ok ? undefined : 'To wydanie nie występuje w tej wersji'}
                  className={`h-9 px-4 rounded-md text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                    foil === o.v ? 'bg-stone-800 text-stone-50 font-medium' : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {o.v && <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Wydania */}
          <div>
            <p className="text-sm text-stone-300 mb-2">
              Wydanie {prints && <span className="text-stone-500 tabular-nums">({list.length})</span>}
              {collectionOnly && owned.length > 0 && <span className="text-stone-500"> z Twojej kolekcji</span>}
            </p>
            {!prints ? (
              <p className="text-sm text-stone-400 flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Wczytywanie wydań…
              </p>
            ) : (
              <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[320px] overflow-y-auto pr-1 -mr-1">
                {list.map((p) => {
                  const t = getCardImageUri(p, 'small') || getCardImageUri(p, 'normal');
                  const isSel = p.id === selected.id;
                  const mine = ownedIds.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        aria-pressed={isSel}
                        title={`${p.set_name} #${p.collector_number}${p.released_at ? `, ${p.released_at.slice(0, 4)}` : ''}`}
                        className="block w-full text-left cursor-pointer"
                      >
                        <span
                          className={`relative block aspect-[63/88] rounded-md overflow-hidden bg-stone-800 ring-2 ${
                            isSel ? 'ring-amber-400' : 'ring-transparent hover:ring-stone-500'
                          }`}
                        >
                          {t && <img src={t} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                          {isSel && (
                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-amber-400 text-stone-950 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className={`mt-1 block text-xs truncate ${isSel ? 'text-amber-300' : 'text-stone-300'}`}>
                          {p.set.toUpperCase()} #{p.collector_number}
                        </span>
                        <span className={`block text-[11px] truncate ${mine ? 'text-emerald-400' : 'text-stone-500'}`}>
                          {mine ? 'W kolekcji' : p.released_at?.slice(0, 4) || p.set_name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 p-4 border-t border-stone-800">
        <button type="button" onClick={onBack} className="btn btn-ghost">
          <ArrowLeft className="w-4 h-4" />
          Wróć do wyników
        </button>
        <p className="sm:ml-auto text-xs text-stone-500 sm:text-right">
          {replacing ? 'Ta karta już jest w talii. Zmienimy jej wersję.' : ''}
        </p>
        <button type="button" onClick={() => onConfirm(selected, foil, asCommander)} className="btn btn-primary">
          {asCommander ? <Crown className="w-4 h-4" /> : <Plus className="w-4 h-4" strokeWidth={2.5} />}
          {asCommander ? 'Ustaw jako dowódcę' : replacing ? 'Zmień wersję' : 'Dodaj do talii'}
        </button>
      </div>
    </div>
  );
};
