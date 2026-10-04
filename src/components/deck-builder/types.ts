import type { MouseEvent } from 'react';
import { DeckItem, DeckCardEntry, ScryfallCard, AppSettings, CollectionItem } from '../../types';
import { DeckCategoryConfig } from './constants';

export interface DeckBuilderProps {
  deck: DeckItem;
  collection: CollectionItem[];
  settings: AppSettings;
  onUpdateDeck: (updated: DeckItem) => void;
  onBack: () => void;
  onViewCardDetails: (card: ScryfallCard) => void;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  showToast?: (message: string) => void;
}

export interface DeckHeaderProps {
  name: string;
  format?: string;
  description?: string;
  cardSource: 'collection' | 'all';
  totalCardsCount: number;
  totalDeckValue: number;
  currency: AppSettings['currency'];
  onBack: () => void;
  onToggleCardSource: () => void;
  onOpenAddModal: () => void;
  onOpenImportExport?: () => void;
  onOpenCombos?: () => void;
  /** Publiczny link do talii. */
  onOpenShare?: () => void;
  isPublic?: boolean;
}

export interface CommanderShowcaseProps {
  commander: ScryfallCard | null | undefined;
  commanderIsFoil?: boolean;
  settings?: AppSettings;
  onViewDetails: (card: ScryfallCard) => void;
  onRemoveCommander: () => void;
  onOpenSearch: () => void;
}

export interface BasicLandCount {
  /** Kolor many (W/U/B/R/G) albo C dla Wastes. */
  color: string;
  name: string;
  count: number;
}

export interface DeckStatsBarProps {
  manaCurve: number[];
  colorIdentity: string[];
  /** Basic Lands w kolorach dowódcy; bez tej właściwości narzędzie jest ukryte (np. podgląd publiczny). */
  basics?: BasicLandCount[];
  onSetBasicCount?: (name: string, count: number) => void | Promise<void>;
  basicsBusy?: string | null;
}

export interface DeckCardRowProps {
  entry: DeckCardEntry;
  settings?: AppSettings;
  previewScale?: number;
  onHover: (card: ScryfallCard, e: MouseEvent) => void;
  onLeave: () => void;
  /** Brak = widok tylko do odczytu (np. publiczny link do talii). */
  onUpdateQuantity?: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewDetails: (card: ScryfallCard) => void;
  /** Powody, dla których karta łamie zasady formatu (puste = karta w porządku). */
  issues?: string[];
}

export interface DeckCategoryColumnProps {
  /** Problemy z legalnością po id karty. */
  issuesById?: Map<string, string[]>;
  category: DeckCategoryConfig;
  cards: DeckCardEntry[];
  settings?: AppSettings;
  previewScale?: number;
  onHoverCard: (card: ScryfallCard, e: MouseEvent) => void;
  onLeaveCard: () => void;
  /** Brak = widok tylko do odczytu (np. publiczny link do talii). */
  onUpdateQuantity?: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export interface DeckCategoriesBoardProps {
  /** Kolejność kart w kategoriach (domyślnie alfabetycznie). */
  sortMode?: import('./cardSort').DeckCardSort;
  /** Problemy z legalnością po id karty. */
  issuesById?: Map<string, string[]>;
  categorizedCards: Map<string, DeckCardEntry[]>;
  settings?: AppSettings;
  previewScale?: number;
  onHoverCard: (card: ScryfallCard, e: MouseEvent) => void;
  onLeaveCard: () => void;
  /** Brak = widok tylko do odczytu (np. publiczny link do talii). */
  onUpdateQuantity?: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export interface FloatingCardPreviewProps {
  card: ScryfallCard | null;
  position: { x: number; y: number } | null;
  scale?: number;
}

export interface DeckAddCardModalProps {
  isOpen: boolean;
  deckName: string;
  collection: CollectionItem[];
  deckCards: DeckCardEntry[];
  searchSource: 'collection' | 'all';
  searchQuery: string;
  searchResults: ScryfallCard[];
  isSearchingScryfall: boolean;
  onClose: () => void;
  onSearchChange: (query: string) => void;
  onSourceChange: (source: 'collection' | 'all') => void;
  onAddCard: (card: ScryfallCard, asCommander?: boolean, isFoil?: boolean) => void;
  settings?: AppSettings;
}
