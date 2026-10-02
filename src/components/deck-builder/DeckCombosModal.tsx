import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Zap, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  Plus, 
  Heart, 
  ExternalLink, 
  RefreshCw,
  Flame,
  ShieldAlert,
  Filter,
  BookOpen,
  Clock,
  RotateCw,
  Users,
  Trophy,
  CloudLightning,
  Layers,
  Coins
} from 'lucide-react';
import { DeckItem, SpellbookCard, SpellbookVariant } from '../../types';
import { spellbookApi } from '../../services/api';

import { useBackToClose } from '../../hooks/useBackButton';
interface DeckCombosModalProps {
  isOpen: boolean;
  deck: DeckItem;
  onClose: () => void;
  onAddCardToDeck?: (cardName: string) => void;
  onAddToWishlist?: (cardName: string) => void;
  onViewCardDetails?: (cardName: string) => void;
}

// Map zone abbreviations from Commander Spellbook to readable Polish labels
const formatZoneLocation = (zoneStr?: string): string => {
  if (!zoneStr) return 'Pole bitwy (Battlefield)';
  const z = zoneStr.toLowerCase().trim();
  switch (z) {
    case 'b':
    case 'battlefield':
      return 'Pole bitwy (Battlefield)';
    case 'h':
    case 'hand':
      return 'W ręce (Hand)';
    case 'g':
    case 'graveyard':
      return 'Na cmentarzu (Graveyard)';
    case 'c':
    case 'command':
    case 'command-zone':
    case 'command_zone':
      return 'Strefa dowódcy (Command Zone)';
    case 'l':
    case 'library':
      return 'W bibliotece (Library)';
    case 'e':
    case 'exile':
      return 'Na wygnaniu (Exile)';
    default:
      return zoneStr;
  }
};

// Split and clean combo instructions into distinct numbered steps
const parseComboSteps = (description: string): string[] => {
  if (!description) return [];

  // Split on newlines
  const rawLines = description
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let steps: string[] = [];

  if (rawLines.length > 1) {
    steps = rawLines;
  } else if (rawLines.length === 1) {
    // If entire description is a single block, check for numbered patterns
    const parts = rawLines[0].split(/(?=\d+[\.\)]\s+)/);
    if (parts.length > 1) {
      steps = parts.map(p => p.trim()).filter(Boolean);
    } else {
      steps = rawLines;
    }
  }

  // Strip any existing "1. ", "1) ", "Step 1: " or "Krok 1: " prefixes so we have clean text
  return steps
    .map(step => step.replace(/^(\d+[\.\)]\s*|step\s*\d+:\s*|krok\s*\d+:\s*)/i, '').trim())
    .filter(step => step.length > 0);
};

// Return an appropriate icon and color theme for effect filter buttons
const getEffectIcon = (effectName: string) => {
  const lower = effectName.toLowerCase();
  if (lower === 'all' || lower === 'wszystkie') {
    return <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (lower.includes('colorless mana')) {
    return <Coins className="w-4 h-4 text-amber-300 shrink-0" />;
  }
  if (lower.includes('mana')) {
    return <Zap className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (lower.includes('draw') || lower.includes('card')) {
    return <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />;
  }
  if (lower.includes('life') || lower.includes('gain')) {
    return <Heart className="w-4 h-4 text-rose-400 shrink-0" />;
  }
  if (lower.includes('damage') || lower.includes('loss of life') || lower.includes('drain')) {
    return <Flame className="w-4 h-4 text-orange-400 shrink-0" />;
  }
  if (lower.includes('turn')) {
    return <Clock className="w-4 h-4 text-cyan-400 shrink-0" />;
  }
  if (lower.includes('untap') || lower.includes('tap')) {
    return <RotateCw className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (lower.includes('token') || lower.includes('creature')) {
    return <Users className="w-4 h-4 text-indigo-400 shrink-0" />;
  }
  if (lower.includes('win') || lower.includes('game')) {
    return <Trophy className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  if (lower.includes('storm') || lower.includes('spell') || lower.includes('magecraft') || lower.includes('cast')) {
    return <CloudLightning className="w-4 h-4 text-purple-400 shrink-0" />;
  }
  if (lower.includes('mill') || lower.includes('graveyard')) {
    return <Layers className="w-4 h-4 text-stone-400 shrink-0" />;
  }
  return <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />;
};

export const DeckCombosModal: React.FC<DeckCombosModalProps> = ({
  isOpen,
  deck,
  onClose,
  onAddCardToDeck,
  onAddToWishlist,
  onViewCardDetails,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<'included' | 'almost'>('included');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedEffectFilter, setSelectedEffectFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Floating hover preview state for card thumbnail inspection
  const [hoveredPreviewCard, setHoveredPreviewCard] = useState<{
    name: string;
    imageUrl: string;
    x: number;
    y: number;
  } | null>(null);

  const [includedCombos, setIncludedCombos] = useState<SpellbookVariant[]>([]);
  const [almostIncludedCombos, setAlmostIncludedCombos] = useState<SpellbookVariant[]>([]);

  // Set of card names currently present in the deck (lowercase for fast matching)
  const deckCardNamesSet = useMemo(() => {
    const set = new Set<string>();
    if (deck.commander?.name) {
      set.add(deck.commander.name.toLowerCase().trim());
    }
    deck.cards.forEach(c => {
      if (c.card?.name) {
        set.add(c.card.name.toLowerCase().trim());
      }
    });
    return set;
  }, [deck]);

  // Fetch combos on open or when deck cards change
  const fetchCombos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const commanders: string[] = deck.commander ? [deck.commander.name] : [];
      const main: string[] = deck.cards
        .filter(c => !c.isCommander && c.card?.name)
        .map(c => c.card.name);

      if (commanders.length === 0 && main.length === 0) {
        setIncludedCombos([]);
        setAlmostIncludedCombos([]);
        setIsLoading(false);
        return;
      }

      const res = await spellbookApi.findDeckCombos(commanders, main);
      if (res && res.results) {
        setIncludedCombos(res.results.included || []);
        setAlmostIncludedCombos(res.results.almostIncluded || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch Spellbook combos:', err);
      setError(err.message || 'Nie udało się połączyć z API Commander Spellbook');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCombos();
    }
  }, [isOpen, deck.id, deck.cards.length, deck.commander?.name]);

  // Extract common outcome features for quick filter pills
  const availableEffects = useMemo(() => {
    const effects = new Map<string, number>();
    const currentList = activeTab === 'included' ? includedCombos : almostIncludedCombos;

    currentList.forEach(v => {
      v.produces?.forEach(p => {
        const name = p.feature?.name;
        if (name) {
          effects.set(name, (effects.get(name) || 0) + 1);
        }
      });
    });

    return Array.from(effects.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [activeTab, includedCombos, almostIncludedCombos]);

  // Filter combos by text query and effect pill
  const filteredCombos = useMemo(() => {
    const list = activeTab === 'included' ? includedCombos : almostIncludedCombos;
    const q = searchFilter.toLowerCase().trim();

    return list.filter(v => {
      // Effect filter
      if (selectedEffectFilter !== 'ALL') {
        const hasEffect = v.produces?.some(p => p.feature?.name === selectedEffectFilter);
        if (!hasEffect) return false;
      }

      // Text query
      if (q) {
        const matchesCards = v.uses?.some(u => u.card?.name?.toLowerCase().includes(q));
        const matchesProduces = v.produces?.some(p => p.feature?.name?.toLowerCase().includes(q));
        const matchesDesc = v.description?.toLowerCase().includes(q);
        if (!matchesCards && !matchesProduces && !matchesDesc) return false;
      }

      return true;
    });
  }, [activeTab, includedCombos, almostIncludedCombos, searchFilter, selectedEffectFilter]);

  // Compute best image URL for a card
  const getCardImageUrl = (cardName: string, spellbookCard?: SpellbookCard) => {
    if (deck.commander && deck.commander.name.toLowerCase() === cardName.toLowerCase()) {
      const uri = deck.commander.image_uris?.normal || deck.commander.image_uris?.small || deck.commander.image_uris?.art_crop;
      if (uri) return uri;
    }
    const inDeckCard = deck.cards.find(c => c.card?.name?.toLowerCase() === cardName.toLowerCase());
    if (inDeckCard?.card?.image_uris) {
      const uri = inDeckCard.card.image_uris.normal || inDeckCard.card.image_uris.small || inDeckCard.card.image_uris.art_crop;
      if (uri) return uri;
    }
    if (spellbookCard) {
      if (spellbookCard.imageUriFrontNormal) return spellbookCard.imageUriFrontNormal;
      if (spellbookCard.imageUriFrontSmall) return spellbookCard.imageUriFrontSmall;
      if (spellbookCard.imageUriFrontArtCrop) return spellbookCard.imageUriFrontArtCrop;
    }
    // High-speed direct Scryfall redirect fallback
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=small`;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-6 text-stone-100 max-h-[92vh] flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 bg-stone-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/25 to-purple-500/25 border border-amber-500/40 rounded-xl text-amber-400 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-stone-100 tracking-tight">
                  Kombinacje Commander Spellbook
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase font-bold">
                  API Spellbook
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Wykrywanie synergii i nieskończonych pętli w talii <span className="text-amber-300 font-semibold">{deck.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCombos}
              disabled={isLoading}
              className="p-2 bg-stone-850 hover:bg-stone-800 text-stone-300 border border-stone-700/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              title="Odśwież analizę kombinacji"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-stone-100 border border-stone-700/60 rounded-xl transition-colors cursor-pointer"
              aria-label="Zamknij"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subheader: Tabs, Search Filter & Large Effect Filters */}
        <div className="p-5 border-b border-stone-800/80 bg-stone-900/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('included');
                  setSelectedEffectFilter('ALL');
                }}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'included'
                    ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Gotowe w talii ({includedCombos.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('almost');
                  setSelectedEffectFilter('ALL');
                }}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'almost'
                    ? 'bg-purple-500 text-white shadow-md font-black'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Flame className="w-4 h-4" />
                <span>Brakuje 1 karty ({almostIncludedCombos.length})</span>
              </button>
            </div>

            {/* Quick search input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                placeholder="Szukaj karty lub rezultatu..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 shadow-inner"
              />
            </div>
          </div>

          {/* Section: 'Filtruj efekt:' - Larger, Clearer Buttons with Dedicated Icons */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-xs text-stone-400 font-bold uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-amber-400" />
              <span>Filtruj efekt:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedEffectFilter('ALL')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer font-bold flex items-center gap-2 border shadow-sm ${
                  selectedEffectFilter === 'ALL'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 font-black shadow-lg shadow-amber-950/40 ring-2 ring-amber-400/30'
                    : 'bg-stone-950 text-stone-300 hover:text-white hover:bg-stone-850 border-stone-800'
                }`}
              >
                {getEffectIcon('ALL')}
                <span>Wszystkie efekty</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                  selectedEffectFilter === 'ALL' ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-400'
                }`}>
                  {activeTab === 'included' ? includedCombos.length : almostIncludedCombos.length}
                </span>
              </button>

              {availableEffects.map(([effectName, count]) => {
                const isSelected = selectedEffectFilter === effectName;
                return (
                  <button
                    key={effectName}
                    type="button"
                    onClick={() => setSelectedEffectFilter(effectName)}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer font-bold flex items-center gap-2 border shadow-sm ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 border-amber-400 font-black shadow-lg shadow-amber-950/40 ring-2 ring-amber-400/30'
                        : 'bg-stone-950 text-stone-300 hover:text-white hover:bg-stone-850 border-stone-800'
                    }`}
                  >
                    {getEffectIcon(effectName)}
                    <span>{effectName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                      isSelected ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm font-semibold text-stone-300">
                Pobieranie i analizowanie kombinacji z Commander Spellbook...
              </p>
              <p className="text-xs text-stone-500">
                Sprawdzamy {deck.cards.length + (deck.commander ? 1 : 0)} kart w bazie ponad 20,000 znanych combosów.
              </p>
            </div>
          )}

          {!isLoading && !error && filteredCombos.length === 0 && (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-stone-800 flex items-center justify-center mx-auto text-stone-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-stone-200">
                {activeTab === 'included'
                  ? 'Brak gotowych combosów w talii'
                  : 'Brak kombinacji bliskich ukończenia'}
              </h3>
              <p className="text-xs text-stone-400 max-w-md mx-auto">
                {activeTab === 'included'
                  ? 'Twoja talia nie zawiera obecnie żadnej kompletnej, znanej kombinacji Spellbooka. Sprawdź zakładkę "Brakuje 1 karty", aby zobaczyć rekomendacje!'
                  : 'Nie znaleziono kombinacji, do których brakuje tylko jednej karty, lub żaden wynik nie pasuje do wybranych filtrów.'}
              </p>
            </div>
          )}

          {/* Combo List Cards */}
          {!isLoading && filteredCombos.map((variant, idx) => {
            const cardStatuses = variant.uses?.map(u => {
              const cardName = u.card?.name || '';
              const inDeck = deckCardNamesSet.has(cardName.toLowerCase().trim());
              const imageUrl = getCardImageUrl(cardName, u.card);
              return {
                card: u.card,
                name: cardName,
                imageUrl,
                inDeck,
                zone: u.zoneLocations?.join(', ') || 'B',
                state: u.battlefieldCardState
              };
            }) || [];

            const comboSteps = parseComboSteps(variant.description);

            return (
              <div 
                key={variant.id || idx}
                className="bg-stone-950/80 border border-stone-800 rounded-2xl p-5 hover:border-stone-700 transition-all space-y-5 shadow-lg"
              >
                {/* Variant Top Header: ID, Produces badges & Mana needed */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      ID: {variant.id}
                    </span>
                    {variant.produces?.map((p, pIdx) => (
                      <span 
                        key={pIdx}
                        className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 flex items-center gap-1.5 shadow-sm"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{p.feature?.name}</span>
                      </span>
                    ))}
                  </div>

                  {variant.manaNeeded && (
                    <div className="flex items-center gap-2 text-xs text-stone-300 shrink-0">
                      <span className="text-stone-400 font-mono">Wymagana mana:</span>
                      <span className="font-bold text-amber-300 bg-stone-900 px-2.5 py-1 rounded-lg border border-stone-700 font-mono text-sm">
                        {variant.manaNeeded}
                      </span>
                    </div>
                  )}
                </div>

                {/* Section 1: WYMAGANE KARTY W COMBO with Immediate Visual Card Previews */}
                <div>
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Wymagane karty w combo:</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cardStatuses.map((item, cIdx) => (
                      <div 
                        key={cIdx}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          item.inDeck
                            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                            : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Visual Card Image Preview */}
                          <div 
                            className="relative shrink-0 w-12 h-16 sm:w-14 sm:h-18 rounded-lg overflow-hidden bg-stone-900 border border-stone-700/80 shadow-md group cursor-pointer"
                            onClick={() => onViewCardDetails?.(item.name)}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredPreviewCard({
                                name: item.name,
                                imageUrl: item.imageUrl,
                                x: rect.right + 12,
                                y: Math.max(10, rect.top - 80)
                              });
                            }}
                            onMouseLeave={() => setHoveredPreviewCard(null)}
                            title={`Kliknij, aby otworzyć szczegóły karty ${item.name}`}
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.fallbackTried) {
                                  target.dataset.fallbackTried = 'true';
                                  target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.name)}&format=image&version=small`;
                                }
                              }}
                            />
                          </div>

                          {/* Card Details & Zone info */}
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              {item.inDeck ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>W talii</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">
                                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                                  <span>Brak w talii</span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => onViewCardDetails?.(item.name)}
                              className="text-sm font-bold text-stone-100 hover:text-amber-300 truncate block text-left cursor-pointer transition-colors"
                              title={item.name}
                            >
                              {item.name}
                            </button>

                            <div className="text-[11px] text-stone-400 truncate">
                              Strefa: <span className="text-stone-300 font-medium">{formatZoneLocation(item.zone)}</span>
                            </div>

                            {item.state && (
                              <div className="text-[10px] text-amber-300/80 truncate">
                                Stan: {item.state}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quick action buttons for missing card */}
                        {!item.inDeck && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {onAddToWishlist && (
                              <button
                                type="button"
                                onClick={() => onAddToWishlist(item.name)}
                                className="p-2 rounded-xl bg-stone-850 hover:bg-rose-500/20 text-stone-300 hover:text-rose-300 border border-stone-700/80 transition-colors cursor-pointer shadow-sm"
                                title="Dodaj brakującą kartę do Wishlisty"
                              >
                                <Heart className="w-4 h-4" />
                              </button>
                            )}
                            {onAddCardToDeck && (
                              <button
                                type="button"
                                onClick={() => onAddCardToDeck(item.name)}
                                className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer shadow-sm"
                                title="Dodaj kartę do talii"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2: KROKI WYKONANIA (INSTRUKCJA COMBO) - Numbered 1. 2. 3. steps */}
                {variant.description && (
                  <div className="bg-stone-900/90 rounded-2xl p-4 border border-stone-800 shadow-inner space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Kroki wykonania (Instrukcja combo):</span>
                      </span>
                      <span className="text-[11px] text-stone-500 font-mono">
                        Liczba kroków: {comboSteps.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {comboSteps.map((step, sIdx) => (
                        <div 
                          key={sIdx}
                          className="flex items-start gap-3 p-3 rounded-xl bg-stone-950/80 border border-stone-800/80 hover:border-amber-500/30 transition-all group"
                        >
                          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5 shadow-sm group-hover:scale-105 group-hover:bg-amber-500 group-hover:text-stone-950 transition-all">
                            {sIdx + 1}
                          </div>
                          <p className="text-xs sm:text-[13px] text-stone-200 leading-relaxed font-medium pt-0.5">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prerequisites if any */}
                {(variant.easyPrerequisites || variant.notablePrerequisites) && (
                  <div className="text-xs text-stone-400 bg-stone-900/60 p-3 rounded-xl border border-stone-800 flex items-start gap-2.5">
                    <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-stone-200">Wymagania wstępne: </span>
                      <span>{variant.easyPrerequisites || variant.notablePrerequisites}</span>
                    </div>
                  </div>
                )}

                {/* Footer Link to Commander Spellbook */}
                <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
                  <span>Baza wiedzy: Commander Spellbook DB</span>
                  <a
                    href={`https://commanderspellbook.com/combo/${variant.id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-amber-400/90 hover:text-amber-300 font-semibold transition-colors"
                  >
                    <span>Zobacz w Commander Spellbook</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Banner */}
        <div className="px-6 py-3.5 bg-stone-950 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-400 gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>
              API Commander Spellbook zawiera ponad 20,000 sprawdzonych kombinacji Magic: The Gathering.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>

      {/* Floating Card Image Preview on Hover */}
      {hoveredPreviewCard && (
        <div 
          className="fixed pointer-events-none z-[70] hidden sm:block animate-fade-in"
          style={{
            left: `${hoveredPreviewCard.x}px`,
            top: `${hoveredPreviewCard.y}px`,
            maxWidth: '240px'
          }}
        >
          <div className="rounded-xl overflow-hidden border border-amber-500/40 shadow-2xl bg-stone-950">
            <img 
              src={hoveredPreviewCard.imageUrl} 
              alt={hoveredPreviewCard.name}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckCombosModal;
