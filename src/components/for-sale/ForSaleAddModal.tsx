import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, ArrowLeft, CircleDollarSign, Minus, Plus, Sparkles, FolderOpen, Globe, Library } from 'lucide-react';
import { isDigitalOnly } from '../../utils/mtgFormats';
import type { AppSettings, CardCondition, CardLanguage, CollectionItem, ScryfallCard } from '../../types';
import { AddCardVersionPicker } from '../deck-builder/AddCardVersionPicker';
import { formatCurrency, getCardImageUri, getCardPrice, getSaleMarketPrice, getSaleAdjustPct, formatSaleAdjustPct, handleCardImageError, langFromCard } from '../../utils/formatters';
import { useBackToClose } from '../../hooks/useBackButton';
import { useT, tk, binderName, MAIN_BINDER } from '../../i18n';
import { getActiveGame } from '../../utils/activeGame';
import { fetchFullCard, fillPartialCards, mergeFullCards, searchUrl } from '../../utils/cardSource';

export interface ForSaleAddData {
  card: ScryfallCard;
  quantity: number;
  isFoil: boolean;
  condition: CardCondition;
  language: CardLanguage;
  salePrice: number | null;
  /** Podkategoria „Sprzedam” (null = lista główna); brak pola = bez zmiany podkategorii. */
  saleFolderId?: string | null;
}

interface ForSaleAddModalProps {
  collection: CollectionItem[];
  settings: AppSettings;
  onClose: () => void;
  onAdd: (data: ForSaleAddData) => Promise<boolean>;
  /** Podkategoria, do której trafią karty (null = lista główna). Bez pola okno nie zmienia podkategorii. */
  targetFolder?: { id: string; name: string } | null;
  /** Przeniesienie egzemplarzy z kolekcji na sprzedaż; bez tej funkcji okno szuka tylko we wszystkich kartach. */
  onListFromCollection?: (item: CollectionItem, quantity: number, isFoil: boolean, salePrice: number | null, saleFolderId: string | null) => Promise<boolean>;
}

type Source = 'all' | 'owned';
const qtyOf = (i: CollectionItem) => (i.quantity || 0) + (i.quantityFoil || 0);

const CONDITIONS: Array<{ id: CardCondition; label: string }> = [
  { id: 'NM', label: 'NM (Near Mint)' },
  { id: 'EX', label: 'EX (Excellent)' },
  { id: 'GD', label: 'GD (Good)' },
  { id: 'LP', label: 'LP (Light Played)' },
  { id: 'PL', label: 'PL (Played)' }
];

const LANGUAGES: Array<{ id: CardLanguage; label: string }> = [
  { id: 'EN', label: tk('Angielski') },
  { id: 'PL', label: tk('Polski') },
  { id: 'DE', label: tk('Niemiecki') },
  { id: 'FR', label: tk('Francuski') },
  { id: 'IT', label: tk('Włoski') },
  { id: 'ES', label: tk('Hiszpański') },
  { id: 'JP', label: tk('Japoński') },
  { id: 'PH', label: 'Phyrexian' },
  { id: 'OTHER', label: tk('Inny') }
];

type Step =
  | { kind: 'search' }
  | { kind: 'version'; card: ScryfallCard }
  | { kind: 'details'; card: ScryfallCard; isFoil: boolean }
  | { kind: 'owned'; item: CollectionItem; isFoil: boolean };

/**
 * Wystawianie karty na sprzedaż prosto z wyszukiwarki wszystkich kart:
 * wyszukanie → wydanie i foil → ilość, stan, język i cena.
 */
export const ForSaleAddModal: React.FC<ForSaleAddModalProps> = ({ collection, settings, onClose, onAdd, targetFolder, onListFromCollection }) => {
  const t = useT();
  useBackToClose(true, onClose);
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [source, setSource] = useState<Source>('all');
  const folderId = targetFolder === undefined ? undefined : targetFolder?.id ?? null;
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
    if (q.length < 2 || source !== 'all') {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(searchUrl(getActiveGame(), q));
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
        fillPartialCards(list.slice(0, 30), (full) => setResults((prev) => mergeFullCards(prev, full)), () => id !== searchId.current, 24);
      } catch {
        if (id === searchId.current) setResults([]);
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, source]);

  // Karty z kolekcji, które można przenieść na sprzedaż (bez już wystawionych i tylko cyfrowych)
  const ownedResults = useMemo(() => {
    if (source !== 'owned') return [];
    const q = query.trim().toLowerCase();
    return collection
      .filter((i) => !i.isForSale && qtyOf(i) > 0 && !isDigitalOnly(i.card))
      .filter((i) => !q || i.card.name.toLowerCase().includes(q) || i.card.set?.toLowerCase() === q || (i.card.set_name || '').toLowerCase().includes(q))
      .sort((a, b) => a.card.name.localeCompare(b.card.name))
      .slice(0, 80);
  }, [collection, query, source]);

  const goOwned = (item: CollectionItem) => {
    const isFoil = (item.quantity || 0) === 0;
    setQuantity(1);
    setPrice(item.salePrice != null ? String(item.salePrice) : '');
    setStep({ kind: 'owned', item, isFoil });
  };

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
    // Pokémon: karta z wyszukiwarki nie ma jeszcze ceny, uzupełniamy ją w tle
    if (card.partial) {
      fetchFullCard(card).then((full) => {
        if (!full.partial) setStep((s) => (s.kind === 'details' && s.card.id === full.id ? { ...s, card: full } : s));
      });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'details') return;
    const parsed = price.trim() ? Number(price.replace(',', '.')) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSaving(true);
    const ok = await onAdd({ card: step.card, quantity, isFoil: step.isFoil, condition, language, salePrice: parsed, ...(folderId !== undefined ? { saleFolderId: folderId } : {}) });
    setSaving(false);
    if (ok) {
      // Gotowe na następną kartę
      setStep({ kind: 'search' });
      setQuery('');
    }
  };

  const submitOwned = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'owned' || !onListFromCollection) return;
    const parsed = price.trim() ? Number(price.replace(',', '.')) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSaving(true);
    const max = step.isFoil ? step.item.quantityFoil : step.item.quantity;
    const ok = await onListFromCollection(step.item, Math.max(1, Math.min(quantity, max)), step.isFoil, parsed, folderId ?? null);
    setSaving(false);
    if (ok) setStep({ kind: 'search' });
  };

  const title =
    step.kind === 'search'
      ? targetFolder
        ? t('Dodaj kartę do „{name}”', { name: targetFolder.name })
        : t('Dodaj kartę na sprzedaż')
      : step.kind === 'version'
        ? t('Wybierz wersję: {name}', { name: step.card.name })
        : t('Szczegóły oferty');

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
          <button type="button" onClick={onClose} aria-label={t('Zamknij')} className="w-9 h-9 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
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
                  placeholder={t('Wpisz nazwę karty, np. Sol Ring')}
                  aria-label={t('Szukaj karty')}
                  className="w-full h-11 bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              {onListFromCollection && (
                <div role="tablist" aria-label={t('Skąd dodać kartę')} className="mt-3 inline-flex rounded-lg bg-stone-950 ring-1 ring-stone-800 p-0.5">
                  {([
                    ['all', t('Wszystkie karty'), Globe],
                    ['owned', t('Z mojej kolekcji'), Library]
                  ] as const).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={source === id}
                      onClick={() => setSource(id)}
                      className={`h-8 px-3 rounded-md text-sm flex items-center gap-1.5 cursor-pointer ${
                        source === id ? 'bg-stone-800 text-stone-50' : 'text-stone-400 hover:text-stone-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-stone-500 mt-2">
                {source === 'owned'
                  ? t('Wybrana karta zostanie przeniesiona z katalogu na sprzedaż, do kolekcji nic nie dochodzi.')
                  : t('Szukasz we wszystkich kartach Magic: The Gathering, nie musisz mieć karty w kolekcji.')}
              </p>
              {targetFolder && (
                <p className="text-xs text-amber-300/90 mt-1.5 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" /> {t('Karty trafią do podkategorii „{name}”.', { name: targetFolder.name })}
                </p>
              )}
            </div>
            {source === 'owned' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3">
                {ownedResults.length === 0 && (
                  <p className="text-sm text-stone-400 p-3">
                    {query.trim() ? t('Nie masz w kolekcji takiej karty poza ofertą.') : t('W kolekcji nie ma kart, które można wystawić.')}
                  </p>
                )}
                <ul className="divide-y divide-stone-800/70">
                  {ownedResults.map((item) => {
                    const img = getCardImageUri(item.card, 'small') || getCardImageUri(item.card, 'normal');
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => goOwned(item)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-stone-800/70 cursor-pointer"
                        >
                          <span className="w-10 shrink-0 aspect-[488/680] rounded overflow-hidden bg-stone-800">
                            {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => handleCardImageError(ev, img)} className="w-full h-full object-contain" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-stone-100 truncate">{item.card.name}</span>
                            <span className="block text-xs text-stone-500 truncate">
                              {[`${item.card.set?.toUpperCase() || ''} #${item.card.collector_number || ''}`, item.condition, item.language, binderName(item.binder || MAIN_BINDER)].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className="text-xs text-stone-300 shrink-0 tabular-nums text-right">
                            {item.quantity > 0 && <span className="block">{item.quantity} {t('szt.')}</span>}
                            {item.quantityFoil > 0 && <span className="block text-amber-300">{item.quantityFoil} {t('Foil')}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3">
              {searching && (
                <p className="text-sm text-stone-400 flex items-center gap-2 p-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('Szukanie…')}
                </p>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && <p className="text-sm text-stone-400 p-3">{t('Nie znaleziono kart o tej nazwie.')}</p>}
              {!searching && query.trim().length < 2 && <p className="text-sm text-stone-500 p-3">{t('Wpisz co najmniej 2 znaki.')}</p>}
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
                        <span className="w-10 shrink-0 aspect-[488/680] rounded overflow-hidden bg-stone-800">
                          {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(ev) => handleCardImageError(ev, img)} className="w-full h-full object-contain" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-stone-100 truncate">{card.name}</span>
                          <span className="block text-xs text-stone-500 truncate">{card.type_line}</span>
                        </span>
                        {owned > 0 && <span className="text-xs text-emerald-300 shrink-0">{t('W kolekcji:')} {owned}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            )}
          </>
        )}

        {step.kind === 'owned' && (() => {
          const item = step.item;
          const max = step.isFoil ? item.quantityFoil : item.quantity;
          const hasBoth = item.quantity > 0 && item.quantityFoil > 0;
          const img = getCardImageUri(item.card, 'normal');
          return (
            <form onSubmit={submitOwned} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5">
                <div className="flex sm:block gap-3 items-start">
                  <span className={`block w-24 sm:w-full shrink-0 aspect-[488/680] rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700 ${step.isFoil ? 'ms-foil-preview' : ''}`}>
                    {img && <img src={img} alt={item.card.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" />}
                  </span>
                  <div className="sm:mt-3 min-w-0">
                    <p className="text-sm font-medium text-stone-100">{item.card.name}</p>
                    <p className="text-xs text-stone-400">
                      {item.card.set_name} ({item.card.set?.toUpperCase()}) #{item.card.collector_number}
                    </p>
                    <p className="text-xs text-stone-500">{[item.condition, item.language, binderName(item.binder || MAIN_BINDER)].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {hasBoth && (
                    <div className="inline-flex rounded-lg bg-stone-950 ring-1 ring-stone-800 p-0.5">
                      {[false, true].map((foil) => (
                        <button
                          key={String(foil)}
                          type="button"
                          onClick={() => {
                            setStep({ kind: 'owned', item, isFoil: foil });
                            setQuantity(1);
                          }}
                          className={`h-8 px-3 rounded-md text-sm cursor-pointer ${step.isFoil === foil ? 'bg-stone-800 text-stone-50' : 'text-stone-400 hover:text-stone-100'}`}
                        >
                          {foil ? t('Foil') : t('Zwykła')} <span className="tabular-nums text-stone-500">({foil ? item.quantityFoil : item.quantity})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-stone-300 mb-1.5">{t('Ile egzemplarzy wystawić (masz {n})', { n: max })}</label>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center rounded-lg bg-stone-950 ring-1 ring-stone-800">
                        <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t('Mniej')} className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-12 text-center text-sm text-stone-100 tabular-nums">{Math.min(quantity, max)}</span>
                        <button type="button" onClick={() => setQuantity((q) => Math.min(max, q + 1))} aria-label={t('Więcej')} className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {max > 1 && (
                        <button type="button" onClick={() => setQuantity(max)} className="btn btn-ghost">
                          {t('Wszystkie')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="fs-own-price" className="block text-sm text-stone-300 mb-1.5">{t('Cena za sztukę')} ({settings.currency})</label>
                    <input
                      id="fs-own-price"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                      placeholder={t('Cena rynkowa: {price}', { price: formatCurrency(getSaleMarketPrice(item.card, step.isFoil, settings), settings.currency) })}
                      className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500 tabular-nums"
                    />
                    <p className="text-xs text-stone-500 mt-1.5">{t('Zostaw puste, aby sprzedawać po aktualnej cenie rynkowej.')}</p>
                  </div>
                  <p className="text-xs text-stone-500">
                    {targetFolder
                      ? t('Egzemplarze znikną z katalogu „{binder}” i trafią do podkategorii „{name}”.', { binder: binderName(item.binder || MAIN_BINDER), name: targetFolder.name })
                      : t('Egzemplarze znikną z katalogu „{binder}” i trafią do „Sprzedam”.', { binder: binderName(item.binder || MAIN_BINDER) })}
                  </p>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 p-4 border-t border-stone-800">
                <button type="button" onClick={() => setStep({ kind: 'search' })} className="btn btn-ghost">
                  <ArrowLeft className="w-4 h-4" />
                  {t('Wróć do listy')}
                </button>
                <button type="submit" disabled={saving || max < 1} className="btn btn-primary sm:ml-auto">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
                  {t('Przenieś na sprzedaż')}
                </button>
              </div>
            </form>
          );
        })()}

        {step.kind === 'version' && (
          <AddCardVersionPicker
            card={step.card}
            asCommander={false}
            collection={collection}
            deckCards={[]}
            settings={settings}
            collectionOnly={false}
            confirmLabel={t('Dalej')}
            onBack={() => setStep({ kind: 'search' })}
            onConfirm={(card, isFoil) => goDetails(card, isFoil)}
          />
        )}

        {step.kind === 'details' && (
          <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5">
              <div className="flex sm:block gap-3 items-start">
                <span className={`block w-24 sm:w-full shrink-0 aspect-[488/680] rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700 ${step.isFoil ? 'ms-foil-preview' : ''}`}>
                  {getCardImageUri(step.card, 'normal') && (
                    <img src={getCardImageUri(step.card, 'normal')} alt={step.card.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                  )}
                </span>
                <div className="sm:mt-3 min-w-0">
                  <p className="text-sm font-medium text-stone-100">{step.card.name}</p>
                  <p className="text-xs text-stone-400">
                    {step.card.set_name} ({step.card.set.toUpperCase()}) #{step.card.collector_number}
                  </p>
                  {step.isFoil && (
                    <p className="text-xs text-amber-300 flex items-center gap-1 mt-0.5">
                      <Sparkles className="w-3 h-3" /> {t('Foil')}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-stone-300 mb-1.5">{t('Ilość')}</label>
                  <div className="inline-flex items-center rounded-lg bg-stone-950 ring-1 ring-stone-800">
                    <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t('Mniej')} className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                      aria-label={t('Ilość')}
                      className="w-14 h-10 bg-transparent text-center text-sm text-stone-100 tabular-nums focus:outline-none"
                    />
                    <button type="button" onClick={() => setQuantity((q) => Math.min(999, q + 1))} aria-label={t('Więcej')} className="w-10 h-10 flex items-center justify-center text-stone-300 hover:text-stone-50 cursor-pointer">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="fs-cond" className="block text-sm text-stone-300 mb-1.5">{t('Stan')}</label>
                    <select id="fs-cond" value={condition} onChange={(e) => setCondition(e.target.value as CardCondition)} className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-2.5 text-sm text-stone-100">
                      {CONDITIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fs-lang" className="block text-sm text-stone-300 mb-1.5">{t('Język')}</label>
                    <select id="fs-lang" value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage)} className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-2.5 text-sm text-stone-100">
                      {LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {t(l.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="fs-price" className="block text-sm text-stone-300 mb-1.5">{t('Cena za sztukę')} ({settings.currency})</label>
                  <input
                    id="fs-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                    placeholder={
                      getSaleAdjustPct(settings)
                        ? t('MCM Trend {pct}: {price}', { pct: formatSaleAdjustPct(getSaleAdjustPct(settings)), price: formatCurrency(getSaleMarketPrice(step.card, step.isFoil, settings), settings.currency) })
                        : t('Cena rynkowa: {price}', { price: formatCurrency(getCardPrice(step.card, step.isFoil, settings), settings.currency) })
                    }
                    className="w-full h-10 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500 tabular-nums"
                  />
                  <p className="text-xs text-stone-500 mt-1.5">{t('Zostaw puste, aby sprzedawać po aktualnej cenie rynkowej.')}</p>
                </div>

                <p className="text-xs text-stone-500">{t('Karta trafi do Twojej kolekcji, do kategorii „Sprzedam”.')}</p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 p-4 border-t border-stone-800">
              <button type="button" onClick={() => setStep({ kind: 'version', card: step.card })} className="btn btn-ghost">
                <ArrowLeft className="w-4 h-4" />
                {t('Zmień wersję')}
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary sm:ml-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
                {t('Wystaw na sprzedaż')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForSaleAddModal;
