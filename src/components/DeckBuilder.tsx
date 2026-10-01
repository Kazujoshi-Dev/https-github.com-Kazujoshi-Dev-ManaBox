import React, { useState, useCallback } from 'react';
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

      {/* 3. Main Stacked Categories Board */}
      <DeckCategoriesBoard
        categorizedCards={categorizedCards}
        settings={settings}
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
