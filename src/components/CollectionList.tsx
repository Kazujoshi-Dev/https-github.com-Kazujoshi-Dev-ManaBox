import React, { useState, Suspense, lazy } from 'react';
import { CircleDollarSign, Plus } from 'lucide-react';
import {
  CollectionListProps,
  CatalogsBar,
  CollectionFiltersBar,
  CollectionResultsHeader,
  CollectionEmptyState,
  CollectionGridView,
  CollectionTableView,
  CatalogFormModal,
  CatalogDeleteModal,
  useCollectionFilters,
  useCatalogManager,
  FOR_SALE_BINDER,
} from './collection-list';

const ForSaleAddModal = lazy(() => import('./for-sale/ForSaleAddModal'));

export const CollectionList: React.FC<CollectionListProps> = ({
  collection,
  settings,
  catalogs = [],
  decks = [],
  onCreateCatalog,
  onUpdateCatalog,
  onDeleteCatalog,
  onSetDefaultCatalog,
  onOpenCreateDeckModal,
  onSelectDeck,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onToggleForSale,
  onOpenAddModal,
  onOpenScannerModal,
  onOpenImportExport,
  onAddCardForSale,
}) => {
  const [isForSaleAddOpen, setIsForSaleAddOpen] = useState(false);
  // Na telefonie domyślnie lista (więcej kart na ekranie), na większych ekranach siatka.
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'table' : 'grid'
  );

  // Filtering & Sorting custom hook
  const {
    filters,
    updateFilters,
    sets,
    filteredCollection,
    filteredMetrics,
    hasActiveFilters,
    handleResetFilters,
  } = useCollectionFilters({ collection, settings });

  // Catalog management custom hook
  const {
    catalogStats,
    isCatalogModalOpen,
    editingCatalog,
    modalCatName,
    modalCatDesc,
    modalCatColor,
    modalCatIsDefault,
    catalogModalError,
    isCatalogSaving,
    catalogToDelete,
    setModalCatName,
    setModalCatDesc,
    setModalCatColor,
    setModalCatIsDefault,
    setCatalogToDelete,
    openCreateCatalogModal,
    openEditCatalogModal,
    closeCatalogModal,
    handleSaveCatalogModal,
    handleDeleteCatalogConfirm,
  } = useCatalogManager({
    collection,
    settings,
    catalogs,
    activeBinder: filters.binder,
    onSelectBinder: (binder) => updateFilters({ binder }),
    onCreateCatalog,
    onUpdateCatalog,
    onDeleteCatalog,
  });

  return (
    <div className="space-y-6">
      {/* 1. Catalogs Bar */}
      <CatalogsBar
        catalogs={catalogs}
        activeBinder={filters.binder}
        catalogStats={catalogStats}
        totalCollectionCount={collection.length}
        forSaleCount={collection.filter((i) => i.isForSale).length}
        currency={settings.currency}
        onSelectBinder={(binder) => updateFilters({ binder })}
        onOpenCreateCatalog={openCreateCatalogModal}
        onOpenEditCatalog={openEditCatalogModal}
        onRequestDeleteCatalog={(cat) => setCatalogToDelete(cat)}
        onSetDefaultCatalog={onSetDefaultCatalog}
        onOpenImportExport={onOpenImportExport}
      />

      {/* Kategoria „Sprzedam”: wystawianie kart prosto z wyszukiwarki */}
      {filters.binder === FOR_SALE_BINDER && onAddCardForSale && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3.5">
          <CircleDollarSign className="w-5 h-5 text-emerald-400 shrink-0 max-sm:hidden" />
          <p className="text-sm text-stone-300 flex-1">Wystaw dowolną kartę na sprzedaż, także taką, której nie masz jeszcze w kolekcji.</p>
          <button type="button" onClick={() => setIsForSaleAddOpen(true)} className="btn btn-primary shrink-0">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Dodaj kartę na sprzedaż
          </button>
        </div>
      )}
      {isForSaleAddOpen && onAddCardForSale && (
        <Suspense fallback={null}>
          <ForSaleAddModal collection={collection} settings={settings} onAdd={onAddCardForSale} onClose={() => setIsForSaleAddOpen(false)} />
        </Suspense>
      )}

      {/* 2. Search & Advanced Filters Bar */}
      <CollectionFiltersBar
        filters={filters}
        sets={sets}
        catalogs={catalogs}
        viewMode={viewMode}
        onFilterChange={updateFilters}
        onViewModeChange={setViewMode}
      />

      {/* 3. Results Header Bar */}
      <CollectionResultsHeader
        displayedCount={filteredCollection.length}
        totalCardsCount={filteredMetrics.cardsCount}
        totalValue={filteredMetrics.totalValue}
        currency={settings.currency}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
      />

      {/* 4. Collection Cards Presentation Area */}
      {filteredCollection.length === 0 ? (
        <CollectionEmptyState
          activeBinder={filters.binder}
          onOpenAddModal={onOpenAddModal}
          onOpenScannerModal={onOpenScannerModal}
          onOpenImportExport={onOpenImportExport}
        />
      ) : viewMode === 'grid' ? (
        <CollectionGridView
          items={filteredCollection}
          settings={settings}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onViewCardDetails={onViewCardDetails}
          onToggleForSale={onToggleForSale}
        />
      ) : (
        <CollectionTableView
          items={filteredCollection}
          settings={settings}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onViewCardDetails={onViewCardDetails}
          onToggleForSale={onToggleForSale}
        />
      )}

      {/* 5. Create / Edit Catalog Modal */}
      <CatalogFormModal
        isOpen={isCatalogModalOpen}
        editingCatalog={editingCatalog}
        name={modalCatName}
        description={modalCatDesc}
        color={modalCatColor}
        isDefault={modalCatIsDefault}
        error={catalogModalError}
        isSaving={isCatalogSaving}
        canDelete={Boolean(editingCatalog && onDeleteCatalog)}
        onNameChange={setModalCatName}
        onDescriptionChange={setModalCatDesc}
        onColorChange={setModalCatColor}
        onIsDefaultChange={setModalCatIsDefault}
        onClose={closeCatalogModal}
        onSubmit={handleSaveCatalogModal}
        onRequestDelete={() => {
          closeCatalogModal();
          if (editingCatalog) setCatalogToDelete(editingCatalog);
        }}
      />

      {/* 6. Delete Catalog Confirmation Modal */}
      {catalogToDelete && (() => {
        const otherCatalogs = catalogs.filter(c => c.id !== catalogToDelete.id);
        const nextDefaultName = otherCatalogs.find(c => c.isDefault)?.name || otherCatalogs[0]?.name || 'Klaser Główny';
        const cardCount = catalogStats.get(catalogToDelete.name)?.count || 0;

        return (
          <CatalogDeleteModal
            catalogToDelete={catalogToDelete}
            cardCount={cardCount}
            nextDefaultCatalogName={nextDefaultName}
            onClose={() => setCatalogToDelete(null)}
            onConfirmDelete={handleDeleteCatalogConfirm}
          />
        );
      })()}
    </div>
  );
};

export default CollectionList;
