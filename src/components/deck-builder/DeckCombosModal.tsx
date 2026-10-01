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
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { DeckItem, ScryfallCard, SpellbookVariant } from '../../types';
import { spellbookApi } from '../../services/api';

interface DeckCombosModalProps {
  isOpen: boolean;
  deck: DeckItem;
  onClose: () => void;
  onAddCardToDeck?: (cardName: string) => void;
  onAddToWishlist?: (cardName: string) => void;
  onViewCardDetails?: (cardName: string) => void;
}

export const DeckCombosModal: React.FC<DeckCombosModalProps> = ({
  isOpen,
  deck,
  onClose,
  onAddCardToDeck,
  onAddToWishlist,
  onViewCardDetails,
}) => {
  const [activeTab, setActiveTab] = useState<'included' | 'almost'>('included');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedEffectFilter, setSelectedEffectFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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

  // Fetch combos on open or when deck changes
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
      .slice(0, 10);
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-6 text-stone-100 max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 bg-stone-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/30 rounded-xl text-amber-400">
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

        {/* Subheader: Tabs & Search Filter */}
        <div className="p-5 border-b border-stone-800/80 bg-stone-900/60 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('included');
                  setSelectedEffectFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'included'
                    ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Gotowe w talii ({includedCombos.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('almost');
                  setSelectedEffectFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'almost'
                    ? 'bg-purple-500 text-white shadow-md font-black'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Brakuje 1 karty ({almostIncludedCombos.length})</span>
              </button>
            </div>

            {/* Quick search input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                placeholder="Szukaj karty lub efektu..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Quick effect pills */}
          {availableEffects.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold mr-1">
                Filtruj efekt:
              </span>
              <button
                type="button"
                onClick={() => setSelectedEffectFilter('ALL')}
                className={`px-2.5 py-0.5 rounded-full text-xs transition-all cursor-pointer font-medium ${
                  selectedEffectFilter === 'ALL'
                    ? 'bg-stone-700 text-stone-100 font-bold'
                    : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                Wszystkie
              </button>
              {availableEffects.map(([effectName, count]) => (
                <button
                  key={effectName}
                  type="button"
                  onClick={() => setSelectedEffectFilter(effectName)}
                  className={`px-2.5 py-0.5 rounded-full text-xs transition-all cursor-pointer font-medium ${
                    selectedEffectFilter === effectName
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                      : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  {effectName} <span className="opacity-60 text-[10px]">({count})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
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
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mx-auto text-stone-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-stone-200">
                {activeTab === 'included'
                  ? 'Brak gotowych combosów w talii'
                  : 'Brak kombinacji bliskich ukończenia'}
              </h3>
              <p className="text-xs text-stone-400 max-w-md mx-auto">
                {activeTab === 'included'
                  ? 'Twoja talia nie zawiera obecnie żadnej kompletnej, znanej kombinacji Spellbooka. Sprawdź zakładkę "Brakuje 1 karty", aby zobaczyć rekomendacje!'
                  : 'Nie znaleziono kombinacji, do których brakuje tylko jednej karty, lub żaden wynik nie pasuje do filtrów.'}
              </p>
            </div>
          )}

          {/* Combo List Cards */}
          {!isLoading && filteredCombos.map((variant, idx) => {
            // Find which cards are in deck vs missing
            const cardStatuses = variant.uses?.map(u => {
              const cardName = u.card?.name || '';
              const inDeck = deckCardNamesSet.has(cardName.toLowerCase().trim());
              return {
                card: u.card,
                name: cardName,
                inDeck,
                zone: u.zoneLocations?.join(', ') || 'BATTLEFIELD',
                state: u.battlefieldCardState
              };
            }) || [];

            const missingCards = cardStatuses.filter(cs => !cs.inDeck);

            return (
              <div 
                key={variant.id || idx}
                className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 sm:p-5 hover:border-stone-700 transition-all space-y-4"
              >
                {/* Variant Header: Produces badges & Mana needed */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-stone-800/60">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      ID: {variant.id}
                    </span>
                    {variant.produces?.map((p, pIdx) => (
                      <span 
                        key={pIdx}
                        className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>{p.feature?.name}</span>
                      </span>
                    ))}
                  </div>

                  {variant.manaNeeded && (
                    <div className="flex items-center gap-1.5 text-xs text-stone-300">
                      <span className="text-stone-400 font-mono text-[11px]">Wymagana mana:</span>
                      <span className="font-bold text-amber-300 bg-stone-900 px-2 py-0.5 rounded border border-stone-700">
                        {variant.manaNeeded}
                      </span>
                    </div>
                  )}
                </div>

                {/* Cards Used in this Combo */}
                <div>
                  <h4 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                    Wymagane karty w combo:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {cardStatuses.map((item, cIdx) => (
                      <div 
                        key={cIdx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          item.inDeck
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-rose-500/10 border-rose-500/40 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.inDeck ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onViewCardDetails?.(item.name)}
                              className="text-xs font-bold text-stone-100 hover:text-amber-300 truncate block text-left cursor-pointer transition-colors"
                              title={item.name}
                            >
                              {item.name}
                            </button>
                            <span className="text-[10px] text-stone-400 block truncate">
                              Strefa: {item.zone.toLowerCase()}
                            </span>
                          </div>
                        </div>

                        {/* If missing card, provide quick add buttons */}
                        {!item.inDeck && (
                          <div className="flex items-center gap-1 shrink-0">
                            {onAddToWishlist && (
                              <button
                                type="button"
                                onClick={() => onAddToWishlist(item.name)}
                                className="p-1 rounded bg-stone-850 hover:bg-rose-500/20 text-stone-300 hover:text-rose-300 border border-stone-700 transition-colors cursor-pointer"
                                title="Dodaj brakującą kartę do Wishlisty"
                              >
                                <Heart className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onAddCardToDeck && (
                              <button
                                type="button"
                                onClick={() => onAddCardToDeck(item.name)}
                                className="p-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer"
                                title="Dodaj kartę do talii"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Execution Steps */}
                {variant.description && (
                  <div className="bg-stone-900/80 rounded-xl p-3 border border-stone-800/80 text-xs text-stone-300 space-y-1">
                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                      Kroki wykonania (Instrukcja combo):
                    </span>
                    <p className="whitespace-pre-line text-stone-300 leading-relaxed font-sans text-xs">
                      {variant.description}
                    </p>
                  </div>
                )}

                {/* Prerequisites if any */}
                {(variant.easyPrerequisites || variant.notablePrerequisites) && (
                  <div className="text-[11px] text-stone-400 bg-stone-900/40 p-2.5 rounded-lg border border-stone-800 flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-stone-300">Wymagania wstępne: </span>
                      <span>{variant.easyPrerequisites || variant.notablePrerequisites}</span>
                    </div>
                  </div>
                )}

                {/* Footer Link to Commander Spellbook */}
                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                  <span>Źródło: Commander Spellbook DB</span>
                  <a
                    href={`https://commanderspellbook.com/combo/${variant.id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-amber-400/80 hover:text-amber-300 transition-colors"
                  >
                    <span>Zobacz w Commander Spellbook</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Banner */}
        <div className="px-6 py-3 bg-stone-950 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-400 gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>
              API Commander Spellbook wspiera wykrywanie ponad 20,000 combosów Magic: The Gathering.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeckCombosModal;
