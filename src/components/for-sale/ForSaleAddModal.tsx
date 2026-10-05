import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, ArrowLeft, CircleDollarSign, Minus, Plus, Sparkles } from 'lucide-react';
import type { AppSettings, CardCondition, CardLanguage, CollectionItem, ScryfallCard } from '../../types';
import { AddCardVersionPicker } from '../deck-builder/AddCardVersionPicker';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError, langFromCard } from '../../utils/formatters';
import { useBackToClose } from '../../hooks/useBackButton';

export interface ForSaleAddData {
  card: ScryfallCard;
  quantity: number;
  isFoil: boolean;
  condition: CardCondition;
  language: CardLanguage;
  salePrice: number | null;
}

interface ForSaleAddModalProps {
  collection: CollectionItem[];
  settings: AppSettings;
  onClose: () => void;
  onAdd: (data: ForSaleAddData) => Promise<boolean>;
}

const CONDITIONS: Array<{ id: CardCondition; label: string }> = [
  { id: 'NM', label: 'NM (Near Mint)' },
  { id: 'EX', label: 'EX (Excellent)' },
  { id: 'GD', label: 'GD (Good)' },
  { id: 'LP', label: 'LP (Light Played)' },
  { id: 'PL', label: 'PL (Played)' }
];

const LANGUAGES: Array<{ id: CardLanguage; label: string }> = [
  { id: 'EN', label: 'Angielski' },
  { id: 'PL', label: 'Polski' },
  { id: 'DE', label: 'Niemiecki' },
  { id: 'FR', label: 'Francuski' },
  { id: 'IT', label: 'Włoski' },
  { id: 'ES', label: 'Hiszpański' },
  { id: 'JP', label: 'Japoński' },
  { id: 'OTHER', label: 'Inny' }
];

type Step = { kind: 'search' } | { kind: 'version'; card: ScryfallCard } | { kind: 'details'; card: ScryfallCard; isFoil: boolean };

/**
 * Wystawianie karty na sprzedaż prosto z wyszukiwarki wszystkich kart:
 * wyszukanie → wydanie i foil → ilość, stan, język i cena.
 */
export const ForSaleAddModal: React.FC<ForSaleAddModalProps> = ({ collection, settings, onClose, onAdd }) => {
  useBackToClose(true, onClose);
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const searchId = useRef(0);

  // Szczegóły oferty
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [language, setLanguage] = useState<CardLanguage>('EN');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Wyszukiwanie we wszystkich kartach (z opóźnieniem, ostatnie zapytanie wygrywa)
  useEffect(() => {
    const q = query.trim();
    const id = ++searchId.current;
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : { data: [] };
        if (id !== searchId.current) return;
        const seen = new Set<string>();
        const list: ScryfallCard[] = [];
        for (const c of (Array.isArray(data?.data) ? data.data : []) as ScryfallCard[]) {
          const key = c.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          list.push(c);
        }
        setResults(list.slice(0, 30));
      } catch {
        if (id === searchId.current) setResults([]);
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [query]);

  const ownedByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collection) {
      const k = c.card.name.toLowerCase();
      m.set(k, (m.get(k) || 0) + c.quantity + c.quantityFoil);
    }
    return m;
  }, [collection]);

  const goDetails = (card: ScryfallCard, isFoil: boolean) => {
    setQuantity(1);
    setCondition('NM');
    setLanguage(langFromCard(card));
    setPrice('');
    setStep({ kind: 'details', card, isFoil });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'details') return;
    const parsed = price.trim() ? Number(price.replace(',', '.')) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSaving(true);
    const ok = await onAdd({ card: step.card, quantity, isFoil: step.isFoil, condition, language, salePrice: parsed });
    setSaving(false);
    if (ok) {
      // Gotowe na następną kartę
      setStep({ kind: 'search' });
      setQuery('');
    }
  };

  const title =
    step.kind === 'search' ? 'Dodaj kartę na sprzedaż' : step.kind === 'version' ? `Wybierz wersję: ${step.card.name}` : 'Szczegóły oferty';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[88vh] bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 p-4 border-b border-stone-800">
          <CircleDollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
          <h3 className="text-base font-semibold text-stone-50 truncate flex-1">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="w-9 h-9 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step.kind === 'search' && (
          <>
            <div className="p-4 border-b border-stone-800">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Wpisz nazwę karty, np. Sol Ring"
                  aria-label="Szukaj karty"
                  className="w-full h-11 bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <p className="text-xs text-stone-500 mt-2">Szukasz we wszystkich kartach Magic: The Gathering, nie musisz mieć karty w kolekcji.</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3">
              {searching && (
                <p className="text-sm text-stone-400 flex items-center gap-2 p-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Szukanie…
                </p>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && <p className="text-sm text-stone-400 p-3">Nie znaleziono kart o tej nazwie.</p>}
              {!searching && query.trim().length < 2 && <p className="text-sm text-stone-500 p-3">Wpisz co najmniej 2 znaki.</p>}
              <ul className="divide-y divide-stone-800/70">
                {results.map((card) => {
                  const img = getCardImageUri(card, 'small') || getCardImageUri(card, 'normal');
                  const owned = ownedByName.get(card.name.toLowerCase()) || 0;
                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => setStep({ kind: 'version', card })}
                        className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-stone-800/70 cursor-pointer"
                      >
                        <span className="w-10 shrink-0 aspect-[63/88] rounded overflow-hidden bg-stone-800">
                          {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => handleCardImageError(ev, img)} className="w-full h-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-stone-100 truncate">{card.name}</span>
                          <span className="block text-xs text-stone-500 truncate">{card.type_line}</span>
                        </span>
                        {owned > 0 && <span className="text-xs text-emerald-300 shrink-0">W kolekcji: {owned}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {step.kind === 'version' && (
          <AddCardVersionPicker
            card={step.card}
            asCommander={false}
            collection={collection}
            deckCards={[]}
            settings={settings}
            collectionOnly={false}
            confirmLabel="Dalej"
            onBack={() => setStep({ kind: 'search' })}
            onConfirm={(card, isFoil) => goDetails(card, isFoil)}
          />
        )}

        {step.kind === 'details' && (
          <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5">
              <div className="flex sm:block gap-3 items-start">
                <span className={`block w-24 sm:w-full shrink-0 aspect-[63/88] rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700 ${step.isFoil ? 'ms-foil-preview' : ''}`}>
                  {getCardImageUri(step.card, 'normal') && (
                    <img src={getCardImageUri(step.card, 'normal')} alt={step.card.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  )}
                </span>
                <div className="sm:mt-3 min-w-0">
                  <p className="text-sm font-medium text-stone-100">{step.card.name}</p>
                  <p className="text-xs text-stone-400">
                    {step.card.set_name} ({step.card.set.toUpperCase()}) #{step.card.collector_number}
                  </p>
                  {step.isFoil && (
                    <p className="text-xs text-amber-300 flex items-center gap-1 mt-0.5">
                      <Sparkles className="w-3 h-3" /> Foil
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-stone-300 mb-1.5">Ilość</label>
                  <div className="inline-flex items-center rounded-lg bg-stone-950 ring-1 ring-stone-800">
                    <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Mniej" className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                      aria-label="Ilość"
                      className="w-14 h-10 bg-transparent text-center text-sm text-stone-100 tabular-nums focus:outline-none"
                    />
                    <button type="button" onClick={() => setQuantity((q) => Math.min(999, q + 1))} aria-label="Więcej" className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="fs-cond" className="block text-sm text-stone-300 mb-1.5">Stan</label>
                    <select id="fs-cond" value={condition} onChange={(e) => setCondition(e.target.value as CardCondition)} className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-2.5 text-sm text-stone-100">
                      {CONDITIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fs-lang" className="block text-sm text-stone-300 mb-1.5">Język</label>
                    <select id="fs-lang" value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage)} className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-2.5 text-sm text-stone-100">
                      {LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="fs-price" className="block text-sm text-stone-300 mb-1.5">Cena za sztukę ({settings.currency})</label>
                  <input
                    id="fs-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                    placeholder={`Cena rynkowa: ${formatCurrency(getCardPrice(step.card, step.isFoil, settings), settings.currency)}`}
                    className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500 tabular-nums"
                  />
                  <p className="text-xs text-stone-500 mt-1.5">Zostaw puste, aby sprzedawać po aktualnej cenie rynkowej.</p>
                </div>

                <p className="text-xs text-stone-500">Karta trafi do Twojej kolekcji, do kategorii „Sprzedam”.</p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 p-4 border-t border-stone-800">
              <button type="button" onClick={() => setStep({ kind: 'version', card: step.card })} className="btn btn-ghost">
                <ArrowLeft className="w-4 h-4" />
                Zmień wersję
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary sm:ml-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
                Wystaw na sprzedaż
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForSaleAddModal;
