import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, Sliders, ArrowDownWideNarrow } from 'lucide-react';
import { ScryfallCard, DeckCardEntry, DeckItem } from '../types';
import {
  DeckBuilderProps,
  DECK_CATEGORIES,
  getCardCategory,
  DeckHeader,
  CommanderShowcase,
  DeckStatsBar,
  DeckCategoriesBoard,
  FloatingCardPreview,
  DeckAddCardModal,
  useDeckStats,
  useDeckSearch,
} from './deck-builder';
import { DeckImportExportModal } from './DeckImportExportModal';
import { DeckCombosModal } from './deck-builder/DeckCombosModal';
import { wishlistApi } from '../services/api';

// Re-export constants for external consumers if needed
export { DECK_CATEGORIES, getCardCategory };

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  collection,
  settings,
  onUpdateDeck,
  onBack,
  onViewCardDetails,
  onUpdateSettings,
  showToast = (_msg: string) => {},
}) => {
  // Hover preview state
  const [hoveredCard, setHoveredCard] = useState<ScryfallCard | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Deck Import / Export Modal state
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');

  // Commander Spellbook Combos Modal state
  const [isCombosModalOpen, setIsCombosModalOpen] = useState(false);

  // User adjustable card preview scale (persisted in user AppSettings)
  const [previewScale, setPreviewScale] = useState<number>(settings.deckCardPreviewScale || 100);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (settings.deckCardPreviewScale && settings.deckCardPreviewScale !== previewScale) {
      setPreviewScale(settings.deckCardPreviewScale);
    }
  }, [settings.deckCardPreviewScale]);

  const handleScaleChange = useCallback((newScale: number) => {
    const clamped = Math.max(75, Math.min(160, Math.round(newScale)));
    setPreviewScale(clamped);

    if (onUpdateSettings) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateSettings({
          ...settings,
          deckCardPreviewScale: clamped,
        });
      }, 400);
    }
  }, [settings, onUpdateSettings]);

  // Deck statistics hook (curve, counts, valuations, categories)
  const {
    totalCardsCount,
    totalDeckValue,
    categorizedCards,
    manaCurve,
    colorIdentity,
  } = useDeckStats({ deck, settings });

  // Search & add card modal hook
  const {
    isSearchOpen,
    searchQuery,
    searchSource,
    searchResults,
    isSearchingScryfall,
    setSearchSource,
    openSearchModal,
    closeSearchModal,
    handleSearchCards,
  } = useDeckSearch({ deck, collection });

  // Hover triggers
  const handleHoverCard = useCallback((card: ScryfallCard, e: React.MouseEvent) => {
    setHoveredCard(card);
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPosition({ x: rect.right + 10, y: Math.max(20, rect.top - 60) });
  }, []);

  const handleLeaveCard = useCallback(() => {
    setHoveredCard(null);
  }, []);

  // Card Operations
  const handleAddCardToDeck = useCallback((card: ScryfallCard, asCommander = false) => {
    if (asCommander) {
      onUpdateDeck({
        ...deck,
        commander: card,
      });
      closeSearchModal();
      return;
    }

    const existingIdx = deck.cards.findIndex(e => e.card.id === card.id || e.card.name === card.name);
    let updatedCards = [...deck.cards];

    if (existingIdx >= 0) {
      // In EDH Commander format, non-basic lands can only have 1 copy
      const isBasic = (card.type_line || '').toLowerCase().includes('basic');
      if (deck.format === 'EDH Commander' && !isBasic && updatedCards[existingIdx].quantity >= 1) {
        // singleton rule for EDH
      } else {
        updatedCards[existingIdx].quantity += 1;
      }
    } else {
      updatedCards.push({
        card,
        quantity: 1,
        isCommander: false,
      });
    }

    onUpdateDeck({
      ...deck,
      cards: updatedCards,
    });
  }, [deck, onUpdateDeck, closeSearchModal]);

  const handleUpdateQuantity = useCallback((cardId: string, delta: number) => {
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
      cards: updatedCards,
    });
  }, [deck, onUpdateDeck]);

  const handleSetCommander = useCallback((card: ScryfallCard) => {
    // Remove from the main 99 if it was in the deck
    const filteredCards = deck.cards.filter(e => e.card.id !== card.id && e.card.name !== card.name);
    onUpdateDeck({
      ...deck,
      commander: card,
      cards: filteredCards,
    });
  }, [deck, onUpdateDeck]);

  const handleRemoveCommander = useCallback(() => {
    onUpdateDeck({
      ...deck,
      commander: null,
    });
  }, [deck, onUpdateDeck]);

  const handleToggleCardSource = useCallback(() => {
    const nextSource = (deck.cardSource || 'collection') === 'collection' ? 'all' : 'collection';
    onUpdateDeck({
      ...deck,
      cardSource: nextSource,
    });
    setSearchSource(nextSource);
  }, [deck, onUpdateDeck, setSearchSource]);

  // Spellbook combo quick actions
  const handleAddCardByName = useCallback(async (cardName: string) => {
    try {
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        const card: ScryfallCard = await res.json();
        handleAddCardToDeck(card);
        showToast(`Dodano kartę "${card.name}" do talii!`);
      } else {
        const fuzzyRes = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzyRes.ok) {
          const card: ScryfallCard = await fuzzyRes.json();
          handleAddCardToDeck(card);
          showToast(`Dodano kartę "${card.name}" do talii!`);
        } else {
          showToast(`Nie znaleziono karty "${cardName}" w bazie Scryfall.`);
        }
      }
    } catch (err: any) {
      showToast(`Błąd dodawania karty: ${err.message}`);
    }
  }, [handleAddCardToDeck, showToast]);

  const handleAddToWishlistByName = useCallback(async (cardName: string) => {
    try {
      let card: ScryfallCard | null = null;
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        card = await res.json();
      } else {
        const fuzzyRes = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzyRes.ok) {
          card = await fuzzyRes.json();
        }
      }

      if (!card) {
        showToast(`Nie znaleziono karty "${cardName}".`);
        return;
      }

      await wishlistApi.create({
        cardId: card.id,
        card,
        targetQuantity: 1,
        isFoil: false
      });
      showToast(`Dodano "${card.name}" do Twojej Wishlisty!`);
    } catch (err: any) {
      showToast(`Błąd dodawania do Wishlisty: ${err.message}`);
    }
  }, [showToast]);

  const handleViewCardDetailsByName = useCallback(async (cardName: string) => {
    try {
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        const card: ScryfallCard = await res.json();
        onViewCardDetails(card);
      } else {
        const fuzzy = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzy.ok) {
          const card: ScryfallCard = await fuzzy.json();
          onViewCardDetails(card);
        }
      }
    } catch (_) {}
  }, [onViewCardDetails]);

  const handleUpdateDeckCards = useCallback(
    async (
      newCards: DeckCardEntry[],
      newCommander?: ScryfallCard | null,
      mode: 'append' | 'replace' = 'append'
    ) => {
      let finalCards: DeckCardEntry[] = [];
      if (mode === 'replace') {
        finalCards = newCards;
      } else {
        finalCards = [...deck.cards];
        for (const item of newCards) {
          const idx = finalCards.findIndex(
            (c) =>
              c.card.id === item.card.id ||
              c.card.name.toLowerCase() === item.card.name.toLowerCase()
          );
          const isBasic = (item.card.type_line || '').toLowerCase().includes('basic');
          if (idx >= 0) {
            if (isBasic) {
              finalCards[idx].quantity += item.quantity;
            }
          } else {
            finalCards.push(item);
          }
        }
      }

      const updatedDeck: DeckItem = {
        ...deck,
        commander: newCommander !== undefined ? newCommander : deck.commander,
        cards: finalCards,
      };

      onUpdateDeck(updatedDeck);
    },
    [deck, onUpdateDeck]
  );

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Top Deck Info & Actions Bar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl">
        <DeckHeader
          name={deck.name}
          format={deck.format}
          description={deck.description}
          cardSource={deck.cardSource || 'collection'}
          totalCardsCount={totalCardsCount}
          totalDeckValue={totalDeckValue}
          currency={settings.currency}
          onBack={onBack}
          onToggleCardSource={handleToggleCardSource}
          onOpenAddModal={openSearchModal}
          onOpenImportExport={() => {
            setImportExportTab('export');
            setIsImportExportOpen(true);
          }}
          onOpenCombos={() => setIsCombosModalOpen(true)}
        />

        {/* Commander Featured Showcase / Select Placeholder */}
        <CommanderShowcase
          commander={deck.commander}
          commanderIsFoil={deck.commanderIsFoil}
          settings={settings}
          onViewDetails={onViewCardDetails}
          onRemoveCommander={handleRemoveCommander}
          onOpenSearch={openSearchModal}
        />
      </div>

      {/* 2. Mana Curve & Color Identity Bar */}
      <DeckStatsBar
        manaCurve={manaCurve}
        colorIdentity={colorIdentity}
      />

      {/* 2b. Board Toolbar: Categories Sorting Info & Card Preview Size Slider */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-xs text-stone-300">
          <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <ArrowDownWideNarrow className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-stone-100 block">Kategorie posortowane od najliczniejszych</span>
            <span className="text-[11px] text-stone-400">Typy kart z największą liczbą sztuk wyświetlane są na początku planszy</span>
          </div>
        </div>

        {/* Card Preview Scale Slider */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-2.5 bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 shadow-inner w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs text-stone-300 font-semibold flex items-center gap-1.5 shrink-0">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Podgląd kart:</span>
            </span>

            <button
              type="button"
              onClick={() => handleScaleChange(previewScale - 10)}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-stone-900 rounded-md transition-colors cursor-pointer"
              title="Zmniejsz podgląd"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="75"
              max="160"
              step="5"
              value={previewScale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="w-24 sm:w-32 accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded-lg"
              title={`Skala podglądu kart: ${previewScale}%`}
            />

            <button
              type="button"
              onClick={() => handleScaleChange(previewScale + 10)}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-stone-900 rounded-md transition-colors cursor-pointer"
              title="Powiększ podgląd"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-amber-300 min-w-[2.8rem] text-right">
              {previewScale}%
            </span>

            {previewScale !== 100 && (
              <button
                type="button"
                onClick={() => handleScaleChange(100)}
                className="text-[11px] font-semibold text-stone-500 hover:text-amber-300 ml-1 underline transition-colors cursor-pointer"
                title="Przywróć domyślne 100%"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Main Stacked Categories Board */}
      <DeckCategoriesBoard
        categorizedCards={categorizedCards}
        settings={settings}
        previewScale={previewScale}
        onHoverCard={handleHoverCard}
        onLeaveCard={handleLeaveCard}
        onUpdateQuantity={handleUpdateQuantity}
        onSetCommander={handleSetCommander}
        onViewCardDetails={onViewCardDetails}
      />

      {/* 4. Floating Card Preview on Hover */}
      <FloatingCardPreview
        card={hoveredCard}
        position={hoverPosition}
        scale={previewScale}
      />

      {/* 5. Add Card to Deck Modal */}
      <DeckAddCardModal
        isOpen={isSearchOpen}
        deckName={deck.name}
        collection={collection}
        deckCards={deck.cards}
        searchSource={searchSource}
        searchQuery={searchQuery}
        searchResults={searchResults}
        isSearchingScryfall={isSearchingScryfall}
        onClose={closeSearchModal}
        onSearchChange={handleSearchCards}
        onSourceChange={setSearchSource}
        onAddCard={handleAddCardToDeck}
      />

      {/* 6. Deck Import / Export (.txt) Modal */}
      {isImportExportOpen && (
        <DeckImportExportModal
          isOpen={isImportExportOpen}
          deck={deck}
          initialTab={importExportTab}
          onClose={() => setIsImportExportOpen(false)}
          onUpdateDeckCards={handleUpdateDeckCards}
          showToast={showToast}
        />
      )}

      {/* 7. Commander Spellbook Combos Modal */}
      {isCombosModalOpen && (
        <DeckCombosModal
          isOpen={isCombosModalOpen}
          deck={deck}
          onClose={() => setIsCombosModalOpen(false)}
          onAddCardToDeck={handleAddCardByName}
          onAddToWishlist={handleAddToWishlistByName}
          onViewCardDetails={handleViewCardDetailsByName}
        />
      )}
    </div>
  );
};

export default DeckBuilder;
