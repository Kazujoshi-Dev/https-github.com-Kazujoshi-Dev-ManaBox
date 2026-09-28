import React, { useState, useMemo } from 'react';
import { DeckItem, DeckCardEntry, ScryfallCard, AppSettings, CollectionItem } from '../types';
import { getCardPrice, formatCurrency } from '../utils/formatters';
import { 
  Crown, 
  Swords, 
  Plus, 
  Trash2, 
  Search, 
  ArrowLeft, 
  SlidersHorizontal, 
  Sparkles, 
  ShieldCheck, 
  ExternalLink,
  ChevronDown,
  Layers,
  BarChart2,
  X,
  PlusCircle,
  MinusCircle,
  Flame,
  Check
} from 'lucide-react';

interface DeckBuilderProps {
  deck: DeckItem;
  collection: CollectionItem[];
  settings: AppSettings;
  onUpdateDeck: (updated: DeckItem) => void;
  onBack: () => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export const DECK_CATEGORIES = [
  { id: 'Dowódca', name: 'Dowódca (Commander)', icon: '👑', color: 'amber', border: 'border-amber-500/40', badge: 'bg-amber-500/20 text-amber-300' },
  { id: 'Stwory', name: 'Stwory (Creatures)', icon: '🐉', color: 'emerald', border: 'border-emerald-500/40', badge: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'Czary natychmiastowe', name: 'Czary natychmiastowe (Instants)', icon: '⚡', color: 'cyan', border: 'border-cyan-500/40', badge: 'bg-cyan-500/20 text-cyan-300' },
  { id: 'Czary', name: 'Czary główne (Sorceries)', icon: '📜', color: 'blue', border: 'border-blue-500/40', badge: 'bg-blue-500/20 text-blue-300' },
  { id: 'Artefakty', name: 'Artefakty (Artifacts)', icon: '✨', color: 'stone', border: 'border-stone-500/40', badge: 'bg-stone-500/20 text-stone-300' },
  { id: 'Zaczarowania', name: 'Zaczarowania (Enchantments)', icon: '🔮', color: 'purple', border: 'border-purple-500/40', badge: 'bg-purple-500/20 text-purple-300' },
  { id: 'Planeswalkerzy', name: 'Planeswalkerzy', icon: '🛡️', color: 'rose', border: 'border-rose-500/40', badge: 'bg-rose-500/20 text-rose-300' },
  { id: 'Lądy', name: 'Lądy (Lands)', icon: '🏔️', color: 'yellow', border: 'border-yellow-500/40', badge: 'bg-yellow-500/20 text-yellow-300' },
  { id: 'Inne', name: 'Inne czary', icon: '⚔️', color: 'stone', border: 'border-stone-500/40', badge: 'bg-stone-500/20 text-stone-300' },
];

export function getCardCategory(card: ScryfallCard, isCommander?: boolean): string {
  if (isCommander) return 'Dowódca';
  const type = (card.type_line || '').toLowerCase();
  if (type.includes('creature')) return 'Stwory';
  if (type.includes('instant')) return 'Czary natychmiastowe';
  if (type.includes('sorcery')) return 'Czary';
  if (type.includes('artifact')) return 'Artefakty';
  if (type.includes('enchantment')) return 'Zaczarowania';
  if (type.includes('planeswalker')) return 'Planeswalkerzy';
  if (type.includes('land')) return 'Lądy';
  return 'Inne';
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  collection,
  settings,
  onUpdateDeck,
  onBack,
  onViewCardDetails
}) => {
  const [hoveredCard, setHoveredCard] = useState<ScryfallCard | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [isSearchingScryfall, setIsSearchingScryfall] = useState(false);

  // Total cards in deck
  const totalCardsCount = useMemo(() => {
    let count = deck.commander ? 1 : 0;
    deck.cards.forEach(entry => {
      count += entry.quantity;
    });
    return count;
  }, [deck]);

  // Total estimated value
  const totalDeckValue = useMemo(() => {
    let val = 0;
    if (deck.commander) {
      val += getCardPrice(deck.commander, false, settings);
    }
    deck.cards.forEach(entry => {
      val += getCardPrice(entry.card, false, settings) * entry.quantity;
    });
    return val;
  }, [deck, settings]);

  // Group cards by category
  const categorizedCards = useMemo(() => {
    const map = new Map<string, DeckCardEntry[]>();
    DECK_CATEGORIES.forEach(cat => map.set(cat.id, []));

    deck.cards.forEach(entry => {
      const cat = getCardCategory(entry.card, entry.isCommander);
      const list = map.get(cat) || [];
      list.push(entry);
      map.set(cat, list);
    });

    return map;
  }, [deck]);

  // Mana curve stats
  const manaCurve = useMemo(() => {
    const curve = [0, 0, 0, 0, 0, 0, 0]; // 0, 1, 2, 3, 4, 5, 6+
    deck.cards.forEach(entry => {
      if ((entry.card.type_line || '').toLowerCase().includes('land')) return;
      const cmc = Math.floor(entry.card.cmc || 0);
      const index = Math.min(cmc, 6);
      curve[index] += entry.quantity;
    });
    return curve;
  }, [deck]);

  // Color identity
  const colorIdentity = useMemo(() => {
    if (deck.commander?.color_identity && deck.commander.color_identity.length > 0) {
      return deck.commander.color_identity;
    }
    const colors = new Set<string>();
    deck.cards.forEach(e => {
      e.card.color_identity?.forEach(c => colors.add(c));
    });
    return Array.from(colors);
  }, [deck]);

  // Quick search handler (from user collection first, then Scryfall)
  const handleSearchCards = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // 1. Search in user collection first
    const qLower = query.toLowerCase();
    const localMatches = collection
      .filter(item => item.card.name.toLowerCase().includes(qLower))
      .map(item => item.card)
      .slice(0, 8);

    setSearchResults(localMatches);

    // 2. Fetch from Scryfall if query >= 3 chars
    if (query.trim().length >= 3) {
      setIsSearchingScryfall(true);
      try {
        const res = await fetch(`/api/scryfall/cards/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            // merge without duplicates
            const existingIds = new Set(localMatches.map(c => c.id));
            const newCards = data.data.filter((c: ScryfallCard) => !existingIds.has(c.id)).slice(0, 12);
            setSearchResults([...localMatches, ...newCards]);
          }
        }
      } catch (err) {
        console.error('Scryfall search error in deck builder:', err);
      } finally {
        setIsSearchingScryfall(false);
      }
    }
  };

  const handleAddCardToDeck = (card: ScryfallCard, asCommander = false) => {
    if (asCommander) {
      onUpdateDeck({
        ...deck,
        commander: card
      });
      setIsSearchOpen(false);
      return;
    }

    const existingIdx = deck.cards.findIndex(e => e.card.id === card.id || e.card.name === card.name);
    let updatedCards = [...deck.cards];

    if (existingIdx >= 0) {
      // In EDH Commander format, non-basic lands can only have 1 copy!
      const isBasic = (card.type_line || '').toLowerCase().includes('basic');
      if (deck.format === 'EDH Commander' && !isBasic && updatedCards[existingIdx].quantity >= 1) {
        // Show subtle notification or skip
      } else {
        updatedCards[existingIdx].quantity += 1;
      }
    } else {
      updatedCards.push({
        card,
        quantity: 1,
        isCommander: false
      });
    }

    onUpdateDeck({
      ...deck,
      cards: updatedCards
    });
  };

  const handleUpdateQuantity = (cardId: string, delta: number) => {
    let updatedCards = [...deck.cards];
    const idx = updatedCards.findIndex(e => e.card.id === cardId);
    if (idx === -1) return;

    const newQty = updatedCards[idx].quantity + delta;
    if (newQty <= 0) {
      updatedCards = updatedCards.filter(e => e.card.id !== cardId);
    } else {
      updatedCards[idx].quantity = newQty;
    }

    onUpdateDeck({
      ...deck,
      cards: updatedCards
    });
  };

  const handleRemoveCard = (cardId: string) => {
    onUpdateDeck({
      ...deck,
      cards: deck.cards.filter(e => e.card.id !== cardId)
    });
  };

  const handleSetCommander = (card: ScryfallCard) => {
    // Remove from deck cards if it was in the 99
    const filteredCards = deck.cards.filter(e => e.card.id !== card.id && e.card.name !== card.name);
    onUpdateDeck({
      ...deck,
      commander: card,
      cards: filteredCards
    });
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* Top Deck Info Bar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          {/* Deck Title & Format */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition-colors cursor-pointer"
              title="Wróć do listy kolekcji"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-stone-100 tracking-tight">
                  {deck.name}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 font-mono">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>{deck.format || 'EDH Commander'}</span>
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {deck.description || 'Talia w formacie EDH Commander (1 Dowódca + 99 kart w talii)'}
              </p>
            </div>
          </div>

          {/* Metrics & Actions */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            
            {/* Card Count Indicator */}
            <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
              <span className="text-xs text-stone-400">Liczba kart:</span>
              <span className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                totalCardsCount === 100
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : totalCardsCount > 100
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {totalCardsCount} / 100
              </span>
            </div>

            {/* Total Estimated Deck Value */}
            <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
              <span className="text-xs text-stone-400">Wartość rynkowa:</span>
              <span className="text-sm font-black text-amber-300 font-mono">
                {formatCurrency(totalDeckValue, settings.currency)}
              </span>
            </div>

            {/* Add Card to Deck Button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs rounded-xl shadow-lg shadow-amber-950/40 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Dodaj kartę do talii</span>
            </button>
          </div>

        </div>

        {/* Commander Featured Card Showcase */}
        {deck.commander && (
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-amber-950/30 via-stone-950 to-purple-950/20 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative w-16 h-20 rounded-lg overflow-hidden border-2 border-amber-400 shadow-md shrink-0">
                <img
                  src={deck.commander.image_uris?.art_crop || deck.commander.image_uris?.normal}
                  alt={deck.commander.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                    👑 Dowódca Talii
                  </span>
                  <span className="text-xs font-mono text-amber-300 font-bold">
                    {deck.commander.mana_cost}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {deck.commander.name}
                </h3>
                <p className="text-xs text-stone-400">
                  {deck.commander.type_line}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewCardDetails(deck.commander!)}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Szczegóły karty
              </button>
              <button
                onClick={() => onUpdateDeck({ ...deck, commander: null })}
                className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                title="Usuń dowódcę"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mana Curve & Quick Stats Bar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        
        {/* Mana Curve Bars */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-stone-400 uppercase tracking-wider font-mono mr-2">
            Krzywa Many (CMC):
          </span>
          {manaCurve.map((count, cmc) => {
            const maxVal = Math.max(...manaCurve, 1);
            const heightPercent = Math.min(100, Math.max(15, (count / maxVal) * 100));
            return (
              <div key={cmc} className="flex flex-col items-center gap-1">
                <div className="w-6 h-10 bg-stone-950 rounded flex items-end justify-center p-0.5 border border-stone-800">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-sm transition-all"
                  />
                </div>
                <span className="text-[10px] font-mono text-stone-400">
                  {cmc === 6 ? '6+' : cmc} ({count})
                </span>
              </div>
            );
          })}
        </div>

        {/* Color Identity Dots */}
        {colorIdentity.length > 0 && (
          <div className="flex items-center gap-2 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800">
            <span className="text-stone-400 font-bold">Tożsamość kolorów:</span>
            <div className="flex items-center gap-1.5">
              {colorIdentity.map(col => {
                const colorMap: Record<string, string> = {
                  W: 'bg-amber-100 text-stone-900 border-amber-300',
                  U: 'bg-blue-500 text-white border-blue-400',
                  B: 'bg-stone-800 text-stone-200 border-stone-600',
                  R: 'bg-red-500 text-white border-red-400',
                  G: 'bg-emerald-500 text-white border-emerald-400',
                };
                return (
                  <span
                    key={col}
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] border shadow-sm ${
                      colorMap[col] || 'bg-stone-700 text-white'
                    }`}
                  >
                    {col}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Stacked Categories Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
        {DECK_CATEGORIES.map(category => {
          const cardsInCat = categorizedCards.get(category.id) || [];
          if (cardsInCat.length === 0 && category.id !== 'Dowódca') return null;

          const totalCatQty = cardsInCat.reduce((sum, e) => sum + e.quantity, 0);

          return (
            <div
              key={category.id}
              className="bg-stone-900/90 border border-stone-800 rounded-2xl p-3.5 shadow-xl flex flex-col space-y-2 backdrop-blur-md"
            >
              {/* Category Header Badge */}
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">{category.icon}</span>
                  <h4 className="font-bold text-xs text-stone-200 uppercase tracking-wide">
                    {category.name}
                  </h4>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${category.badge}`}>
                  {totalCatQty}
                </span>
              </div>

              {/* Stack of Cards (Stakujące się karty) */}
              <div className="space-y-1.5 pt-1">
                {cardsInCat.length === 0 ? (
                  <div className="py-6 text-center text-xs text-stone-500">
                    Brak kart w tej kategorii
                  </div>
                ) : (
                  cardsInCat.map(entry => {
                    const card = entry.card;
                    const price = getCardPrice(card, false, settings);

                    return (
                      <div
                        key={card.id}
                        onMouseEnter={(e) => {
                          setHoveredCard(card);
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoverPosition({ x: rect.right + 10, y: Math.max(20, rect.top - 60) });
                        }}
                        onMouseLeave={() => setHoveredCard(null)}
                        className="group relative h-10 w-full rounded-xl overflow-hidden border border-stone-700/80 hover:border-amber-400/80 transition-all shadow-md hover:shadow-amber-500/10 cursor-pointer flex items-center justify-between px-2.5"
                      >
                        {/* Artwork banner background crop */}
                        <div
                          className="absolute inset-0 bg-cover bg-center brightness-70 group-hover:brightness-95 transition-all scale-100 group-hover:scale-105"
                          style={{
                            backgroundImage: `url(${card.image_uris?.art_crop || card.image_uris?.normal || ''})`,
                            backgroundPosition: 'center 25%'
                          }}
                        />

                        {/* High-legibility text gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/95 via-stone-950/70 to-stone-950/40 group-hover:from-stone-950/90 group-hover:via-stone-950/50 transition-colors" />

                        {/* Left: Quantity Badge & Card Name */}
                        <div className="relative z-10 flex items-center gap-2 min-w-0 pr-2">
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 shrink-0">
                            {entry.quantity}x
                          </span>
                          <span className="font-bold text-xs text-stone-100 truncate group-hover:text-amber-200 transition-colors drop-shadow-md">
                            {card.name}
                          </span>
                        </div>

                        {/* Right: Mana Cost, Price & Quick Actions */}
                        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                          {card.mana_cost && (
                            <span className="text-[11px] font-mono font-bold text-amber-300 drop-shadow">
                              {card.mana_cost}
                            </span>
                          )}

                          {/* Action controls (visible on group hover) */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-stone-950/90 rounded-lg px-1 py-0.5 border border-stone-700">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateQuantity(card.id, 1);
                              }}
                              className="text-stone-400 hover:text-emerald-400 p-0.5"
                              title="Zwiększ ilość"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateQuantity(card.id, -1);
                              }}
                              className="text-stone-400 hover:text-rose-400 p-0.5"
                              title="Zmniejsz ilość"
                            >
                              <MinusCircle className="w-3.5 h-3.5" />
                            </button>

                            {!entry.isCommander && (card.type_line || '').toLowerCase().includes('legendary') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetCommander(card);
                                }}
                                className="text-stone-400 hover:text-amber-300 p-0.5"
                                title="Ustaw jako Dowódcę"
                              >
                                <Crown className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewCardDetails(card);
                              }}
                              className="text-stone-400 hover:text-blue-300 p-0.5"
                              title="Szczegóły karty"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Card Image Preview on Hover */}
      {hoveredCard && hoverPosition && (
        <div
          className="fixed pointer-events-none z-50 transition-opacity duration-150 animate-fadeIn"
          style={{
            left: `${Math.min(window.innerWidth - 260, hoverPosition.x)}px`,
            top: `${Math.min(window.innerHeight - 380, hoverPosition.y)}px`
          }}
        >
          <div className="w-56 rounded-2xl overflow-hidden shadow-2xl border border-amber-500/50 bg-stone-900 ring-4 ring-black/80">
            <img
              src={hoveredCard.image_uris?.normal || hoveredCard.image_uris?.large}
              alt={hoveredCard.name}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      )}

      {/* Add Card to Deck Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">
                  Dodaj kartę do talii "{deck.name}"
                </h3>
              </div>
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-stone-800">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Wyszukaj kartę z Twojej kolekcji lub ze Scryfall..."
                  value={searchQuery}
                  onChange={(e) => handleSearchCards(e.target.value)}
                  autoFocus
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isSearchingScryfall && (
                <div className="text-center py-4 text-xs text-amber-400">
                  Wyszukiwanie w Scryfall API...
                </div>
              )}

              {searchResults.length === 0 && searchQuery.trim() && !isSearchingScryfall && (
                <div className="text-center py-8 text-xs text-stone-500">
                  Nie znaleziono pasujących kart.
                </div>
              )}

              {searchResults.length === 0 && !searchQuery.trim() && (
                <div className="text-center py-8 text-xs text-stone-400">
                  Wpisz nazwę karty, aby dodać ją do talii.
                </div>
              )}

              {searchResults.map(card => {
                const inDeck = deck.cards.find(e => e.card.id === card.id || e.card.name === card.name);
                const isLegendary = (card.type_line || '').toLowerCase().includes('legendary');

                return (
                  <div
                    key={card.id}
                    className="p-3 bg-stone-950 hover:bg-stone-850 rounded-xl border border-stone-800 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 rounded overflow-hidden border border-stone-700 shrink-0">
                        <img
                          src={card.image_uris?.art_crop || card.image_uris?.small}
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-xs text-stone-100 truncate">
                            {card.name}
                          </h4>
                          {card.mana_cost && (
                            <span className="text-[11px] font-mono text-amber-300">
                              {card.mana_cost}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-400 truncate">
                          {card.type_line} • {card.set_name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isLegendary && (
                        <button
                          onClick={() => handleAddCardToDeck(card, true)}
                          className="px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-purple-500/40"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Dowódca</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleAddCardToDeck(card, false)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Dodaj ({inDeck?.quantity || 0})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
