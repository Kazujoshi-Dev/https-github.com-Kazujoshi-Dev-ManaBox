import { PageHeader } from './ui/PageHeader';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScryfallCard, AppSettings, MTGSet, SetTopCardsResponse } from '../types';
import { formatCurrency, getCardImageUri, handleCardImageError, getCardEdhrecRank } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  Trophy, 
  Search, 
  Sparkles, 
  ExternalLink, 
  Plus, 
  FolderHeart, 
  Eye, 
  ChevronDown, 
  Layers, 
  Calendar, 
  Check, 
  AlertCircle, 
  Coins, 
  ArrowUpDown,
  Flame,
  Info
} from 'lucide-react';
import { useT, plural } from '../i18n';

interface SetTopCardsProps {
  settings: AppSettings;
  onSelectCard: (card: ScryfallCard) => void;
  onAddToCollection?: (card: ScryfallCard) => void;
  onAddToWishlist?: (card: ScryfallCard) => void;
}

// Popular sets for quick pick chips
const POPULAR_SETS = [
  { code: 'blb', name: 'Bloomburrow' },
  { code: 'mh3', name: 'Modern Horizons 3' },
  { code: 'fdn', name: 'Foundations' },
  { code: 'dsk', name: 'Duskmourn' },
  { code: 'otj', name: 'Outlaws of Thunder Junction' },
  { code: 'ltr', name: 'Tales of Middle-earth' },
  { code: 'cmm', name: 'Commander Masters' },
  { code: 'one', name: 'Phyrexia: All Will Be One' },
  { code: 'neo', name: 'Kamigawa: Neon Dynasty' },
  { code: '2x2', name: 'Double Masters 2022' },
];

export const SetTopCards: React.FC<SetTopCardsProps> = ({
  settings,
  onSelectCard,
  onAddToCollection,
  onAddToWishlist,
}) => {
  const t = useT();
  const [sets, setSets] = useState<MTGSet[]>([]);
  const [isLoadingSets, setIsLoadingSets] = useState<boolean>(true);
  const [selectedSetCode, setSelectedSetCode] = useState<string>('blb');
  const [activeRarityFilter, setActiveRarityFilter] = useState<'all' | 'mythic' | 'rare' | 'uncommon' | 'common'>('all');
  
  // Search input for filtering sets
  const [setSearchTerm, setSetSearchTerm] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Top cards data
  const [setData, setSetData] = useState<SetTopCardsResponse | null>(null);
  const [isLoadingTopCards, setIsLoadingTopCards] = useState<boolean>(false);
  const [topCardsError, setTopCardsError] = useState<string | null>(null);

  // Quick action feedback
  const [actionFeedback, setActionFeedback] = useState<{ id: string; type: 'col' | 'wish' } | null>(null);

  // 1. Fetch available sets on mount
  useEffect(() => {
    async function loadSets() {
      try {
        setIsLoadingSets(true);
        const res = await fetch('/api/scryfall/sets');
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            setSets(data.data);
          }
        }
      } catch (err) {
        console.error('Error fetching sets:', err);
      } finally {
        setIsLoadingSets(false);
      }
    }
    loadSets();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 2. Fetch top cards whenever selectedSetCode changes
  useEffect(() => {
    if (!selectedSetCode) return;

    let isCancelled = false;
    async function fetchTopCards() {
      try {
        setIsLoadingTopCards(true);
        setTopCardsError(null);
        const res = await fetch(`/api/scryfall/set-top/${selectedSetCode.toLowerCase()}`);
        if (!res.ok) {
          throw new Error(t('Nie udało się pobrać kart z tego dodatku'));
        }
        const data = await res.json();
        if (!isCancelled) {
          setSetData(data);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setTopCardsError(err.message || t('Wystąpił błąd podczas ładowania kart dodatku'));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTopCards(false);
        }
      }
    }

    fetchTopCards();

    return () => {
      isCancelled = true;
    };
  }, [selectedSetCode]);

  // Filtered sets for dropdown
  const filteredSets = useMemo(() => {
    if (!setSearchTerm.trim()) {
      return sets.slice(0, 80);
    }
    const term = setSearchTerm.toLowerCase().trim();
    return sets
      .filter(s => s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term))
      .slice(0, 80);
  }, [sets, setSearchTerm]);

  // Selected set object
  const currentSet = useMemo(() => {
    return sets.find(s => s.code.toLowerCase() === selectedSetCode.toLowerCase()) || setData?.set;
  }, [sets, selectedSetCode, setData]);

  // Helper to convert Cardmarket EUR price to PLN
  const eurToPln = (eurVal: string | null | undefined): number | null => {
    if (!eurVal) return null;
    const num = parseFloat(eurVal);
    if (isNaN(num)) return null;
    return num * (settings.eurToPlnRate || 4.31);
  };

  // Helper to format PLN with EUR subtitle
  const formatMcmPln = (eurVal: string | null | undefined) => {
    const plnValue = eurToPln(eurVal);
    if (plnValue === null) {
      return {
        formattedPln: '—',
        originalEur: ''
      };
    }
    return {
      formattedPln: formatCurrency(plnValue, 'PLN'),
      originalEur: `€${parseFloat(eurVal!).toFixed(2)}`
    };
  };

  // Compute set summary metrics
  const setMetrics = useMemo(() => {
    if (!setData?.topCards) return null;

    const allCards = [
      ...(setData.topCards.mythic || []),
      ...(setData.topCards.rare || []),
      ...(setData.topCards.uncommon || []),
      ...(setData.topCards.common || []),
    ];

    if (allCards.length === 0) return null;

    // Find top card of the entire set
    let topCard: ScryfallCard | null = null;
    let maxPrice = -1;

    allCards.forEach(c => {
      const price = parseFloat(c.prices?.eur || c.prices?.eur_foil || '0');
      if (price > maxPrice) {
        maxPrice = price;
        topCard = c;
      }
    });

    // Sum of top 5 mythics
    const mythicSumPln = (setData.topCards.mythic || []).reduce((acc, c) => {
      const p = eurToPln(c.prices?.eur || c.prices?.eur_foil);
      return acc + (p || 0);
    }, 0);

    // Sum of top 5 rares
    const rareSumPln = (setData.topCards.rare || []).reduce((acc, c) => {
      const p = eurToPln(c.prices?.eur || c.prices?.eur_foil);
      return acc + (p || 0);
    }, 0);

    return {
      topCard,
      topCardPricePln: eurToPln(topCard?.prices?.eur || topCard?.prices?.eur_foil),
      mythicSumPln,
      rareSumPln,
    };
  }, [setData, settings.eurToPlnRate]);

  const handleQuickAdd = (card: ScryfallCard, type: 'col' | 'wish') => {
    if (type === 'col' && onAddToCollection) {
      onAddToCollection(card);
    } else if (type === 'wish' && onAddToWishlist) {
      onAddToWishlist(card);
    }
    setActionFeedback({ id: card.id, type });
    setTimeout(() => setActionFeedback(null), 1800);
  };

  const rarityConfigs = [
    {
      key: 'mythic',
      label: 'Mythic Rare',
      shortLabel: 'Mythic',
      color: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
      badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      iconColor: 'text-orange-400',
    },
    {
      key: 'rare',
      label: 'Rare',
      shortLabel: 'Rare',
      color: 'border-amber-400/40 text-amber-300 bg-amber-400/10',
      badge: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
      iconColor: 'text-amber-400',
    },
    {
      key: 'uncommon',
      label: 'Uncommon',
      shortLabel: 'Uncommon',
      color: 'border-cyan-400/40 text-cyan-300 bg-cyan-400/10',
      badge: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/40',
      iconColor: 'text-cyan-400',
    },
    {
      key: 'common',
      label: 'Common',
      shortLabel: 'Common',
      color: 'border-stone-500/40 text-stone-300 bg-stone-500/10',
      badge: 'bg-stone-700/60 text-stone-300 border-stone-600',
      iconColor: 'text-stone-400',
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header & Controls Panel */}
      <div>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <PageHeader
            title={t('Top z dodatku')}
            description={t('Pięć najdroższych kart każdej rzadkości w wybranym dodatku, według Cardmarket Trend w złotówkach.')}
          />

          {/* Currency / NBP rate reminder badge */}
          <p className="text-sm text-stone-400 tabular-nums shrink-0">
            1 EUR = <span className="text-stone-100 font-medium">{settings.eurToPlnRate.toFixed(2)} PLN</span> (NBP)
          </p>
        </div>

        {/* Set Selection Bar */}
        <div className="mt-5 pt-4 border-t border-stone-800/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Search / Select Set Dropdown */}
          <div className="md:col-span-7 relative" ref={dropdownRef}>
            <label className="block text-[11px] font-semibold text-stone-400 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('Wybierz lub wyszukaj dodatek MTG:')}</span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={setSearchTerm}
                onChange={(e) => {
                  setSetSearchTerm(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder={currentSet ? `${currentSet.name} (${currentSet.code.toUpperCase()})` : t('Wpisz nazwę lub kod dodatku (np. Bloomburrow, blb, mh3)...')}
                className="w-full bg-stone-950 border border-stone-700/80 hover:border-amber-500/50 focus:border-amber-500 text-stone-100 placeholder-stone-500 text-sm rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 p-1"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1.5 max-h-72 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl overflow-y-auto z-40 divide-y divide-stone-800">
                {isLoadingSets ? (
                  <div className="p-4 text-center text-xs text-stone-400">
                    {t('Ładowanie listy dodatków ze Scryfall...')}
                  </div>
                ) : filteredSets.length === 0 ? (
                  <div className="p-4 text-center text-xs text-stone-400">
                    {t('Nie znaleziono dodatku pasującego do "{term}"', { term: setSearchTerm })}
                  </div>
                ) : (
                  filteredSets.map(s => {
                    const isSelected = s.code.toLowerCase() === selectedSetCode.toLowerCase();
                    return (
                      <button
                        key={s.id || s.code}
                        type="button"
                        onClick={() => {
                          setSelectedSetCode(s.code);
                          setSetSearchTerm('');
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-stone-800/80 transition-colors ${
                          isSelected ? 'bg-amber-500/10 text-amber-300 font-semibold' : 'text-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {s.icon_svg_uri ? (
                            <img
                              src={s.icon_svg_uri}
                              alt={s.code}
                              className="w-4 h-4 object-contain invert opacity-80 shrink-0"
                            />
                          ) : (
                            <Layers className="w-4 h-4 text-stone-500 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="font-medium text-stone-100">{s.name}</span>
                            <span className="ml-2 tabular-nums text-[11px] text-amber-400/90 px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700">
                              {s.code.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-stone-400 text-[11px] shrink-0 tabular-nums ml-2">
                          <span>{s.released_at ? s.released_at.substring(0, 4) : ''}</span>
                          <span>• {plural(s.card_count, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards'])}</span>
                          {isSelected && <Check className="w-4 h-4 text-amber-400 ml-1" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Native Select fallback for quick accessibility */}
          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-stone-400 mb-1.5">
              {t('Szybka lista dodatków:')}
            </label>
            <select
              value={selectedSetCode}
              onChange={(e) => setSelectedSetCode(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700/80 text-stone-200 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 transition-colors"
            >
              {sets.slice(0, 150).map(s => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code.toUpperCase()}), {s.released_at ? s.released_at.substring(0, 4) : ''}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Quick Popular Sets Pills */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap pt-2">
          <span className="text-[11px] text-stone-400 font-semibold mr-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            {t('Popularne dodatki:')}
          </span>
          {POPULAR_SETS.map(p => {
            const isSelected = p.code.toLowerCase() === selectedSetCode.toLowerCase();
            return (
              <button
                key={p.code}
                onClick={() => setSelectedSetCode(p.code)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-stone-100 border border-stone-700'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Set Details & Statistics Bar */}
      {currentSet && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Set info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-950 border border-amber-500/30 flex items-center justify-center p-3 shadow-inner">
                {currentSet.icon_svg_uri ? (
                  <img
                    src={currentSet.icon_svg_uri}
                    alt={currentSet.code}
                    className="w-full h-full object-contain invert opacity-90"
                  />
                ) : (
                  <Layers className="w-7 h-7 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold text-stone-100">{currentSet.name}</h3>
                  <span className="tabular-nums text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                    {currentSet.code.toUpperCase()}
                  </span>
                  {currentSet.set_type && (
                    <span className="text-[11px] tabular-nums px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                      {currentSet.set_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-stone-400 mt-1 tabular-nums">
                  {currentSet.released_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-500" />
                      {t('Premiera:')} {currentSet.released_at}
                    </span>
                  )}
                  {currentSet.card_count ? (
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-stone-500" />
                      {t('{n} kart w dodatku', { n: currentSet.card_count })}
                    </span>
                  ) : null}
                  {currentSet.scryfall_uri && (
                    <a
                      href={currentSet.scryfall_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 underline flex items-center gap-0.5"
                    >
                      {t('Scryfall')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Metrics of Set Top Cards */}
            {setMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-stone-950/70 p-3 rounded-xl border border-stone-800/80">
                <div>
                  <p className="text-[11px] font-semibold text-stone-400">{t('Top 1 Karta')}</p>
                  <p className="text-sm font-bold text-amber-400 truncate max-w-[140px]" title={setMetrics.topCard?.name}>
                    {setMetrics.topCard?.name || '—'}
                  </p>
                  <p className="text-xs tabular-nums font-semibold text-stone-200">
                    {formatCurrency(setMetrics.topCardPricePln, 'PLN')}
                  </p>
                </div>

                <div className="border-l border-stone-800/80 pl-3">
                  <p className="text-[11px] font-semibold text-stone-400">{t('Suma top 5 Mythic')}</p>
                  <p className="text-sm font-bold text-orange-400 tabular-nums">
                    {formatCurrency(setMetrics.mythicSumPln, 'PLN')}
                  </p>
                  <p className="text-[11px] text-stone-500">{t('Mythic')}</p>
                </div>

                <div className="border-l border-stone-800/80 pl-3 col-span-2 sm:col-span-1">
                  <p className="text-[11px] font-semibold text-stone-400">{t('Suma top 5 Rare')}</p>
                  <p className="text-sm font-bold text-amber-300 tabular-nums">
                    {formatCurrency(setMetrics.rareSumPln, 'PLN')}
                  </p>
                  <p className="text-[11px] text-stone-500">{t('Rare')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rarity Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setActiveRarityFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeRarityFilter === 'all'
              ? 'bg-amber-500 text-stone-950 shadow-md font-bold'
              : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{t('Wszystkie rzadkości (Top 20)')}</span>
        </button>

        {rarityConfigs.map(rc => {
          const count = setData?.topCards?.[rc.key as keyof typeof setData.topCards]?.length || 0;
          const isActive = activeRarityFilter === rc.key;
          return (
            <button
              key={rc.key}
              onClick={() => setActiveRarityFilter(rc.key as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap border ${
                isActive
                  ? `${rc.color} border-current shadow-md font-bold`
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border-stone-800'
              }`}
            >
              <span>{rc.shortLabel}</span>
              <span className={`text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${isActive ? 'bg-black/30' : 'bg-stone-800 text-stone-400'}`}>
                {isLoadingTopCards ? '...' : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {isLoadingTopCards ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-300">
            {t('Pobieranie aktualnych cen kart z Cardmarket dla dodatku {set}...', { set: selectedSetCode.toUpperCase() })}
          </p>
          <p className="text-xs text-stone-500">
            {t('Sprawdzanie cen rynkowych Cardmarket Trend dla mitycznych, rzadkich, niepospolitych i zwykłych kart.')}
          </p>
        </div>
      ) : topCardsError ? (
        <div className="bg-stone-900 border border-rose-900/50 rounded-2xl p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <p className="text-sm font-semibold text-rose-300">{topCardsError}</p>
          <button
            onClick={() => setSelectedSetCode(selectedSetCode)}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors"
          >
            {t('Spróbuj ponownie')}
          </button>
        </div>
      ) : !setData || Object.values(setData.topCards || {}).every(arr => (arr as ScryfallCard[]).length === 0) ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center text-stone-400 space-y-2">
          <Info className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-sm font-semibold text-stone-300">{t('Brak danych cenowych dla tego dodatku')}</p>
          <p className="text-xs">{t('Wybierz inny dodatek z listy lub wpisz inną nazwę.')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {rarityConfigs
            .filter(rc => activeRarityFilter === 'all' || activeRarityFilter === rc.key)
            .map(rc => {
              const cards = setData.topCards?.[rc.key as keyof typeof setData.topCards] || [];
              if (cards.length === 0 && activeRarityFilter !== 'all') {
                return (
                  <div key={rc.key} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 text-center text-stone-400 text-xs">
                    {t('Brak kart o rzadkości "{rarity}" w tym zestawie danych.', { rarity: rc.label })}
                  </div>
                );
              }
              if (cards.length === 0) return null;

              return (
                <div key={rc.key} className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
                  {/* Rarity Table Header */}
                  <div className={`px-5 py-3.5 border-b border-stone-800 flex items-center justify-between ${rc.color}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-current" />
                      <h4 className="font-bold text-sm ">
                        {rc.label}
                      </h4>
                      <span className="text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-stone-950/60 text-stone-300 border border-stone-700 font-semibold">
                        {t('Top {n}', { n: cards.length })}
                      </span>
                    </div>

                    <div className="text-[11px] tabular-nums text-stone-400">
                      {t('Wycena:')} <strong className="text-stone-200">{t('MCM Trend (PLN)')}</strong>
                    </div>
                  </div>

                  {/* Table view */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-stone-800/80 bg-stone-950/50 text-[11px] text-stone-400">
                          <th className="py-3 px-4 w-12 text-center font-semibold">#</th>
                          <th className="py-3 px-4 font-semibold">{t('Karta')}</th>
                          <th className="py-3 px-4 font-semibold hidden md:table-cell">{t('Typ')}</th>
                          <th className="py-3 px-4 text-right font-semibold">
                            {t('Cena Standard')} <span className="text-amber-400 font-normal">{t('(MCM)')}</span>
                          </th>
                          <th className="py-3 px-4 text-right font-semibold">
                            {t('Cena Foil')} <span className="text-amber-400 font-normal">{t('(MCM)')}</span>
                          </th>
                          <th className="py-3 px-4 text-center font-semibold w-36">{t('Akcje')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-800/60 text-xs">
                        {cards.map((card, index) => {
                          const normalPrice = formatMcmPln(card.prices?.eur);
                          const foilPrice = formatMcmPln(card.prices?.eur_foil);
                          const imgUri = getCardImageUri(card, 'normal');
                          const cardmarketUrl = (card as any).purchase_uris?.cardmarket || `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`;

                          // Rank medal styling
                          let rankBadge = (
                            <span className="w-6 h-6 rounded-full bg-stone-800 text-stone-400 flex items-center justify-center tabular-nums font-bold text-xs mx-auto">
                              {index + 1}
                            </span>
                          );
                          if (index === 0) {
                            rankBadge = (
                              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center tabular-nums font-bold text-xs shadow-xs mx-auto" title={t('1. miejsce')}>
                                1
                              </span>
                            );
                          } else if (index === 1) {
                            rankBadge = (
                              <span className="w-6 h-6 rounded-full bg-stone-300/20 text-stone-200 border border-stone-400/40 flex items-center justify-center tabular-nums font-bold text-xs mx-auto" title={t('2. miejsce')}>
                                2
                              </span>
                            );
                          } else if (index === 2) {
                            rankBadge = (
                              <span className="w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 border border-amber-700/40 flex items-center justify-center tabular-nums font-bold text-xs mx-auto" title={t('3. miejsce')}>
                                3
                              </span>
                            );
                          }

                          return (
                            <tr
                              key={card.id}
                              className="hover:bg-stone-800/40 transition-colors group"
                            >
                              {/* Rank */}
                              <td className="py-3 px-4 text-center">
                                {rankBadge}
                              </td>

                              {/* Card Image & Name */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  {/* Thumbnail with hover zoom */}
                                  <div
                                    onClick={() => onSelectCard(card)}
                                    className="w-10 h-14 rounded bg-stone-950 border border-stone-700 overflow-hidden shrink-0 cursor-pointer shadow-sm group-hover:border-amber-500/50 transition-colors"
                                  >
                                    <img
                                      src={imgUri}
                                      alt={card.name}
                                      onError={handleCardImageError}
                                      className="w-full h-full object-contain transition-transform duration-200"
                                      loading="lazy"
                                    />
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        onClick={() => onSelectCard(card)}
                                        className="font-bold text-stone-100 hover:text-amber-400 transition-colors text-left truncate max-w-xs sm:max-w-sm"
                                      >
                                        {card.name}
                                      </button>
                                      {card.mana_cost && (
                                        <ManaSymbol cost={card.mana_cost} size="sm" />
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400 tabular-nums">
                                      <span>#{card.collector_number}</span>
                                      <span>•</span>
                                      <span className="capitalize">{card.rarity}</span>
                                      {getCardEdhrecRank(card) != null && (
                                        <EdhrecBadge rank={getCardEdhrecRank(card)} size="xs" />
                                      )}
                                      <span className="hidden sm:inline">•</span>
                                      <span className="hidden sm:inline text-stone-500">{card.set_name}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Type Line */}
                              <td className="py-3 px-4 text-stone-400 hidden md:table-cell text-xs">
                                <span className="line-clamp-1">{card.type_line}</span>
                              </td>

                              {/* Standard Price in PLN & EUR */}
                              <td className="py-3 px-4 text-right">
                                {card.prices?.eur ? (
                                  <div>
                                    <span className="tabular-nums font-bold text-sm text-amber-300">
                                      {normalPrice.formattedPln}
                                    </span>
                                    {normalPrice.originalEur && (
                                      <div className="text-[11px] text-stone-500 tabular-nums">
                                        {normalPrice.originalEur}
                                      </div>
                                    )}
                                  </div>
                                ) : card.prices?.eur_foil ? (
                                  <div>
                                    <span className="text-[11px] tabular-nums font-medium text-amber-400/90 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                      {t('Tylko Foil')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-stone-600 tabular-nums text-xs">—</span>
                                )}
                              </td>

                              {/* Foil Price in PLN & EUR */}
                              <td className="py-3 px-4 text-right">
                                <div>
                                  {foilPrice.formattedPln !== '—' ? (
                                    <>
                                      <span className="tabular-nums font-bold text-xs text-amber-400/90 flex items-center justify-end gap-1">
                                        <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                                        {foilPrice.formattedPln}
                                      </span>
                                      {foilPrice.originalEur && (
                                        <div className="text-[11px] text-stone-500 tabular-nums">
                                          {foilPrice.originalEur}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-stone-600 tabular-nums text-xs">—</span>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {/* View modal */}
                                  <button
                                    onClick={() => onSelectCard(card)}
                                    title={t('Zobacz szczegóły i wykresy')}
                                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-amber-400 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Add to collection */}
                                  {onAddToCollection && (
                                    <button
                                      onClick={() => handleQuickAdd(card, 'col')}
                                      title={t('Dodaj do Mojej Kolekcji')}
                                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-emerald-400 transition-colors"
                                    >
                                      {actionFeedback?.id === card.id && actionFeedback?.type === 'col' ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Plus className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}

                                  {/* Add to wishlist */}
                                  {onAddToWishlist && (
                                    <button
                                      onClick={() => handleQuickAdd(card, 'wish')}
                                      title={t('Dodaj do Listy Życzeń')}
                                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-rose-400 transition-colors"
                                    >
                                      {actionFeedback?.id === card.id && actionFeedback?.type === 'wish' ? (
                                        <Check className="w-3.5 h-3.5 text-rose-400" />
                                      ) : (
                                        <FolderHeart className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}

                                  {/* Cardmarket external link */}
                                  <a
                                    href={cardmarketUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t('Otwórz ofertę na Cardmarket.com')}
                                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-amber-400 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
