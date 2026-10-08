import React, { useState, Suspense } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { CircleDollarSign, Plus } from 'lucide-react';
import {
  CollectionListProps,
  CatalogsBar,
  CollectionFiltersBar,
  CollectionResultsHeader,
  CollectionEmptyState,
  CollectionGridView,
  CollectionTableView,
  CollectionSetsView,
  CollectionSetHeader,
  CollectionViewMode,
  CatalogFormModal,
  CatalogDeleteModal,
  useCollectionFilters,
  useCatalogManager,
  useProgressiveRender,
  CollectionLoadingOverlay,
  FOR_SALE_BINDER,
} from './collection-list';

const ForSaleAddModal = lazyWithReload(() => import('./for-sale/ForSaleAddModal'));

export const CollectionList: React.FC<CollectionListProps> = ({
  collection,
  settings,
  catalogs = [],
  decks = [],
  onCreateCatalog,
  onUpdateCatalog,
  onDeleteCatalog,
  onEmptyCatalog,
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
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'table' : 'grid'
  );

  // Filtering & Sorting custom hook
  const {
    filters,
    updateFilters,
    sets,
    viewSets,
    filteredCollection,
    filteredMetrics,
    hasActiveFilters,
    handleResetFilters,
  } = useCollectionFilters({ collection, settings });

  // Widok „Dodatki”: bez wybranego dodatku pokazujemy siatkę dodatków, po wyborze listę jego kart
  const showSetsGrid = viewMode === 'sets' && filters.set === 'ALL';
  const selectedSet = viewMode === 'sets' && filters.set !== 'ALL'
    ? viewSets.find((s) => s.code.toLowerCase() === filters.set.toLowerCase()) || sets.find((s) => s.code.toLowerCase() === filters.set.toLowerCase())
    : undefined;
  const handleSelectSet = (code: string) => {
    updateFilters({ set: code });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Duże kolekcje dorysowujemy partiami przy wejściu do zakładki i przy zmianie katalogu (z paskiem postępu)
  const progressive = useProgressiveRender(filteredCollection.length, filters.binder);
  const renderedCollection = progressive.isLoading
    ? filteredCollection.slice(0, progressive.limit)
    : filteredCollection;

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
    catalogToEmpty,
    setCatalogToEmpty,
    handleEmptyCatalogConfirm,
  } = useCatalogManager({
    collection,
    settings,
    catalogs,
    activeBinder: filters.binder,
    onSelectBinder: (binder) => updateFilters({ binder }),
    onCreateCatalog,
    onUpdateCatalog,
    onDeleteCatalog,
    onEmptyCatalog,
  });

  return (
    <div className="space-y-6">
      <CollectionLoadingOverlay
        isLoading={progressive.isLoading}
        loaded={progressive.loaded}
        total={progressive.total}
        title={filters.binder === 'ALL' ? undefined : 'Trwa wczytywanie katalogu'}
      />

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
        onRequestEmptyCatalog={onEmptyCatalog ? (cat) => setCatalogToEmpty(cat) : undefined}
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
        onViewModeChange={(mode) => {
          // Wejście w widok „Dodatki” zawsze zaczyna od siatki wszystkich dodatków
          if (mode === 'sets' && viewMode !== 'sets') updateFilters({ set: 'ALL' });
          setViewMode(mode);
        }}
      />

      {/* 3. Results Header Bar */}
      {showSetsGrid ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 text-xs gap-2 text-stone-400">
          <span>
            Dodatki w kolekcji: <strong className="text-stone-100 tabular-nums">{viewSets.length}</strong>
            <span className="max-sm:hidden"> · kliknij dodatek, aby zobaczyć jego karty</span>
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-amber-400 hover:text-amber-300 underline text-xs cursor-pointer self-start sm:self-auto"
            >
              Wyczyść wszystkie filtry
            </button>
          )}
        </div>
      ) : (
        <>
          {viewMode === 'sets' && (
            <CollectionSetHeader set={selectedSet} code={filters.set} onBack={() => updateFilters({ set: 'ALL' })} />
          )}
          <CollectionResultsHeader
            displayedCount={filteredCollection.length}
            totalCardsCount={filteredMetrics.cardsCount}
            totalValue={filteredMetrics.totalValue}
            currency={settings.currency}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />
        </>
      )}

      {/* 4. Collection Cards Presentation Area */}
      {showSetsGrid ? (
        viewSets.length === 0 ? (
          <CollectionEmptyState
            activeBinder={filters.binder}
            onOpenAddModal={onOpenAddModal}
            onOpenScannerModal={onOpenScannerModal}
            onOpenImportExport={onOpenImportExport}
          />
        ) : (
          <CollectionSetsView sets={viewSets} onSelectSet={handleSelectSet} />
        )
      ) : filteredCollection.length === 0 ? (
        <CollectionEmptyState
          activeBinder={filters.binder}
          onOpenAddModal={onOpenAddModal}
          onOpenScannerModal={onOpenScannerModal}
          onOpenImportExport={onOpenImportExport}
        />
      ) : viewMode === 'grid' ? (
        <CollectionGridView
          items={renderedCollection}
          settings={settings}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onViewCardDetails={onViewCardDetails}
          onToggleForSale={onToggleForSale}
        />
      ) : (
        <CollectionTableView
          items={renderedCollection}
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
        canDelete={Boolean(editingCatalog && !editingCatalog.isMain && onDeleteCatalog)}
        nameLocked={Boolean(editingCatalog?.isMain)}
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

      {/* 6. Usunięcie lub opróżnienie katalogu */}
      {(catalogToDelete || catalogToEmpty) && (() => {
        const mode = catalogToEmpty ? 'empty' : 'delete';
        const target = (catalogToEmpty || catalogToDelete)!;
        const mainName = catalogs.find(c => c.isMain)?.name || 'Klaser Główny';
        const inCatalog = collection.filter(i => (i.binder || 'Klaser Główny') === target.name);
        const kept = inCatalog.filter(i => !i.isForSale);
        const cardQuantity = kept.reduce((s, i) => s + (i.quantity || 0) + (i.quantityFoil || 0), 0);

        return (
          <CatalogDeleteModal
            mode={mode}
            catalogToDelete={target}
            cardCount={kept.length}
            cardQuantity={cardQuantity}
            forSaleCount={inCatalog.length - kept.length}
            mainCatalogName={mainName}
            onClose={() => (catalogToEmpty ? setCatalogToEmpty(null) : setCatalogToDelete(null))}
            onConfirmDelete={catalogToEmpty ? handleEmptyCatalogConfirm : handleDeleteCatalogConfirm}
          />
        );
      })()}
    </div>
  );
};

export default CollectionList;
