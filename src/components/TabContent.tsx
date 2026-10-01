import React from 'react';
import {
  CollectionItem,
  WishlistItem,
  Catalog,
  DeckItem,
  ScryfallCard,
  AppSettings,
  AuthUser
} from '../types';
import { CollectionList } from './CollectionList';
import { DeckBuilder } from './DeckBuilder';
import { DeckList } from './DeckList';
import { CardSearch } from './CardSearch';
import { SetTopCards } from './SetTopCards';
import { Analytics } from './Analytics';
import { Wishlist } from './Wishlist';
import { ForSaleList } from './ForSaleList';
import { UsersList } from './UsersList';

export type NavigationTab = 'collection' | 'decks' | 'search' | 'set-top' | 'analytics' | 'wishlist' | 'for-sale' | 'users';

interface TabContentProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  collection: CollectionItem[];
  wishlist: WishlistItem[];
  catalogs: Catalog[];
  decks: DeckItem[];
  selectedDeck: DeckItem | null;
  settings: AppSettings;
  currentUser?: AuthUser | null;

  // Deck interactions
  onSelectDeck: (deck: DeckItem) => void;
  onBackFromDeck: () => void;
  onUpdateDeck: (deck: DeckItem) => void;
  onDeleteDeck: (id: string) => void;
  onOpenCreateDeckModal: () => void;

  // Catalog interactions
  onCreateCatalog: (name: string, description?: string, color?: string, isDefault?: boolean) => Promise<Catalog | null>;
  onUpdateCatalog: (id: string, updates: Partial<Catalog>) => Promise<void>;
  onDeleteCatalog: (id: string) => Promise<void>;
  onSetDefaultCatalog: (id: string) => Promise<void>;

  // Collection interactions
  onUpdateQuantity: (id: string, deltaNormal: number, deltaFoil: number) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onEditCollectionItem: (item: CollectionItem) => void;
  onViewCollectionItemDetails: (item: CollectionItem) => void;
  onQuickAddToCollection: (card: ScryfallCard) => void;

  // Wishlist interactions
  onAddToWishlist: (card: ScryfallCard) => Promise<void>;
  onRemoveFromWishlist: (id: string) => Promise<void>;
  onMoveWishlistToCollection: (item: WishlistItem) => void;

  // Card search interactions
  onSelectCard: (card: ScryfallCard) => void;
  onViewDeckCardDetails?: (card: ScryfallCard) => void;
  onOpenScannerModal?: () => void;
  onOpenImportDeck?: () => void;
  onOpenCollectionImportExport?: (tab: 'export' | 'import') => void;
  onUpdateSettings?: (newSettings: AppSettings) => Promise<void> | void;
  onEditDeck?: (deck: DeckItem) => void;
  onToggleForSale?: (item: CollectionItem, customPrice?: number | null) => Promise<void> | void;
  onUpdateCollectionItem?: (id: string, updates: Partial<CollectionItem>) => Promise<CollectionItem | null> | void;
  showToast?: (message: string) => void;
}

export const TabContent: React.FC<TabContentProps> = ({
  activeTab,
  setActiveTab,
  collection,
  wishlist,
  catalogs,
  decks,
  selectedDeck,
  settings,
  currentUser,
  onSelectDeck,
  onBackFromDeck,
  onUpdateDeck,
  onDeleteDeck,
  onOpenCreateDeckModal,
  onCreateCatalog,
  onUpdateCatalog,
  onDeleteCatalog,
  onSetDefaultCatalog,
  onUpdateQuantity,
  onDeleteItem,
  onEditCollectionItem,
  onViewCollectionItemDetails,
  onQuickAddToCollection,
  onAddToWishlist,
  onRemoveFromWishlist,
  onMoveWishlistToCollection,
  onSelectCard,
  onViewDeckCardDetails,
  onOpenScannerModal,
  onOpenImportDeck,
  onOpenCollectionImportExport,
  onUpdateSettings,
  onEditDeck,
  onToggleForSale,
  onUpdateCollectionItem,
  showToast,
}) => {
  switch (activeTab) {
    case 'collection':
      return (
        <CollectionList
          collection={collection}
          settings={settings}
          catalogs={catalogs}
          decks={decks}
          onCreateCatalog={onCreateCatalog}
          onUpdateCatalog={onUpdateCatalog}
          onDeleteCatalog={onDeleteCatalog}
          onSetDefaultCatalog={onSetDefaultCatalog}
          onOpenCreateDeckModal={onOpenCreateDeckModal}
          onSelectDeck={(deck) => {
            onSelectDeck(deck);
            setActiveTab('decks');
          }}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditCollectionItem}
          onViewCardDetails={onViewCollectionItemDetails}
          onToggleForSale={onToggleForSale}
          onOpenAddModal={() => setActiveTab('search')}
          onOpenScannerModal={onOpenScannerModal}
          onOpenImportExport={onOpenCollectionImportExport}
        />
      );

    case 'decks':
      if (selectedDeck) {
        return (
          <DeckBuilder
            deck={selectedDeck}
            collection={collection}
            settings={settings}
            onUpdateDeck={onUpdateDeck}
            onBack={onBackFromDeck}
            onViewCardDetails={onViewDeckCardDetails || onSelectCard}
            onUpdateSettings={onUpdateSettings}
            showToast={showToast}
          />
        );
      }
      return (
        <DeckList
          decks={decks}
          settings={settings}
          onSelectDeck={onSelectDeck}
          onCreateDeckClick={onOpenCreateDeckModal}
          onDeleteDeck={onDeleteDeck}
          onEditDeck={onEditDeck}
          onOpenImportDeck={onOpenImportDeck}
          showToast={showToast}
        />
      );

    case 'search':
      return (
        <CardSearch
          settings={settings}
          onSelectCard={onSelectCard}
        />
      );

    case 'set-top':
      return (
        <SetTopCards
          settings={settings}
          onSelectCard={onSelectCard}
          onAddToCollection={onQuickAddToCollection}
          onAddToWishlist={onAddToWishlist}
        />
      );

    case 'analytics':
      return (
        <Analytics
          collection={collection}
          settings={settings}
          onViewCardDetails={onViewCollectionItemDetails}
        />
      );

    case 'wishlist':
      return (
        <Wishlist
          wishlist={wishlist}
          settings={settings}
          onRemoveFromWishlist={onRemoveFromWishlist}
          onMoveToCollection={onMoveWishlistToCollection}
          onOpenSearchTab={() => setActiveTab('search')}
          onViewCardDetails={onSelectCard}
        />
      );

    case 'for-sale':
      return (
        <ForSaleList
          collection={collection}
          settings={settings}
          currentUser={currentUser || null}
          onToggleForSale={onToggleForSale || (() => {})}
          onUpdateCollectionItem={onUpdateCollectionItem || (() => {})}
          onViewCardDetails={onViewCollectionItemDetails}
          onGoToCollection={() => setActiveTab('collection')}
          showToast={showToast}
        />
      );

    case 'users':
      return (
        <UsersList
          settings={settings}
          currentUser={currentUser}
          onViewCardDetails={onViewDeckCardDetails || onSelectCard}
          showToast={showToast}
        />
      );

    default:
      return null;
  }
};
