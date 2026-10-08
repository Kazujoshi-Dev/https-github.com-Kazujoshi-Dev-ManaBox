import React, { useState, useRef, Suspense } from 'react';
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
  CollectionPagination,
  useGridColumns,
  FOR_SALE_BINDER,
  ROWS_PER_PAGE_OPTIONS,
  DEFAULT_ROWS_PER_PAGE,
} from './collection-list';
import { useT, MAIN_BINDER, locale } from '../i18n';

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
  onUpdateSettings,
}) => {
  const t = useT();
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

  // Stronicowanie: liczba wierszy z ustawień konta, w siatce wiersz to tyle kart, ile kolumn
  const savedRows = settings.collectionRowsPerPage;
  const rowsPerPage = (ROWS_PER_PAGE_OPTIONS as readonly number[]).includes(savedRows ?? -1)
    ? savedRows!
    : DEFAULT_ROWS_PER_PAGE;
  const gridColumns = useGridColumns();
  const pageSize = rowsPerPage * (viewMode === 'grid' ? gridColumns : 1);
  const pageCount = Math.max(1, Math.ceil(filteredCollection.length / pageSize));

  // Zmiana filtrów, katalogu, widoku lub liczby wierszy wraca na pierwszą stronę
  const pageResetKey = `${JSON.stringify(filters)}|${viewMode}|${rowsPerPage}`;
  const [page, setPage] = useState(1);
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }
  const currentPage = pageResetKey !== prevPageResetKey ? 1 : Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedCollection = filteredCollection.slice(pageStart, pageStart + pageSize);
  const rangeLabel = filteredCollection.length
    ? `${(pageStart + 1).toLocaleString(locale())}–${(pageStart + pagedCollection.length).toLocaleString(locale())} z ${filteredCollection.length.toLocaleString(locale())}`
    : undefined;

  const listTopRef = useRef<HTMLDivElement>(null);
  const goToPage = (next: number) => {
    setPage(Math.max(1, Math.min(pageCount, next)));
    // Po zmianie strony (zwłaszcza z dolnego paska) wracamy na początek listy
    const el = listTopRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' });
    }
  };
  const handleRowsPerPageChange = (rows: number) => {
    if (rows === rowsPerPage || !onUpdateSettings) return;
    onUpdateSettings({ ...settings, collectionRowsPerPage: rows });
  };

  // Duże strony dorysowujemy partiami przy wejściu do zakładki i przy zmianie katalogu (z paskiem postępu)
  const progressive = useProgressiveRender(pagedCollection.length, filters.binder);
  const renderedCollection = progressive.isLoading
    ? pagedCollection.slice(0, progressive.limit)
    : pagedCollection;

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
        title={filters.binder === 'ALL' ? undefined : t('Trwa wczytywanie katalogu')}
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
          <p className="text-sm text-stone-300 flex-1">{t('Wystaw dowolną kartę na sprzedaż, także taką, której nie masz jeszcze w kolekcji.')}</p>
          <button type="button" onClick={() => setIsForSaleAddOpen(true)} className="btn btn-primary shrink-0">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {t('Dodaj kartę na sprzedaż')}
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
        rowsPerPage={onUpdateSettings ? rowsPerPage : undefined}
        onRowsPerPageChange={onUpdateSettings ? handleRowsPerPageChange : undefined}
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
            {t('Dodatki w kolekcji:')} <strong className="text-stone-100 tabular-nums">{viewSets.length}</strong>
            <span className="max-sm:hidden"> {t('· kliknij dodatek, aby zobaczyć jego karty')}</span>
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-amber-400 hover:text-amber-300 underline text-xs cursor-pointer self-start sm:self-auto"
            >
              {t('Wyczyść wszystkie filtry')}
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
          {filteredCollection.length > 0 && (
            <div ref={listTopRef}>
              <CollectionPagination
                page={currentPage}
                pageCount={pageCount}
                onPageChange={goToPage}
                rangeLabel={rangeLabel}
              />
            </div>
          )}
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

      {/* Dolny pasek stron */}
      {!showSetsGrid && pageCount > 1 && (
        <CollectionPagination page={currentPage} pageCount={pageCount} onPageChange={goToPage} rangeLabel={rangeLabel} />
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
        const mainName = catalogs.find(c => c.isMain)?.name || MAIN_BINDER;
        const inCatalog = collection.filter(i => (i.binder || MAIN_BINDER) === target.name);
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
