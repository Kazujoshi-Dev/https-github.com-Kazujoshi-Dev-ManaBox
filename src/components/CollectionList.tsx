import React, { useState } from 'react';
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
} from './collection-list';

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
  onOpenAddModal,
  onOpenScannerModal,
  onOpenImportExport,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

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
        currency={settings.currency}
        onSelectBinder={(binder) => updateFilters({ binder })}
        onOpenCreateCatalog={openCreateCatalogModal}
        onOpenEditCatalog={openEditCatalogModal}
        onRequestDeleteCatalog={(cat) => setCatalogToDelete(cat)}
        onSetDefaultCatalog={onSetDefaultCatalog}
        onOpenImportExport={onOpenImportExport}
      />

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
        />
      ) : (
        <CollectionTableView
          items={filteredCollection}
          settings={settings}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onViewCardDetails={onViewCardDetails}
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
