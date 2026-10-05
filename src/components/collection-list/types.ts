import type { FormEvent, MouseEvent } from 'react';
import { CollectionItem, FilterOptions, AppSettings, Catalog, DeckItem } from '../../types';

export interface CollectionListProps {
  collection: CollectionItem[];
  settings: AppSettings;
  catalogs?: Catalog[];
  decks?: DeckItem[];
  onCreateCatalog?: (name: string, description?: string, color?: string, isDefault?: boolean) => Promise<Catalog | null>;
  onUpdateCatalog?: (id: string, updates: Partial<Catalog>) => Promise<void>;
  onDeleteCatalog?: (id: string) => Promise<void>;
  onSetDefaultCatalog?: (id: string) => Promise<void>;
  onOpenCreateDeckModal?: () => void;
  onSelectDeck?: (deck: DeckItem) => void;
  onUpdateQuantity: (id: string, deltaNormal: number, deltaFoil: number) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: CollectionItem) => void;
  onViewCardDetails: (item: CollectionItem) => void;
  onToggleForSale?: (item: CollectionItem) => void;
  onOpenAddModal: () => void;
  onOpenScannerModal?: () => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
  /** Wystawienie karty na sprzedaż prosto z wyszukiwarki wszystkich kart. */
  onAddCardForSale?: (data: import('../for-sale/ForSaleAddModal').ForSaleAddData) => Promise<boolean>;
}

export interface CatalogStatItem {
  count: number;
  totalCards: number;
  totalValue: number;
}

export interface CatalogsBarProps {
  catalogs: Catalog[];
  activeBinder: string;
  catalogStats: Map<string, CatalogStatItem>;
  totalCollectionCount: number;
  /** Liczba pozycji oznaczonych na sprzedaż (kategoria „Sprzedam”). */
  forSaleCount?: number;
  currency: AppSettings['currency'];
  onSelectBinder: (binder: string) => void;
  onOpenCreateCatalog: () => void;
  onOpenEditCatalog: (cat: Catalog, e?: MouseEvent) => void;
  onRequestDeleteCatalog: (cat: Catalog) => void;
  onSetDefaultCatalog?: (id: string) => Promise<void>;
  decks?: DeckItem[];
  onOpenCreateDeck?: () => void;
  onSelectDeck?: (deck: DeckItem) => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
}

export interface CollectionFiltersBarProps {
  filters: FilterOptions;
  /** [kod, nazwa, udział w wartości kolekcji w %] */
  sets: [string, string, number][];
  catalogs: Catalog[];
  viewMode: 'grid' | 'table';
  onFilterChange: (newFilters: Partial<FilterOptions>) => void;
  onViewModeChange: (mode: 'grid' | 'table') => void;
}

export interface CollectionResultsHeaderProps {
  displayedCount: number;
  totalCardsCount: number;
  totalValue: number;
  currency: AppSettings['currency'];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export interface CollectionEmptyStateProps {
  activeBinder: string;
  onOpenAddModal: () => void;
  onOpenScannerModal?: () => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
}

export interface CollectionItemHandlers {
  onUpdateQuantity: (id: string, deltaNormal: number, deltaFoil: number) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: CollectionItem) => void;
  onViewCardDetails: (item: CollectionItem) => void;
  onToggleForSale?: (item: CollectionItem) => void;
}

export interface CollectionGridViewProps extends CollectionItemHandlers {
  items: CollectionItem[];
  settings: AppSettings;
}

export interface CollectionTableViewProps extends CollectionItemHandlers {
  items: CollectionItem[];
  settings: AppSettings;
}

export interface CatalogFormModalProps {
  isOpen: boolean;
  editingCatalog: Catalog | null;
  name: string;
  description: string;
  color: string;
  isDefault: boolean;
  error: string | null;
  isSaving: boolean;
  canDelete: boolean;
  onNameChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onColorChange: (val: string) => void;
  onIsDefaultChange: (val: boolean) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  onRequestDelete: () => void;
}

export interface CatalogDeleteModalProps {
  catalogToDelete: Catalog;
  cardCount: number;
  nextDefaultCatalogName: string;
  onClose: () => void;
  onConfirmDelete: () => void;
}
