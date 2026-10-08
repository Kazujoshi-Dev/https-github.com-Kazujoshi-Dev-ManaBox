import type { FormEvent } from 'react';
import { ScryfallCard, CollectionItem, AppSettings, Catalog, CardCondition, CardLanguage, WishlistItem } from '../../types';

export interface CardSaveData {
  card: ScryfallCard;
  quantity: number;
  quantityFoil: number;
  condition: CardCondition;
  language: CardLanguage;
  purchasePrice?: number | null;
  notes?: string;
  binder?: string;
}

export interface CardModalProps {
  card: ScryfallCard | null;
  existingItem?: CollectionItem | null;
  settings?: AppSettings;
  catalogs?: Catalog[];
  onCreateCatalog?: (name: string, description?: string, color?: string) => Promise<Catalog | null>;
  onClose: () => void;
  onSaveToCollection: (itemData: CardSaveData) => void;
  onAddToWishlist?: (card: ScryfallCard, isFoil?: boolean) => void;
  onSelectPrint?: (newCard: ScryfallCard, oldCard: ScryfallCard) => void;
  /** Dodaje 1 szt. wskazanego wydania (NM, nie foil) do domyślnego klasera. */
  onQuickAddToCollection?: (card: ScryfallCard) => Promise<unknown> | void;
  onToggleFoil?: (isFoil: boolean) => void;
  initialFoil?: boolean;
  /** Okno otwarte z listy życzeń — zmiana foil / wersji zapisuje się w tej pozycji. */
  wishlistItem?: WishlistItem | null;
  onUpdateWishlistItem?: (patch: { card?: ScryfallCard; isFoil?: boolean }) => Promise<unknown> | void;
}

export type CardModalTab = 'details' | 'prints' | 'combos';

export interface CardModalHeaderProps {
  cardName: string;
  manaCost?: string;
  isPromo?: boolean;
  activeTab: CardModalTab;
  printsCount: number;
  isLoadingPrints: boolean;
  onSelectTab: (tab: CardModalTab) => void;
  onClose: () => void;
}

export interface CardNoticeBannerProps {
  notice: string | null;
}

export interface CardImagePreviewProps {
  imageUri: string;
  cardName: string;
  setCode: string;
  collectorNumber: string;
  isFoil: boolean;
  hasMultipleFaces: boolean;
  onFlipCard?: () => void;
  edhrecRank?: number;
}

export interface CardMarketPricesProps {
  activeCard: ScryfallCard;
  isFoil: boolean;
  plnPriceNorm: number;
  plnPriceFoil: number;
  onToggleFoil: (toFoil: boolean, updatePriceWithMarket?: boolean) => void;
  onAddToWishlist?: (card: ScryfallCard, isFoil?: boolean) => void;
  /** Karta jest już na liście życzeń (okno otwarte z listy). */
  isOnWishlist?: boolean;
}

export interface CardInfoSummaryProps {
  activeCard: ScryfallCard;
  typeLine?: string;
  oracleText?: string;
  printsCount: number;
  onOpenPrintsTab: () => void;
}

export interface CardCollectionFormProps {
  existingItem?: CollectionItem | null;
  catalogs: Catalog[];
  selectedBinder: string;
  quantity: number;
  quantityFoil: number;
  condition: CardCondition;
  language: CardLanguage;
  notes: string;
  isSaved: boolean;
  isCreatingCatalog: boolean;
  newCatName: string;
  isCreatingCatalogLoading: boolean;
  onSelectBinder: (binder: string) => void;
  onQuantityChange: (qty: number) => void;
  onQuantityFoilChange: (qty: number) => void;
  onConditionChange: (condition: CardCondition) => void;
  onLanguageChange: (language: CardLanguage) => void;
  onNotesChange: (notes: string) => void;
  onStartCreateCatalog: () => void;
  onCancelCreateCatalog: () => void;
  onNewCatNameChange: (name: string) => void;
  onSubmitCreateCatalog: (e: FormEvent) => void;
  onSubmitSave: (e: FormEvent) => void;
}

export interface CardPrintsTabProps {
  cardName: string;
  prints: ScryfallCard[];
  filteredPrints: ScryfallCard[];
  printsFilter: string;
  isLoading: boolean;
  activeCardId: string;
  settings: AppSettings;
  isExistingItem: boolean;
  onFilterChange: (filter: string) => void;
  onSelectPrint: (print: ScryfallCard) => void;
  onSwitchToDetails: () => void;
  /** Nazwa domyślnego klasera, do którego trafia karta z przycisku „Dodaj do kolekcji”. */
  defaultBinderName?: string;
  onQuickAddToCollection?: (print: ScryfallCard) => Promise<unknown> | void;
}
