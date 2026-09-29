import React, { useState, useCallback } from 'react';
import { ScryfallCard, CollectionItem, DeckItem, CardCondition, CardLanguage } from './types';
import { Header } from './components/Header';
import { AuthView } from './components/AuthView';
import { TabContent, NavigationTab } from './components/TabContent';
import { SettingsModal } from './components/SettingsModal';
import { CardModal } from './components/CardModal';
import { DeckCreateModal } from './components/DeckCreateModal';
import { Toast } from './components/Toast';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { useSettings } from './hooks/useSettings';
import { useCollectionStats } from './hooks/useCollectionStats';
import { useAppData } from './hooks/useAppData';

export default function App() {
  const { toastMessage, showToast } = useToast();
  const { currentUser, handleAuthSuccess, handleLogout, handleUnauthorized } = useAuth(showToast);
  const { settings, updateSettings, applyRemoteSettings } = useSettings(handleUnauthorized);

  const {
    collection,
    wishlist,
    catalogs,
    decks,
    isLoading,
    isRefreshingPrices,
    deleteCollectionItem,
    updateQuantity,
    saveToCollection,
    quickAddToCollection,
    addToWishlist,
    removeFromWishlist,
    createCatalog,
    updateCatalog,
    setDefaultCatalog,
    deleteCatalog,
    createDeck,
    updateDeck,
    deleteDeck,
    refreshPrices,
    exportCollection,
    importCollection
  } = useAppData({
    userId: currentUser?.id,
    onUnauthorized: handleUnauthorized,
    showToast,
    onSettingsLoaded: applyRemoteSettings
  });

  const totals = useCollectionStats(collection, settings);

  // Navigation & Active View State
  const [activeTab, setActiveTab] = useState<NavigationTab>('collection');
  const [selectedDeck, setSelectedDeck] = useState<DeckItem | null>(null);

  // Modal Visibility States
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDeckCreateModalOpen, setIsDeckCreateModalOpen] = useState<boolean>(false);
  const [selectedCardForModal, setSelectedCardForModal] = useState<ScryfallCard | null>(null);
  const [selectedCollectionItemForModal, setSelectedCollectionItemForModal] = useState<CollectionItem | null>(null);
  const [deckCardBeingViewed, setDeckCardBeingViewed] = useState<ScryfallCard | null>(null);
  const [deckCardIsFoil, setDeckCardIsFoil] = useState<boolean | undefined>(undefined);

  // Modal Handlers
  const handleOpenCardModal = useCallback((card: ScryfallCard, item: CollectionItem | null = null) => {
    setSelectedCardForModal(card);
    setSelectedCollectionItemForModal(item);
    setDeckCardIsFoil(item ? item.quantityFoil > 0 : undefined);
  }, []);

  const handleOpenDeckCardModal = useCallback((card: ScryfallCard) => {
    setDeckCardBeingViewed(card);
    let isFoil = false;
    if (selectedDeck) {
      if (selectedDeck.commander && (selectedDeck.commander.id === card.id || selectedDeck.commander.name.toLowerCase() === card.name.toLowerCase())) {
        isFoil = Boolean(selectedDeck.commanderIsFoil);
      } else {
        const found = selectedDeck.cards.find(e => e.card.id === card.id || e.card.name.toLowerCase() === card.name.toLowerCase());
        isFoil = Boolean(found?.isFoil);
      }
    }
    setDeckCardIsFoil(isFoil);
    const existing = collection.find(c => c.card.id === card.id || c.card.name.toLowerCase() === card.name.toLowerCase()) || null;
    setSelectedCardForModal(card);
    setSelectedCollectionItemForModal(existing);
  }, [collection, selectedDeck]);

  const handleCardPrintSelectedInModal = useCallback((newCard: ScryfallCard) => {
    const targetCard = deckCardBeingViewed || selectedCardForModal;
    if (!targetCard) return;

    const targetId = targetCard.id;
    const targetName = targetCard.name.toLowerCase();

    // 1. Update active deck if present
    if (selectedDeck) {
      const isCommander = Boolean(
        selectedDeck.commander && 
        (selectedDeck.commander.id === targetId || selectedDeck.commander.name.toLowerCase() === targetName)
      );

      const updatedCommander = isCommander ? newCard : selectedDeck.commander;

      const updatedCards = selectedDeck.cards.map(entry => {
        if (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName) {
          return {
            ...entry,
            card: newCard,
          };
        }
        return entry;
      });

      const updatedDeck: DeckItem = {
        ...selectedDeck,
        commander: updatedCommander,
        cards: updatedCards,
      };

      setSelectedDeck(updatedDeck);
      updateDeck(updatedDeck);
      if (deckCardBeingViewed) {
        setDeckCardBeingViewed(newCard);
      }
    }

    // 2. Also sync other decks that contain this card
    decks.forEach(deck => {
      if (selectedDeck && deck.id === selectedDeck.id) return;
      const hasCommander = Boolean(deck.commander && (deck.commander.id === targetId || deck.commander.name.toLowerCase() === targetName));
      const hasInCards = deck.cards.some(entry => entry.card.id === targetId || entry.card.name.toLowerCase() === targetName);

      if (hasCommander || hasInCards) {
        const updatedDeck: DeckItem = {
          ...deck,
          commander: hasCommander ? newCard : deck.commander,
          cards: deck.cards.map(entry => 
            (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName)
              ? { ...entry, card: newCard }
              : entry
          ),
        };
        updateDeck(updatedDeck);
      }
    });

    // 3. Update collection item if present
    if (selectedCollectionItemForModal) {
      saveToCollection({
        card: newCard,
        quantity: selectedCollectionItemForModal.quantity,
        quantityFoil: selectedCollectionItemForModal.quantityFoil,
        condition: selectedCollectionItemForModal.condition,
        language: selectedCollectionItemForModal.language,
        purchasePrice: selectedCollectionItemForModal.purchasePrice,
        notes: selectedCollectionItemForModal.notes,
        binder: selectedCollectionItemForModal.binder,
      }, selectedCollectionItemForModal);
    }

    showToast(`Zaktualizowano wersję [${newCard.set.toUpperCase()}] #${newCard.collector_number} dla "${newCard.name}"!`);
  }, [deckCardBeingViewed, selectedCardForModal, selectedDeck, decks, selectedCollectionItemForModal, updateDeck, saveToCollection, showToast]);

  const handleCardFoilToggledInModal = useCallback((isFoil: boolean) => {
    const targetCard = deckCardBeingViewed || selectedCardForModal;
    if (!targetCard) return;

    const targetId = targetCard.id;
    const targetName = targetCard.name.toLowerCase();

    // 1. Update active deck if present
    if (selectedDeck) {
      const isCommander = Boolean(
        selectedDeck.commander && 
        (selectedDeck.commander.id === targetId || selectedDeck.commander.name.toLowerCase() === targetName)
      );

      const updatedCommanderIsFoil = isCommander ? isFoil : selectedDeck.commanderIsFoil;

      const updatedCards = selectedDeck.cards.map(entry => {
        if (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName) {
          return {
            ...entry,
            isFoil,
          };
        }
        return entry;
      });

      const updatedDeck: DeckItem = {
        ...selectedDeck,
        commanderIsFoil: updatedCommanderIsFoil,
        cards: updatedCards,
      };

      setSelectedDeck(updatedDeck);
      updateDeck(updatedDeck);
    }

    // 2. Also sync other decks that contain this card
    decks.forEach(deck => {
      if (selectedDeck && deck.id === selectedDeck.id) return;
      const hasCommander = Boolean(deck.commander && (deck.commander.id === targetId || deck.commander.name.toLowerCase() === targetName));
      const hasInCards = deck.cards.some(entry => entry.card.id === targetId || entry.card.name.toLowerCase() === targetName);

      if (hasCommander || hasInCards) {
        const updatedDeck: DeckItem = {
          ...deck,
          commanderIsFoil: hasCommander ? isFoil : deck.commanderIsFoil,
          cards: deck.cards.map(entry => 
            (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName)
              ? { ...entry, isFoil }
              : entry
          ),
        };
        updateDeck(updatedDeck);
      }
    });

    setDeckCardIsFoil(isFoil);
    showToast(isFoil ? `Ustawiono wersję Foil ✨ dla "${targetCard.name}"!` : `Ustawiono wersję Standard dla "${targetCard.name}"!`);
  }, [deckCardBeingViewed, selectedCardForModal, selectedDeck, decks, updateDeck, showToast]);

  const handleCloseCardModal = useCallback(() => {
    setSelectedCardForModal(null);
    setSelectedCollectionItemForModal(null);
    setDeckCardBeingViewed(null);
    setDeckCardIsFoil(undefined);
  }, []);

  const handleSaveCardModal = useCallback(async (data: {
    card: ScryfallCard;
    quantity: number;
    quantityFoil: number;
    condition: CardCondition;
    language: CardLanguage;
    purchasePrice?: number | null;
    notes?: string;
    binder?: string;
  }) => {
    const updated = await saveToCollection(data, selectedCollectionItemForModal);
    if (updated && selectedCollectionItemForModal) {
      setSelectedCollectionItemForModal(updated);
      setSelectedCardForModal(updated.card);
    }
    // Also sync to deck if card was opened from deck
    if (selectedDeck && deckCardBeingViewed) {
      handleCardPrintSelectedInModal(data.card);
    }
  }, [saveToCollection, selectedCollectionItemForModal, selectedDeck, deckCardBeingViewed, handleCardPrintSelectedInModal]);

  const handleMoveWishlistToCollection = useCallback((wishlistItem: { id: string; card: ScryfallCard }) => {
    handleOpenCardModal(wishlistItem.card, null);
    removeFromWishlist(wishlistItem.id);
  }, [handleOpenCardModal, removeFromWishlist]);

  const handleCreateDeckSuccess = useCallback(async (data: {
    name: string;
    format: string;
    description: string;
    cardSource?: 'all' | 'collection';
    commander?: ScryfallCard | null;
  }) => {
    const newDeck = await createDeck(data);
    if (newDeck) {
      setSelectedDeck(newDeck);
      setActiveTab('decks');
    }
  }, [createDeck]);

  const handleDeleteDeckAndReset = useCallback(async (deckId: string) => {
    await deleteDeck(deckId);
    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null);
    }
  }, [deleteDeck, selectedDeck]);

  // Unauthenticated screen
  if (!currentUser) {
    return (
      <>
        <AuthView onAuthSuccess={(user, token) => {
          handleAuthSuccess(user, token);
          showToast(`Witaj w kolekcji, ${user.username}!`);
        }} />
        <Toast message={toastMessage} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-500 selection:text-stone-950 pb-16">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalCards={totals.totalCards}
        totalValue={totals.totalValue}
        totalPurchaseCost={totals.totalPurchaseCost}
        settings={settings}
        decksCount={decks.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshPrices={refreshPrices}
        isRefreshing={isRefreshingPrices}
        onOpenAddModal={() => setActiveTab('search')}
        onExportCollection={exportCollection}
        onImportCollection={importCollection}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Main View Container */}
      <main className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <p className="text-sm font-bold text-stone-400">Ładowanie Twojej kolekcji i wycen rynkowych...</p>
          </div>
        ) : (
          <TabContent
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            collection={collection}
            wishlist={wishlist}
            catalogs={catalogs}
            decks={decks}
            selectedDeck={selectedDeck}
            settings={settings}
            onSelectDeck={setSelectedDeck}
            onBackFromDeck={() => setSelectedDeck(null)}
            onUpdateDeck={(updated) => {
              setSelectedDeck(updated);
              updateDeck(updated);
            }}
            onDeleteDeck={handleDeleteDeckAndReset}
            onOpenCreateDeckModal={() => setIsDeckCreateModalOpen(true)}
            onCreateCatalog={createCatalog}
            onUpdateCatalog={updateCatalog}
            onDeleteCatalog={deleteCatalog}
            onSetDefaultCatalog={setDefaultCatalog}
            onUpdateQuantity={updateQuantity}
            onDeleteItem={deleteCollectionItem}
            onEditCollectionItem={(item) => handleOpenCardModal(item.card, item)}
            onViewCollectionItemDetails={(item) => handleOpenCardModal(item.card, item)}
            onQuickAddToCollection={quickAddToCollection}
            onAddToWishlist={addToWishlist}
            onRemoveFromWishlist={removeFromWishlist}
            onMoveWishlistToCollection={handleMoveWishlistToCollection}
            onSelectCard={(card) => handleOpenCardModal(card, null)}
            onViewDeckCardDetails={handleOpenDeckCardModal}
          />
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={async (newSettings) => {
            await updateSettings(newSettings);
            showToast('Zapisano nowe ustawienia wyceny i waluty!');
          }}
        />
      )}

      {/* Card Detail & Add/Edit Modal */}
      {selectedCardForModal && (
        <CardModal
          card={selectedCardForModal}
          existingItem={selectedCollectionItemForModal}
          settings={settings}
          catalogs={catalogs}
          onCreateCatalog={createCatalog}
          onClose={handleCloseCardModal}
          onSaveToCollection={handleSaveCardModal}
          onAddToWishlist={addToWishlist}
          onSelectPrint={handleCardPrintSelectedInModal}
          onToggleFoil={handleCardFoilToggledInModal}
          initialFoil={deckCardIsFoil}
        />
      )}

      {/* Deck Create Modal */}
      {isDeckCreateModalOpen && (
        <DeckCreateModal
          isOpen={isDeckCreateModalOpen}
          collection={collection}
          onClose={() => setIsDeckCreateModalOpen(false)}
          onCreateDeck={handleCreateDeckSuccess}
        />
      )}

      {/* Notification Toast */}
      <Toast message={toastMessage} />
    </div>
  );
}
