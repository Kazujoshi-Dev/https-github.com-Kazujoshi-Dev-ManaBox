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

  // Modal Handlers
  const handleOpenCardModal = useCallback((card: ScryfallCard, item: CollectionItem | null = null) => {
    setSelectedCardForModal(card);
    setSelectedCollectionItemForModal(item);
  }, []);

  const handleCloseCardModal = useCallback(() => {
    setSelectedCardForModal(null);
    setSelectedCollectionItemForModal(null);
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
  }, [saveToCollection, selectedCollectionItemForModal]);

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
