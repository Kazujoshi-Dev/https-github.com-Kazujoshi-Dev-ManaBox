import type { FormEvent, MouseEvent } from 'react';
import { CollectionItem, FilterOptions, AppSettings, Catalog, DeckItem } from '../../types';

/** Sposób wyświetlania kolekcji: kafelki, lista albo dodatki. */
export type CollectionViewMode = 'grid' | 'table' | 'sets';

export interface CollectionListProps {
  collection: CollectionItem[];
  settings: AppSettings;
  catalogs?: Catalog[];
  decks?: DeckItem[];
  onCreateCatalog?: (name: string, description?: string, color?: string, isDefault?: boolean) => Promise<Catalog | null>;
  onUpdateCatalog?: (id: string, updates: Partial<Catalog>) => Promise<void>;
  onDeleteCatalog?: (id: string) => Promise<void>;
  /** Usuwa karty katalogu z kolekcji (katalog zostaje). */
  onEmptyCatalog?: (id: string) => Promise<void>;
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
  /** Zapis ustawień konta (np. liczby wierszy na stronie). */
  onUpdateSettings?: (settings: AppSettings) => Promise<void> | void;
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
  onRequestEmptyCatalog?: (cat: Catalog) => void;
  onSetDefaultCatalog?: (id: string) => Promise<void>;
  decks?: DeckItem[];
  onOpenCreateDeck?: () => void;
  onSelectDeck?: (deck: DeckItem) => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
}

export interface CollectionFiltersBarProps {
  filters: FilterOptions;
  sets: import('./useCollectionFilters').SetOption[];
  catalogs: Catalog[];
  viewMode: CollectionViewMode;
  onFilterChange: (newFilters: Partial<FilterOptions>) => void;
  onViewModeChange: (mode: CollectionViewMode) => void;
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
  /** Nazwa zablokowana (główny klaser). */
  nameLocked?: boolean;
  onNameChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onColorChange: (val: string) => void;
  onIsDefaultChange: (val: boolean) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  onRequestDelete: () => void;
}

export interface CatalogDeleteModalProps {
  /** `delete`: usunięcie katalogu (karty trafiają do głównego klasera); `empty`: usunięcie jego kart. */
  mode: 'delete' | 'empty';
  catalogToDelete: Catalog;
  /** Pozycje w katalogu (bez kart na sprzedaż). */
  cardCount: number;
  /** Liczba sztuk w tych pozycjach. */
  cardQuantity: number;
  /** Pozycje w katalogu wystawione na sprzedaż. */
  forSaleCount: number;
  /** Główny klaser, do którego trafią karty usuwanego katalogu. */
  mainCatalogName: string;
  onClose: () => void;
  onConfirmDelete: () => void;
}
