import React, { useState, useCallback } from 'react';
import { ScryfallCard } from '../types';
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

// Re-export constants for external consumers if needed
export { DECK_CATEGORIES, getCardCategory };

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  collection,
  settings,
  onUpdateDeck,
  onBack,
  onViewCardDetails,
}) => {
  // Hover preview state
  const [hoveredCard, setHoveredCard] = useState<ScryfallCard | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

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
    </div>
  );
};

export default DeckBuilder;
