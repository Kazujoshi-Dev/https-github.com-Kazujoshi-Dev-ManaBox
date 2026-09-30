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
}

export interface CommanderShowcaseProps {
  commander: ScryfallCard | null | undefined;
  commanderIsFoil?: boolean;
  settings?: AppSettings;
  onViewDetails: (card: ScryfallCard) => void;
  onRemoveCommander: () => void;
  onOpenSearch: () => void;
}

export interface DeckStatsBarProps {
  manaCurve: number[];
  colorIdentity: string[];
}

export interface DeckCardRowProps {
  entry: DeckCardEntry;
  settings?: AppSettings;
  onHover: (card: ScryfallCard, e: MouseEvent) => void;
  onLeave: () => void;
  onUpdateQuantity: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewDetails: (card: ScryfallCard) => void;
}

export interface DeckCategoryColumnProps {
  category: DeckCategoryConfig;
  cards: DeckCardEntry[];
  settings?: AppSettings;
  onHoverCard: (card: ScryfallCard, e: MouseEvent) => void;
  onLeaveCard: () => void;
  onUpdateQuantity: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export interface DeckCategoriesBoardProps {
  categorizedCards: Map<string, DeckCardEntry[]>;
  settings?: AppSettings;
  onHoverCard: (card: ScryfallCard, e: MouseEvent) => void;
  onLeaveCard: () => void;
  onUpdateQuantity: (cardId: string, delta: number) => void;
  onSetCommander?: (card: ScryfallCard) => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export interface FloatingCardPreviewProps {
  card: ScryfallCard | null;
  position: { x: number; y: number } | null;
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
  onAddCard: (card: ScryfallCard, asCommander?: boolean) => void;
}
