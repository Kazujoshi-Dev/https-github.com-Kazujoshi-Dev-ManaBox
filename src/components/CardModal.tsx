import React, { useState, useEffect } from 'react';
import { DEFAULT_SETTINGS, getCardImageUri, getCardPrice, getCardEdhrecRank } from '../utils/formatters';
import {
  CardModalProps,
  CardModalTab,
  CardModalHeader,
  CardNoticeBanner,
  CardImagePreview,
  CardMarketPrices,
  CardInfoSummary,
  CardCollectionForm,
  CardPrintsTab,
  useCardPrints,
  useCardModalForm,
} from './card-modal';
import { CardCombosTab } from './card-modal/CardCombosTab';

import { useBackToClose } from '../hooks/useBackButton';
export const CardModal: React.FC<CardModalProps> = ({
  card,
  existingItem,
  settings,
  catalogs = [],
  onCreateCatalog,
  onClose,
  onSaveToCollection,
  onAddToWishlist,
  onSelectPrint,
  onQuickAddToCollection,
  onToggleFoil,
  initialFoil,
  wishlistItem,
  onUpdateWishlistItem,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(true, onClose);

  if (!card) return null;

  // Active view tab in modal
  const [activeTab, setActiveTab] = useState<CardModalTab>('details');

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Form, active print version, and save state hook
  const {
    activeCard,
    faceIndex,
    quantity,
    setQuantity,
    quantityFoil,
    setQuantityFoil,
    condition,
    setCondition,
    language,
    setLanguage,
    selectedBinder,
    setSelectedBinder,
    notes,
    setNotes,
    isSaved,
    printChangeNotice,
    isCreatingCatalog,
    setIsCreatingCatalog,
    newCatName,
    setNewCatName,
    isCreatingCatalogLoading,
    handleFlipCard,
    handleToggleFoil,
    handleSelectPrint,
    handleCreateNewCatalog,
    handleSave,
  } = useCardModalForm({
    card,
    existingItem,
    catalogs,
    onCreateCatalog,
    onSaveToCollection,
    onClose,
    onSelectPrint,
    onToggleFoil,
    initialFoil,
    wishlistItem,
    onUpdateWishlistItem,
  });

  // Prints fetching and filtering hook
  const {
    prints,
    isLoadingPrints,
    printsFilter,
    setPrintsFilter,
    filteredPrints,
  } = useCardPrints({ card });

  // Settings & Market Pricing calculations
  const activeSettings = settings || DEFAULT_SETTINGS;
  const plnPriceNorm = getCardPrice(activeCard, false, { ...activeSettings, currency: 'PLN' });
  const plnPriceFoil = getCardPrice(activeCard, true, { ...activeSettings, currency: 'PLN' });

  // Handle double-faced transform cards
  const hasMultipleFaces = Boolean(activeCard.card_faces && activeCard.card_faces.length > 1);
  const currentFace = hasMultipleFaces ? activeCard.card_faces?.[faceIndex] : null;

  const imageUri = currentFace?.image_uris
    ? (currentFace.image_uris.large || currentFace.image_uris.normal || '')
    : getCardImageUri(activeCard, 'large');

  const oracleText = currentFace ? currentFace.oracle_text : activeCard.oracle_text;
  const manaCost = currentFace ? currentFace.mana_cost : activeCard.mana_cost;
  const typeLine = currentFace ? currentFace.type_line : activeCard.type_line;
  const isFoil = quantityFoil > 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-6 text-stone-100 max-h-[92vh] flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        {/* Top Header Bar */}
        <CardModalHeader
          cardName={activeCard.name}
          manaCost={manaCost}
          isPromo={activeCard.promo}
          activeTab={activeTab}
          printsCount={prints.length}
          isLoadingPrints={isLoadingPrints}
          onSelectTab={setActiveTab}
          onClose={onClose}
        />

        {/* Change / Confirmation Notice Banner */}
        <CardNoticeBanner notice={printChangeNotice} />

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Spellbook Combos Tab */}
          {activeTab === 'combos' && (
            <CardCombosTab cardName={activeCard.name} />
          )}

          {/* Prints Browser Tab */}
          {activeTab === 'prints' && (
            <CardPrintsTab
              cardName={activeCard.name}
              prints={prints}
              filteredPrints={filteredPrints}
              printsFilter={printsFilter}
              isLoading={isLoadingPrints}
              activeCardId={activeCard.id}
              settings={activeSettings}
              isExistingItem={Boolean(existingItem)}
              onFilterChange={setPrintsFilter}
              onSelectPrint={handleSelectPrint}
              onSwitchToDetails={() => setActiveTab('details')}
              defaultBinderName={catalogs.find((c) => c.isDefault)?.name || catalogs[0]?.name || 'Klaser Główny'}
              onQuickAddToCollection={onQuickAddToCollection}
            />
          )}

          {/* Standard Details & Collection Form View */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Column: Image, Market Prices & Wishlist */}
            <div className="md:col-span-5 flex flex-col items-center space-y-4">
              <CardImagePreview
                imageUri={imageUri}
                cardName={activeCard.name}
                setCode={activeCard.set}
                collectorNumber={activeCard.collector_number}
                isFoil={isFoil}
                hasMultipleFaces={hasMultipleFaces}
                onFlipCard={handleFlipCard}
                edhrecRank={getCardEdhrecRank(activeCard) ?? undefined}
              />

              <CardMarketPrices
                activeCard={activeCard}
                isFoil={isFoil}
                plnPriceNorm={plnPriceNorm}
                plnPriceFoil={plnPriceFoil}
                onToggleFoil={(toFoil, updateWithMarket) =>
                  handleToggleFoil(toFoil, updateWithMarket, plnPriceNorm, plnPriceFoil)
                }
                onAddToWishlist={onAddToWishlist}
                isOnWishlist={Boolean(wishlistItem)}
              />
            </div>

            {/* Right Column: Metadata & Collection Form */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-5">
              <CardInfoSummary
                activeCard={activeCard}
                typeLine={typeLine}
                oracleText={oracleText}
                printsCount={prints.length}
                onOpenPrintsTab={() => setActiveTab('prints')}
              />

              <CardCollectionForm
                existingItem={existingItem}
                catalogs={catalogs}
                selectedBinder={selectedBinder}
                quantity={quantity}
                quantityFoil={quantityFoil}
                condition={condition}
                language={language}
                notes={notes}
                isSaved={isSaved}
                isCreatingCatalog={isCreatingCatalog}
                newCatName={newCatName}
                isCreatingCatalogLoading={isCreatingCatalogLoading}
                onSelectBinder={setSelectedBinder}
                onQuantityChange={setQuantity}
                onQuantityFoilChange={setQuantityFoil}
                onConditionChange={setCondition}
                onLanguageChange={setLanguage}
                onNotesChange={setNotes}
                onStartCreateCatalog={() => setIsCreatingCatalog(true)}
                onCancelCreateCatalog={() => {
                  setIsCreatingCatalog(false);
                  setNewCatName('');
                }}
                onNewCatNameChange={setNewCatName}
                onSubmitCreateCatalog={handleCreateNewCatalog}
                onSubmitSave={handleSave}
              />
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CardModal;
