import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Plus, Sparkles, Loader2, Check, Search, X } from 'lucide-react';
import type { AppSettings, CollectionItem, DeckCardEntry, ScryfallCard } from '../../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError, langFromCard } from '../../utils/formatters';

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
  /** Własny napis na przycisku potwierdzenia (poza talią). */
  confirmLabel?: string;
  /** Talia singleton (Commander, Brawl): ponowne dodanie karty zmienia jej wersję zamiast dodawać kopię. */
  singleton?: boolean;
  /** Jakie wydania pokazywać: papierowe (domyślnie) albo dostępne w MTG Arena. */
  game?: 'paper' | 'arena';
}

/**
 * Filtr wydań: każde słowo musi pasować do kodu dodatku, numeru karty lub nazwy dodatku.
 * Np. „dsc 114”, „#114”, „sld”, „duskmourn”, „dsc/114”.
 */
function matchesPrint(p: ScryfallCard, query: string): boolean {
  const tokens = query.toLowerCase().replace(/[#/,]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const set = (p.set || '').toLowerCase();
  const num = (p.collector_number || '').toLowerCase();
  const numBare = num.replace(/^0+(?=\d)/, '');
  const setName = (p.set_name || '').toLowerCase();
  return tokens.every((t) => {
    const tb = t.replace(/^0+(?=\d)/, '');
    return set === t || set.startsWith(t) || num === t || numBare === tb || num.startsWith(t) || setName.includes(t);
  });
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
  onConfirm,
  confirmLabel,
  singleton = true,
  game = 'paper'
}) => {
  const owned = useMemo(
    () => collection.filter((c) => c.card.name.toLowerCase() === card.name.toLowerCase()),
    [collection, card.name]
  );
  const ownedIds = useMemo(() => new Map(owned.map((o) => [o.card.id, o])), [owned]);

  const [prints, setPrints] = useState<ScryfallCard[] | null>(null);
  const [printFilter, setPrintFilter] = useState('');
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
    if (game !== 'paper') q.set('game', game);
    fetch(`/api/scryfall/prints?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => !cancelled && setPrints(Array.isArray(d?.data) && d.data.length ? d.data : [card]))
      .catch(() => !cancelled && setPrints([card]));
    return () => {
      cancelled = true;
    };
  }, [card, game]);

  // Wydania z kolekcji na początku; przy talii z kolekcji tylko one
  const list = useMemo(() => {
    const all = prints || [card];
    const mine = owned.map((o) => o.card);
    const merged = [...mine, ...all.filter((p) => !ownedIds.has(p.id))];
    return collectionOnly && mine.length ? mine : merged;
  }, [prints, card, owned, ownedIds, collectionOnly]);

  // Wydania po filtrze; dokładne trafienie kodu i numeru (np. „dsc 114”) na początku
  const shown = useMemo(() => {
    const q = printFilter.trim();
    if (!q) return list;
    const out = list.filter((p) => matchesPrint(p, q));
    const [a, b] = q.toLowerCase().replace(/[#/,]/g, ' ').split(/\s+/).filter(Boolean);
    const exact = (p: ScryfallCard) => (p.set || '').toLowerCase() === a && (p.collector_number || '').toLowerCase().replace(/^0+(?=\d)/, '') === (b || '').replace(/^0+(?=\d)/, '');
    return b ? [...out.filter(exact), ...out.filter((p) => !exact(p))] : out;
  }, [list, printFilter]);

  // Jedno pasujące wydanie: od razu je zaznaczamy
  useEffect(() => {
    if (printFilter.trim() && shown.length === 1 && shown[0].id !== selected.id) setSelected(shown[0]);
  }, [shown, printFilter, selected.id]);

  const canFoil = hasFinish(selected, 'foil');
  const canNonfoil = hasFinish(selected, 'nonfoil');
  useEffect(() => {
    if (foil && !canFoil) setFoil(false);
    if (!foil && !canNonfoil && canFoil) setFoil(true);
  }, [selected, canFoil, canNonfoil, foil]);

  const ownedSel = ownedIds.get(selected.id);
  const isBasic = /\bbasic\b/i.test(selected.type_line || '') && /\bland\b/i.test(selected.type_line || '');
  const inDeck = deckCards.find((e) => !e.isCommander && e.card.name === selected.name);
  const replacing = singleton && !asCommander && inDeck && !isBasic;
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
              {selected.lang && selected.lang !== 'en' && <>, język {langFromCard(selected)}</>}
            </p>
            {selected.printed_name && selected.printed_name !== selected.name && (
              <p className="text-xs text-stone-500">{selected.printed_name}</p>
            )}
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm text-stone-300">
                Wydanie{' '}
                {prints && (
                  <span className="text-stone-500 tabular-nums">
                    ({printFilter.trim() ? `${shown.length} z ${list.length}` : list.length})
                  </span>
                )}
                {collectionOnly && owned.length > 0 && <span className="text-stone-500"> z Twojej kolekcji</span>}
              </p>
              {prints && list.length > 1 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={printFilter}
                    onChange={(e) => setPrintFilter(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter przy jednym pasującym wydaniu = potwierdzenie
                      if (e.key === 'Enter' && shown.length === 1) {
                        e.preventDefault();
                        onConfirm(shown[0], foil && hasFinish(shown[0], 'foil'), asCommander);
                      }
                    }}
                    placeholder="Kod setu i numer, np. DSC 114"
                    aria-label="Filtruj wydania po kodzie dodatku, numerze karty lub nazwie dodatku"
                    autoComplete="off"
                    className="w-full h-9 bg-stone-950 border border-stone-800 rounded-lg pl-8 pr-8 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                  {printFilter && (
                    <button type="button" onClick={() => setPrintFilter('')} aria-label="Wyczyść filtr" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center text-stone-400 hover:text-stone-100 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {!prints ? (
              <p className="text-sm text-stone-400 flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Wczytywanie wydań…
              </p>
            ) : (
              <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[320px] overflow-y-auto pr-1 -mr-1">
                {shown.map((p) => {
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
                          {p.lang && p.lang !== 'en' && (
                            <span className="ml-1 px-1 rounded bg-stone-700 text-stone-100 text-[11px]">{langFromCard(p)}</span>
                          )}
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
            {prints && printFilter.trim() && shown.length === 0 && (
              <p className="text-sm text-stone-400 py-3">Brak wydań pasujących do „{printFilter.trim()}”. Sprawdź kod dodatku i numer z dołu karty.</p>
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
          {confirmLabel || (asCommander ? 'Ustaw jako dowódcę' : replacing ? 'Zmień wersję' : 'Dodaj do talii')}
        </button>
      </div>
    </div>
  );
};
