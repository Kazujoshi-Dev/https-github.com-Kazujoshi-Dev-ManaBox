import { langFromCard } from './utils/formatters';
import { useChangelogBadge } from './hooks/useChangelogBadge';
import { parsePublicLink } from './utils/publicLinks';
import React, { useState, useCallback, useEffect } from 'react';
import { lazyWithReload } from './utils/lazyWithReload';
import { ScryfallCard, CollectionItem, DeckItem, CardCondition, CardLanguage, AppSettings, RegisteredUserSummary, WishlistItem, AuthUser } from './types';
import { Header } from './components/Header';
import { AuthView } from './components/AuthView';
import { TabContent, NavigationTab } from './components/TabContent';
import { SettingsPage } from './components/SettingsPage';
import { CardModal } from './components/CardModal';
import { DeckCreateModal } from './components/DeckCreateModal';
import { ImportExportModal } from './components/ImportExportModal';
import { DeckImportExportModal } from './components/DeckImportExportModal';
import { CameraScannerModal } from './components/camera-scanner/CameraScannerModal';
import { PublicSaleView } from './components/PublicSaleView';
import { PublicWishlistView } from './components/PublicWishlistView';
import { PublicDeckView } from './components/PublicDeckView';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { EmailLinkView } from './components/EmailLinkView';
import { parseEmailLink, type EmailLink } from './utils/emailLinks';
import { MailboxModal } from './components/messages/MailboxModal';
import { SellQuantityModal } from './components/SellQuantityModal';
import { Toast } from './components/Toast';
import { MobileNav } from './components/MobileNav';
import { CollectionHistoryModal } from './components/CollectionHistoryModal';
const BugReportModal = lazyWithReload(() => import('./components/BugReportModal'));

const TAB_LABELS: Record<string, string> = {
  collection: 'Kolekcja', decks: 'Talie', search: 'Szukaj kart', 'set-top': 'Top z dodatku', analytics: 'Statystyki',
  wishlist: 'Lista życzeń', 'for-sale': 'Sprzedam', users: 'Gracze', changelog: 'Dziennik zmian', admin: 'Admin', settings: 'Ustawienia'
};
// Zakładka zapamiętana przed przeładowaniem do nowej wersji aplikacji (odczyt raz, przy starcie)
const RESUME_TAB = takeResumeTab();
const INITIAL_TAB: NavigationTab = RESUME_TAB && RESUME_TAB in TAB_LABELS ? (RESUME_TAB as NavigationTab) : 'collection';
import { CircleDollarSign } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useBackToClose, useHistoryTabs } from './hooks/useBackButton';
import { useAppUpdate } from './hooks/useAppUpdate';
import { takeResumeTab } from './utils/appVersion';
import { UpdateBanner } from './components/UpdateBanner';
import { useToast } from './hooks/useToast';
import { useSettings } from './hooks/useSettings';
import { useCollectionStats } from './hooks/useCollectionStats';
import { useAppData } from './hooks/useAppData';
import { isArenaFormat } from './utils/mtgFormats';
import { publicSaleApi, messagesApi, usersApi, publicDeckApi } from './services/api';

export default function App() {
  const { toastMessage, showToast } = useToast();
  const { currentUser, handleAuthSuccess, handleLogout, handleLogoutAll, handleUnauthorized } = useAuth(showToast);
  const { settings, updateSettings, applyRemoteSettings } = useSettings(handleUnauthorized);

  const {
    collection,
    wishlist,
    catalogs,
    decks,
    isLoading,
    isRefreshingPrices,
    deleteCollectionItem,
    updateQuantity,
    saveToCollection,
    quickAddToCollection,
    updateWishlistItem,
    addToWishlist,
    removeFromWishlist,
    createCatalog,
    updateCatalog,
    setDefaultCatalog,
    deleteCatalog,
    emptyCatalog,
    createDeck,
    updateDeck,
    deleteDeck,
    refreshPrices,
    exportCollection,
    importCollection,
    bulkAddToCollection,
    updateCollectionItemData,
    toggleForSale,
    sellItemQuantity,
    addCardForSale
  } = useAppData({
    // Przy wymuszonej zmianie hasła nie ładujemy danych (serwer i tak by odmówił)
    userId: currentUser?.mustChangePassword ? undefined : currentUser?.id,
    onUnauthorized: handleUnauthorized,
    showToast,
    onSettingsLoaded: applyRemoteSettings
  });

  const totals = useCollectionStats(collection, settings);

  // Selling modal state for items with quantity > 1
  const [sellingItem, setSellingItem] = useState<CollectionItem | null>(null);

  const handleRequestToggleForSale = useCallback((item: CollectionItem, customPrice?: number | null) => {
    if (item.isForSale) {
      toggleForSale(item);
      return;
    }

    const totalQty = (item.quantity || 0) + (item.quantityFoil || 0);
    if (totalQty > 1) {
      setSellingItem(item);
    } else {
      toggleForSale(item, customPrice);
    }
  }, [toggleForSale]);

  const forSaleCount = React.useMemo(() => {
    return collection.filter(c => Boolean(c.isForSale)).length;
  }, [collection]);

  // Public sale offer state (when accessed via ?sprzedam=... or ?sale=...)
  const [publicSaleData, setPublicSaleData] = useState<{
    seller: { id: string; username: string; email?: string; createdAt?: string };
    cards: CollectionItem[];
    settings: AppSettings;
  } | null>(null);
  // Publiczna lista życzeń (link ?szukam=... lub ?wishlist=...)
  const [publicWishlistData, setPublicWishlistData] = useState<{
    owner: { id: string; username: string };
    wishlist: WishlistItem[];
    settings: AppSettings;
  } | null>(null);
  // Publiczna talia (link ?talia=id)
  const [publicDeckData, setPublicDeckData] = useState<{ deck: DeckItem; owner: { username: string }; settings: AppSettings } | null>(null);
  const publicLink = React.useMemo(() => {
    try {
      return parsePublicLink();
    } catch {
      return null;
    }
  }, []);
  const publicKind = publicLink?.kind || 'sale';
  // Linki z e-maili (potwierdzenie rejestracji, reset hasła)
  const [emailLink, setEmailLink] = useState<EmailLink | null>(() => {
    try {
      return parseEmailLink();
    } catch {
      return null;
    }
  });
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'forgot'>('login');
  const finishEmailLink = useCallback((next: 'login' | 'forgot' = 'login') => {
    setEmailLink(null);
    setAuthInitialMode(next);
    window.history.replaceState({}, '', '/');
  }, []);
  const handleEmailLinkAuth = useCallback((user: AuthUser, token: string, message: string) => {
    handleAuthSuccess(user, token);
    showToast(message);
    finishEmailLink('login');
  }, [handleAuthSuccess, showToast, finishEmailLink]);
  const [showLoginModalFromPublic, setShowLoginModalFromPublic] = useState<boolean>(false);
  const [publicSaleError, setPublicSaleError] = useState<string | null>(null);
  const [isLoadingPublicSale, setIsLoadingPublicSale] = useState<boolean>(() => Boolean(publicLink));

  // Check if opened via public link (?sprzedam=... or ?sale=...)
  React.useEffect(() => {
    try {
      const deckParam = publicLink?.kind === 'deck' ? publicLink.ref : null;
      const wishlistParam = publicLink?.kind === 'wishlist' ? publicLink.ref : null;
      const saleParam = publicLink?.kind === 'sale' ? publicLink.ref : null;
      if (deckParam) {
        setIsLoadingPublicSale(true);
        publicDeckApi.get(deckParam)
          .then(data => {
            setPublicDeckData(data);
            setPublicSaleError(null);
          })
          .catch(err => setPublicSaleError(err.message || 'Nie znaleziono talii.'))
          .finally(() => setIsLoadingPublicSale(false));
      } else if (wishlistParam && !saleParam) {
        setIsLoadingPublicSale(true);
        usersApi.getWishlist(wishlistParam)
          .then(data => {
            setPublicWishlistData({ owner: data.user, wishlist: data.wishlist, settings: data.settings });
            setPublicSaleError(null);
          })
          .catch(err => {
            setPublicSaleError(err.message || 'Nie znaleziono listy życzeń tego użytkownika.');
          })
          .finally(() => setIsLoadingPublicSale(false));
      } else if (saleParam) {
        setIsLoadingPublicSale(true);
        publicSaleApi.getOffers(saleParam)
          .then(data => {
            setPublicSaleData(data);
            setPublicSaleError(null);
          })
          .catch(err => {
            console.warn('Public sale fetch error:', err);
            setPublicSaleError(err.message || 'Nie znaleziono oferty dla tego użytkownika.');
          })
          .finally(() => {
            setIsLoadingPublicSale(false);
          });
      }
    } catch (_) {}
  }, [publicLink]);

  // Navigation & Active View State
  const [activeTab, setActiveTabState] = useState<NavigationTab>(INITIAL_TAB);
  const [selectedDeck, setSelectedDeck] = useState<DeckItem | null>(null);
  // Zmiana zakładki trafia do historii przeglądarki — „Wstecz” wraca do poprzedniej zakładki
  const setActiveTab = useHistoryTabs<NavigationTab>(activeTab, setActiveTabState, 'collection');
  // Nowa wersja aplikacji wchodzi przy zmianie zakładki (przeładowanie prosto na wybraną zakładkę)
  const { showUpdateBanner, applyOnNavigate, reloadNow } = useAppUpdate();
  const navigateTab = useCallback((tab: NavigationTab) => {
    if (tab !== activeTab && applyOnNavigate(tab)) return;
    setActiveTab(tab);
  }, [activeTab, applyOnNavigate, setActiveTab]);
  // Profil sprzedawcy do otwarcia w zakładce Użytkownicy (np. z mapy sprzedawców)
  const [profileRequest, setProfileRequest] = useState<{ username: string; nonce: number } | null>(null);
  const handleOpenSellerProfile = useCallback((username: string) => {
    setProfileRequest({ username, nonce: Date.now() });
    setActiveTab('users');
  }, [setActiveTab]);
  const handleProfileRequestHandled = useCallback(() => setProfileRequest(null), []);
  // Otwarta talia: „Wstecz” wraca do listy talii
  useBackToClose(Boolean(selectedDeck), () => setSelectedDeck(null));

  // Modal Visibility States
  const [isDeckCreateModalOpen, setIsDeckCreateModalOpen] = useState<boolean>(false);
  const [deckToEdit, setDeckToEdit] = useState<DeckItem | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [isCollectionImportExportOpen, setIsCollectionImportExportOpen] = useState<boolean>(false);
  const [collectionImportExportTab, setCollectionImportExportTab] = useState<'export' | 'import'>('export');
  const [isDeckImportModalOpen, setIsDeckImportModalOpen] = useState<boolean>(false);
  const [selectedCardForModal, setSelectedCardForModal] = useState<ScryfallCard | null>(null);
  const [selectedCollectionItemForModal, setSelectedCollectionItemForModal] = useState<CollectionItem | null>(null);
  // Okno szczegółów otwarte z listy życzeń (zmiany foil / wersji trafiają na listę)
  const [selectedWishlistItemForModal, setSelectedWishlistItemForModal] = useState<WishlistItem | null>(null);
  const [deckCardBeingViewed, setDeckCardBeingViewed] = useState<ScryfallCard | null>(null);
  const [deckCardIsFoil, setDeckCardIsFoil] = useState<boolean | undefined>(undefined);

  // Mailbox State
  const [isMailboxOpen, setIsMailboxOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState<boolean>(false);
  // Kropka „nowe” przy zakładce Dziennik zmian
  const changelogBadge = useChangelogBadge(Boolean(currentUser));
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUserSummary[]>([]);

  // Fetch unread messages count & users
  useEffect(() => {
    if (currentUser && !currentUser.mustChangePassword) {
      messagesApi.getUnreadCount()
        .then((res) => setUnreadMessagesCount(res.unreadCount))
        .catch(() => {});

      usersApi.getAll()
        .then((users) => setRegisteredUsers(users))
        .catch(() => {});
    }
  }, [currentUser]);

  // Licznik nieprzeczytanych odświeżany w tle (co 45 s, gdy karta jest widoczna, i po powrocie do karty)
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      messagesApi.getUnreadCount()
        .then((res) => setUnreadMessagesCount(res.unreadCount))
        .catch(() => {});
    };
    const t = window.setInterval(check, 45_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [currentUser]);

  // Liczba nieprzeczytanych w tytule karty przeglądarki, np. „(2) Mana Screw”
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = unreadMessagesCount > 0 ? `(${unreadMessagesCount}) ${base}` : base;
  }, [unreadMessagesCount]);

  const handleOpenCollectionImportExport = useCallback((tab: 'export' | 'import' = 'export') => {
    setCollectionImportExportTab(tab);
    setIsCollectionImportExportOpen(true);
  }, []);

  const handleOpenDeckImport = useCallback(() => {
    setIsDeckImportModalOpen(true);
  }, []);

  // Auto-open scanner modal if opened in a standalone tab with ?scanner=open
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('scanner') === 'open') {
        setIsScannerModalOpen(true);
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // Modal Handlers
  const handleOpenCardModal = useCallback((card: ScryfallCard, item: CollectionItem | null = null) => {
    // Karta z wyszukiwarki / Top z dodatku otwiera formularz dodawania: nowe sztuki trafiają do
    // identycznej pozycji albo do nowej, a zmiana wydania czy foil nie nadpisuje posiadanej karty.
    // Edycję pozycji otwiera tylko kliknięcie karty w kolekcji (przekazane `item`).
    setSelectedCardForModal(item ? item.card : card);
    setSelectedCollectionItemForModal(item);
    setSelectedWishlistItemForModal(null);
    setDeckCardBeingViewed(null);
    setDeckCardIsFoil(item ? item.quantityFoil > 0 && item.quantity === 0 : undefined);
  }, []);

  const handleOpenWishlistCardModal = useCallback((item: WishlistItem) => {
    setSelectedCardForModal(item.card);
    setSelectedCollectionItemForModal(null);
    setSelectedWishlistItemForModal(item);
    setDeckCardBeingViewed(null);
    setDeckCardIsFoil(Boolean(item.isFoil));
  }, []);

  const handleUpdateWishlistItemFromModal = useCallback(async (patch: { card?: ScryfallCard; isFoil?: boolean }) => {
    if (!selectedWishlistItemForModal) return;
    const updated = await updateWishlistItem(selectedWishlistItemForModal.id, patch);
    if (updated) setSelectedWishlistItemForModal(updated);
  }, [selectedWishlistItemForModal, updateWishlistItem]);

  const handleOpenDeckCardModal = useCallback((card: ScryfallCard) => {
    setDeckCardBeingViewed(card);
    let isFoil = false;
    if (selectedDeck) {
      if (selectedDeck.commander && (selectedDeck.commander.id === card.id || selectedDeck.commander.name.toLowerCase() === card.name.toLowerCase())) {
        isFoil = Boolean(selectedDeck.commanderIsFoil);
      } else {
        const found = selectedDeck.cards.find(e => e.card.id === card.id || e.card.name.toLowerCase() === card.name.toLowerCase());
        isFoil = Boolean(found?.isFoil);
      }
    }
    setDeckCardIsFoil(isFoil);
    // Pozycja kolekcji tylko dla dokładnie tej samej karty (to samo wydanie i ta sama wersja foil / zwykła)
    // Talie MTG Arena są cyfrowe: nie łączymy ich kart z pozycjami kolekcji
    const existing = (selectedDeck && isArenaFormat(selectedDeck.format)) ? null : collection.find((c) =>
      !c.isForSale &&
      (c.cardId || c.card.id) === card.id &&
      (isFoil ? c.quantityFoil > 0 && c.quantity === 0 : c.quantity > 0 && c.quantityFoil === 0)
    ) || null;
    setSelectedCardForModal(card);
    setSelectedCollectionItemForModal(existing);
    setSelectedWishlistItemForModal(null);
  }, [collection, selectedDeck]);

  const handleCardPrintSelectedInModal = useCallback((newCard: ScryfallCard) => {
    const targetCard = deckCardBeingViewed || selectedCardForModal;
    if (!targetCard) return;
    // Talie aktualizujemy tylko dla karty z talii lub z kolekcji — nie przy przeglądaniu
    // wyszukiwarki czy listy życzeń (tam zmiana dotyczy tylko tego okna / listy)
    if (!deckCardBeingViewed && !selectedCollectionItemForModal) return;

    const targetId = targetCard.id;
    const targetName = targetCard.name.toLowerCase();

    // 1. Update active deck if present
    if (selectedDeck) {
      const isCommander = Boolean(
        selectedDeck.commander && 
        (selectedDeck.commander.id === targetId || selectedDeck.commander.name.toLowerCase() === targetName)
      );

      const updatedCommander = isCommander ? newCard : selectedDeck.commander;

      const updatedCards = selectedDeck.cards.map(entry => {
        if (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName) {
          return {
            ...entry,
            card: newCard,
          };
        }
        return entry;
      });

      const updatedDeck: DeckItem = {
        ...selectedDeck,
        commander: updatedCommander,
        cards: updatedCards,
      };

      setSelectedDeck(updatedDeck);
      updateDeck(updatedDeck);
      if (deckCardBeingViewed) {
        setDeckCardBeingViewed(newCard);
      }
    }

    // 2. Also sync other decks that contain this card
    decks.forEach(deck => {
      if (selectedDeck && deck.id === selectedDeck.id) return;
      const hasCommander = Boolean(deck.commander && (deck.commander.id === targetId || deck.commander.name.toLowerCase() === targetName));
      const hasInCards = deck.cards.some(entry => entry.card.id === targetId || entry.card.name.toLowerCase() === targetName);

      if (hasCommander || hasInCards) {
        const updatedDeck: DeckItem = {
          ...deck,
          commander: hasCommander ? newCard : deck.commander,
          cards: deck.cards.map(entry => 
            (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName)
              ? { ...entry, card: newCard }
              : entry
          ),
        };
        updateDeck(updatedDeck);
      }
    });

    showToast(`Zaktualizowano wersję [${newCard.set.toUpperCase()}] #${newCard.collector_number} dla "${newCard.name}"!`);
  }, [deckCardBeingViewed, selectedCardForModal, selectedCollectionItemForModal, selectedDeck, decks, updateDeck, showToast]);

  const handleCardFoilToggledInModal = useCallback((isFoil: boolean) => {
    const targetCard = deckCardBeingViewed || selectedCardForModal;
    if (!targetCard) return;
    if (!deckCardBeingViewed && !selectedCollectionItemForModal) return;

    const targetId = targetCard.id;
    const targetName = targetCard.name.toLowerCase();

    // 1. Update active deck if present
    if (selectedDeck) {
      const isCommander = Boolean(
        selectedDeck.commander && 
        (selectedDeck.commander.id === targetId || selectedDeck.commander.name.toLowerCase() === targetName)
      );

      const updatedCommanderIsFoil = isCommander ? isFoil : selectedDeck.commanderIsFoil;

      const updatedCards = selectedDeck.cards.map(entry => {
        if (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName) {
          return {
            ...entry,
            isFoil,
          };
        }
        return entry;
      });

      const updatedDeck: DeckItem = {
        ...selectedDeck,
        commanderIsFoil: updatedCommanderIsFoil,
        cards: updatedCards,
      };

      setSelectedDeck(updatedDeck);
      updateDeck(updatedDeck);
    }

    // 2. Also sync other decks that contain this card
    decks.forEach(deck => {
      if (selectedDeck && deck.id === selectedDeck.id) return;
      const hasCommander = Boolean(deck.commander && (deck.commander.id === targetId || deck.commander.name.toLowerCase() === targetName));
      const hasInCards = deck.cards.some(entry => entry.card.id === targetId || entry.card.name.toLowerCase() === targetName);

      if (hasCommander || hasInCards) {
        const updatedDeck: DeckItem = {
          ...deck,
          commanderIsFoil: hasCommander ? isFoil : deck.commanderIsFoil,
          cards: deck.cards.map(entry => 
            (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName)
              ? { ...entry, isFoil }
              : entry
          ),
        };
        updateDeck(updatedDeck);
      }
    });

    setDeckCardIsFoil(isFoil);
    if (deckCardBeingViewed) {
      showToast(isFoil ? `Ustawiono wersję Foil dla "${targetCard.name}"!` : `Ustawiono wersję Standard dla "${targetCard.name}"!`);
    }
  }, [deckCardBeingViewed, selectedCardForModal, selectedCollectionItemForModal, selectedDeck, decks, updateDeck, showToast]);

  const handleCloseCardModal = useCallback(() => {
    setSelectedCardForModal(null);
    setSelectedCollectionItemForModal(null);
    setSelectedWishlistItemForModal(null);
    setDeckCardBeingViewed(null);
    setDeckCardIsFoil(undefined);
  }, []);

  const handleSaveCardModal = useCallback(async (data: {
    card: ScryfallCard;
    quantity: number;
    quantityFoil: number;
    condition: CardCondition;
    language: CardLanguage;
    purchasePrice?: number | null;
    notes?: string;
    binder?: string;
  }) => {
    const isFoil = data.quantityFoil > 0;
    const updated = await saveToCollection(data, selectedCollectionItemForModal);
    if (updated) {
      setSelectedCollectionItemForModal(updated);
      setSelectedCardForModal(updated.card);
    }

    // Synchronize to active deck directly with the exact saved data without race condition
    if (selectedDeck) {
      const targetId = (deckCardBeingViewed || selectedCardForModal)?.id || data.card.id;
      const targetName = (deckCardBeingViewed || selectedCardForModal)?.name.toLowerCase() || data.card.name.toLowerCase();

      const isCommander = Boolean(
        selectedDeck.commander && 
        (selectedDeck.commander.id === targetId || selectedDeck.commander.name.toLowerCase() === targetName)
      );

      const updatedCommander = isCommander ? data.card : selectedDeck.commander;
      const updatedCommanderIsFoil = isCommander ? isFoil : selectedDeck.commanderIsFoil;

      const updatedCards = selectedDeck.cards.map(entry => {
        if (entry.card.id === targetId || entry.card.name.toLowerCase() === targetName) {
          return {
            ...entry,
            card: data.card,
            isFoil: isFoil,
          };
        }
        return entry;
      });

      const updatedDeck: DeckItem = {
        ...selectedDeck,
        commander: updatedCommander,
        commanderIsFoil: updatedCommanderIsFoil,
        cards: updatedCards,
      };

      setSelectedDeck(updatedDeck);
      updateDeck(updatedDeck);
      if (deckCardBeingViewed) {
        setDeckCardBeingViewed(data.card);
        setDeckCardIsFoil(isFoil);
      }
    }
  }, [saveToCollection, selectedCollectionItemForModal, selectedDeck, deckCardBeingViewed, selectedCardForModal, updateDeck]);

  const handleMoveWishlistToCollection = useCallback((wishlistItem: { id: string; card: ScryfallCard; isFoil?: boolean }) => {
    // „Kupiono”: formularz dodawania (jeśli karta już jest w kolekcji, sztuki się dodadzą)
    setSelectedCardForModal(wishlistItem.card);
    setSelectedCollectionItemForModal(null);
    setSelectedWishlistItemForModal(null);
    setDeckCardBeingViewed(null);
    setDeckCardIsFoil(Boolean(wishlistItem.isFoil));
    removeFromWishlist(wishlistItem.id);
  }, [removeFromWishlist]);

  const handleCreateDeckSuccess = useCallback(async (data: {
    name: string;
    format: string;
    description: string;
    cardSource?: 'all' | 'collection';
    commander?: ScryfallCard | null;
  }) => {
    const newDeck = await createDeck(data);
    if (newDeck) {
      setSelectedDeck(newDeck);
      setActiveTab('decks');
    }
  }, [createDeck]);

  const handleOpenEditDeckModal = useCallback((deck: DeckItem) => {
    setDeckToEdit(deck);
    setIsDeckCreateModalOpen(true);
  }, []);

  const handleUpdateDeckMetadata = useCallback(async (updated: DeckItem) => {
    await updateDeck(updated);
    if (selectedDeck && selectedDeck.id === updated.id) {
      setSelectedDeck(updated);
    }
    showToast(`Zaktualizowano dane talii „${updated.name}”!`);
  }, [updateDeck, selectedDeck, showToast]);

  const handleDeleteDeckAndReset = useCallback(async (deckId: string) => {
    await deleteDeck(deckId);
    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null);
    }
  }, [deleteDeck, selectedDeck]);

  // 0. Link z e-maila: potwierdzenie adresu albo ustawienie nowego hasła
  if (emailLink) {
    return (
      <>
        <EmailLinkView link={emailLink} onAuthSuccess={handleEmailLinkAuth} onDone={(next) => finishEmailLink(next)} />
        <Toast message={toastMessage} />
      </>
    );
  }

  // 1. If currently loading a public sale offer
  if (isLoadingPublicSale) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mb-4" />
        <p className="text-sm font-bold text-stone-300">
          {publicKind === 'deck' ? 'Ładowanie talii...' : publicKind === 'wishlist' ? 'Ładowanie listy życzeń...' : 'Ładowanie oferty sprzedaży kart MTG...'}
        </p>
        <p className="text-xs text-stone-500 mt-1">{publicKind === 'deck' ? 'Sprawdzanie publicznej talii' : publicKind === 'wishlist' ? 'Sprawdzanie publicznej listy' : 'Sprawdzanie publicznego klasera'}</p>
      </div>
    );
  }

  // 2. If opened via public link and returned an error (e.g. user not found)
  if (publicSaleError && !currentUser) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
            <CircleDollarSign className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">{publicKind === 'deck' ? 'Nie znaleziono talii' : publicKind === 'wishlist' ? 'Nie znaleziono listy życzeń' : 'Nie znaleziono oferty'}</h2>
          <p className="text-xs text-stone-400">{publicSaleError}</p>
          <button
            onClick={() => {
              setPublicSaleError(null);
              window.history.pushState({}, '', '/');
            }}
            className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Przejdź do strony głównej / Logowanie
          </button>
        </div>
      </div>
    );
  }

  // 3. Login view requested from public sale view
  if (showLoginModalFromPublic) {
    return (
      <div className="relative min-h-screen bg-stone-950">
        <div className="max-w-md mx-auto pt-6 px-4">
          <button
            onClick={() => setShowLoginModalFromPublic(false)}
            className="mb-4 px-3 py-1.5 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-lg text-xs font-semibold border border-stone-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>{publicKind === 'deck' ? '← Wróć do talii' : publicKind === 'wishlist' ? '← Wróć do listy życzeń' : '← Wróć do oferty sprzedaży'}</span>
          </button>
        </div>
        <AuthView
          onAuthSuccess={(user, token) => {
            handleAuthSuccess(user, token);
            setShowLoginModalFromPublic(false);
            showToast(`Witaj, ${user.username}!`);
          }}
        />
        <Toast message={toastMessage} />
      </div>
    );
  }

  // 4b. Publiczna talia (bez logowania)
  if (publicDeckData) {
    return (
      <>
        <PublicDeckView
          deck={publicDeckData.deck}
          owner={publicDeckData.owner}
          settings={publicDeckData.settings}
          isLoggedIn={Boolean(currentUser)}
          onOpenLogin={() => setShowLoginModalFromPublic(true)}
          showToast={showToast}
        />
        {currentUser && (
          <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-40">
            <button
              onClick={() => {
                setPublicDeckData(null);
                window.history.pushState({}, '', '/');
              }}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-xl shadow-amber-950/50 flex items-center gap-2 cursor-pointer transition-all"
            >
              <span>← Moja Kolekcja ({currentUser.username})</span>
            </button>
          </div>
        )}
        <Toast message={toastMessage} />
      </>
    );
  }

  // 4a. Publiczna lista życzeń (bez logowania)
  if (publicWishlistData) {
    return (
      <>
        <PublicWishlistView
          owner={publicWishlistData.owner}
          wishlist={publicWishlistData.wishlist}
          settings={publicWishlistData.settings}
          isLoggedIn={Boolean(currentUser)}
          onOpenLogin={() => setShowLoginModalFromPublic(true)}
          showToast={showToast}
        />
        {currentUser && (
          <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-40">
            <button
              onClick={() => {
                setPublicWishlistData(null);
                window.history.pushState({}, '', '/');
              }}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-xl shadow-amber-950/50 flex items-center gap-2 cursor-pointer transition-all"
            >
              <span>← Moja Kolekcja ({currentUser.username})</span>
            </button>
          </div>
        )}
        <Toast message={toastMessage} />
      </>
    );
  }

  // 4. Public sale offer view (rendered for anyone with the public link, without requiring an account!)
  if (publicSaleData) {
    return (
      <>
        <PublicSaleView
          seller={publicSaleData.seller}
          cards={publicSaleData.cards}
          settings={publicSaleData.settings}
          onOpenLogin={() => setShowLoginModalFromPublic(true)}
          showToast={showToast}
          currentUserId={currentUser?.id || null}
        />
        {/* If user is already logged in, show floating button to switch back to their collection */}
        {currentUser && (
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={() => {
                setPublicSaleData(null);
                window.history.pushState({}, '', '/');
              }}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-xl shadow-amber-950/50 flex items-center gap-2 cursor-pointer transition-all"
            >
              <span>← Moja Kolekcja ({currentUser.username})</span>
            </button>
          </div>
        )}
        <Toast message={toastMessage} />
      </>
    );
  }

  // 5. Unauthenticated screen
  if (!currentUser) {
    return (
      <>
        <AuthView initialMode={authInitialMode} onAuthSuccess={(user, token) => {
          handleAuthSuccess(user, token);
          showToast(`Witaj w kolekcji, ${user.username}!`);
        }} />
        <Toast message={toastMessage} />
      </>
    );
  }

  // 6. Hasło nadane przez administratora — najpierw trzeba ustawić własne
  if (currentUser.mustChangePassword) {
    return (
      <>
        <ForcePasswordChange
          user={currentUser}
          onChanged={(user, token) => {
            handleAuthSuccess(user, token);
            showToast('Hasło zostało zmienione.');
          }}
          onLogout={handleLogout}
        />
        <Toast message={toastMessage} />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 font-sans selection:bg-amber-500 selection:text-stone-950 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={navigateTab}
        totalCards={totals.totalCards}
        totalValue={totals.totalValue}
        valueChange={totals.valueChange}
        valueChangePercent={totals.valueChangePercent}
        lastPriceChangeAt={totals.lastPriceChangeAt}
        settings={settings}
        decksCount={decks.length}
        forSaleCount={forSaleCount}
        hasNewChangelog={changelogBadge.hasNew}
        onOpenSettings={() => navigateTab('settings')}
        onRefreshPrices={refreshPrices}
        isRefreshing={isRefreshingPrices}
        onOpenAddModal={() => navigateTab('search')}
        onOpenScannerModal={() => setIsScannerModalOpen(true)}
        onExportCollection={exportCollection}
        onImportCollection={importCollection}
        onOpenImportExport={handleOpenCollectionImportExport}
        user={currentUser}
        onLogout={handleLogout}
        unreadMessagesCount={unreadMessagesCount}
        onOpenMailbox={() => setIsMailboxOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenBugReport={() => setIsBugReportOpen(true)}
      />
      {isHistoryOpen && <CollectionHistoryModal currency={settings.currency} onClose={() => setIsHistoryOpen(false)} />}
      {isBugReportOpen && (
        <React.Suspense fallback={null}>
          <BugReportModal
            page={`${TAB_LABELS[activeTab] || activeTab}${activeTab === 'decks' && selectedDeck ? `: ${selectedDeck.name}` : ''}`}
            onClose={() => setIsBugReportOpen(false)}
            showToast={showToast}
          />
        </React.Suspense>
      )}

      {/* Main View Container */}
      <main className="max-w-[1760px] w-full mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 pt-4 md:pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <p className="text-sm font-bold text-stone-400">Ładowanie Twojej kolekcji i wycen rynkowych...</p>
          </div>
        ) : (
          activeTab === 'settings' ? (
            <SettingsPage
              user={currentUser}
              settings={settings}
              onSaveSettings={async (newSettings) => {
                await updateSettings(newSettings);
                showToast('Zapisano ustawienia wyceny i waluty.');
              }}
              onLogoutAll={handleLogoutAll}
              onPasswordChanged={(user, token) => handleAuthSuccess(user, token)}
              onOpenImportExport={handleOpenCollectionImportExport}
              onAccountDeleted={() => {
                handleUnauthorized();
                setActiveTab('collection');
                showToast('Twoje konto zostało usunięte. Dziękujemy za korzystanie z Mana Screw.');
              }}
              showToast={showToast}
            />
          ) : (
          <TabContent
            onChangelogSeen={changelogBadge.markSeen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            collection={collection}
            wishlist={wishlist}
            catalogs={catalogs}
            decks={decks}
            selectedDeck={selectedDeck}
            settings={settings}
            onSelectDeck={setSelectedDeck}
            onBackFromDeck={() => setSelectedDeck(null)}
            onUpdateDeck={(updated) => {
              setSelectedDeck(updated);
              updateDeck(updated);
            }}
            onDeleteDeck={handleDeleteDeckAndReset}
            onCopyDeckToCollection={async (deck) => {
              if (isArenaFormat(deck.format)) {
                showToast('Talie MTG Arena są cyfrowe, więc ich kart nie dodaje się do kolekcji.');
                return false;
              }
              const binder = catalogs.find((c) => c.isDefault)?.name || 'Klaser Główny';
              // Te same wydania i wersje foil co w talii; ta sama karta w tej samej wersji sumuje się,
              // a zwykła i foil to osobne pozycje
              const byKey = new Map<string, any>();
              const add = (card: any, qty: number, foil: boolean) => {
                const key = `${card.id}|${foil ? 'foil' : 'normal'}`;
                const prev = byKey.get(key) || {
                  card,
                  cardId: card.id,
                  quantity: 0,
                  quantityFoil: 0,
                  condition: 'NM',
                  language: langFromCard(card),
                  binder,
                  addedAt: new Date().toISOString()
                };
                if (foil) prev.quantityFoil += qty;
                else prev.quantity += qty;
                byKey.set(key, prev);
              };
              if (deck.commander) add(deck.commander, 1, Boolean(deck.commanderIsFoil));
              deck.cards.filter((e) => !e.isSideboard && !e.isCommander).forEach((e) => add(e.card, e.quantity, Boolean(e.isFoil)));
              const items = [...byKey.values()];
              const total = items.reduce((sum, i) => sum + i.quantity + i.quantityFoil, 0);
              const ok = await bulkAddToCollection(items);
              showToast(ok ? `Dodano ${total} kart z talii „${deck.name}” do klasera „${binder}”.` : 'Nie udało się dodać kart do kolekcji. Spróbuj ponownie.');
              return ok;
            }}
            onOpenCreateDeckModal={() => {
              setDeckToEdit(null);
              setIsDeckCreateModalOpen(true);
            }}
            onEditDeck={handleOpenEditDeckModal}
            onCreateCatalog={createCatalog}
            onUpdateCatalog={updateCatalog}
            onDeleteCatalog={deleteCatalog}
            onEmptyCatalog={emptyCatalog}
            onSetDefaultCatalog={setDefaultCatalog}
            onUpdateQuantity={updateQuantity}
            onDeleteItem={deleteCollectionItem}
            onEditCollectionItem={(item) => handleOpenCardModal(item.card, item)}
            onViewCollectionItemDetails={(item) => handleOpenCardModal(item.card, item)}
            onQuickAddToCollection={quickAddToCollection}
            onAddToWishlist={addToWishlist}
            onViewWishlistItem={handleOpenWishlistCardModal}
            onRemoveFromWishlist={removeFromWishlist}
            onMoveWishlistToCollection={handleMoveWishlistToCollection}
            onSelectCard={(card) => handleOpenCardModal(card, null)}
            onViewDeckCardDetails={handleOpenDeckCardModal}
            onOpenScannerModal={() => setIsScannerModalOpen(true)}
            onOpenImportDeck={handleOpenDeckImport}
            onOpenCollectionImportExport={handleOpenCollectionImportExport}
            onUpdateSettings={updateSettings}
            currentUser={currentUser}
            onToggleForSale={handleRequestToggleForSale}
            onAddCardForSale={addCardForSale}
            onUpdateCollectionItem={updateCollectionItemData}
            showToast={showToast}
            onOpenSellerProfile={handleOpenSellerProfile}
            profileRequest={profileRequest}
            onProfileRequestHandled={handleProfileRequestHandled}
          />
          )
        )}
      </main>

      {/* Dolny pasek nawigacji (tylko telefon) */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={navigateTab}
        onOpenScanner={() => setIsScannerModalOpen(true)}
        onOpenMailbox={() => setIsMailboxOpen(true)}
        onOpenSettings={() => navigateTab('settings')}
        onOpenImportExport={handleOpenCollectionImportExport}
        onRefreshPrices={refreshPrices}
        isRefreshing={isRefreshingPrices}
        onLogout={handleLogout}
        unreadMessagesCount={unreadMessagesCount}
        user={currentUser}
        hasNewChangelog={changelogBadge.hasNew}
        onOpenBugReport={() => setIsBugReportOpen(true)}
      />

      {/* Settings Modal */}

      {/* Camera OCR Card Scanner Modal */}
      {isScannerModalOpen && (
        <CameraScannerModal
          isOpen={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          catalogs={catalogs}
          settings={settings}
          onSaveToCollection={saveToCollection}
          showToast={showToast}
        />
      )}

      {/* Collection Import / Export Modal (.txt and .json) */}
      {isCollectionImportExportOpen && (
        <ImportExportModal
          isOpen={isCollectionImportExportOpen}
          initialTab={collectionImportExportTab}
          collection={collection}
          catalogs={catalogs}
          onImportBulk={async (items, onProgress) => {
            const ok = await bulkAddToCollection(items, onProgress);
            if (!ok) throw new Error('Nie udało się zapisać wszystkich kart. Część mogła zostać dodana, sprawdź kolekcję.');
          }}
          onClose={() => setIsCollectionImportExportOpen(false)}
          showToast={showToast}
        />
      )}

      {/* Deck Import Modal (.txt) */}
      {isDeckImportModalOpen && (
        <DeckImportExportModal
          isOpen={isDeckImportModalOpen}
          initialTab="import"
          onClose={() => setIsDeckImportModalOpen(false)}
          onCreateDeck={async (deckData) => {
            const newDeck = await createDeck(deckData);
            if (newDeck) {
              setSelectedDeck(newDeck);
              setActiveTab('decks');
            }
          }}
          showToast={showToast}
        />
      )}

      {/* Card Detail & Add/Edit Modal */}
      {selectedCardForModal && (
        <CardModal
          card={selectedCardForModal}
          existingItem={selectedCollectionItemForModal}
          settings={settings}
          catalogs={catalogs}
          onCreateCatalog={createCatalog}
          onClose={handleCloseCardModal}
          onSaveToCollection={handleSaveCardModal}
          onAddToWishlist={addToWishlist}
          onSelectPrint={handleCardPrintSelectedInModal}
          onQuickAddToCollection={quickAddToCollection}
          onToggleFoil={handleCardFoilToggledInModal}
          initialFoil={deckCardIsFoil}
          wishlistItem={selectedWishlistItemForModal}
          onUpdateWishlistItem={handleUpdateWishlistItemFromModal}
          collectionBlockedReason={
            deckCardBeingViewed && selectedDeck && isArenaFormat(selectedDeck.format)
              ? 'Karta z talii MTG Arena. Talie MTGA są cyfrowe, więc ich kart nie dodaje się do kolekcji.'
              : null
          }
        />
      )}

      {/* Deck Create / Edit Modal */}
      {isDeckCreateModalOpen && (
        <DeckCreateModal
          isOpen={isDeckCreateModalOpen}
          deckToEdit={deckToEdit}
          collection={collection}
          onClose={() => {
            setIsDeckCreateModalOpen(false);
            setDeckToEdit(null);
          }}
          onCreateDeck={handleCreateDeckSuccess}
          onUpdateDeck={handleUpdateDeckMetadata}
        />
      )}

      {/* Mailbox Modal */}
      {isMailboxOpen && (
        <MailboxModal
          isOpen={isMailboxOpen}
          onClose={() => setIsMailboxOpen(false)}
          currentUser={currentUser}
          availableUsers={registeredUsers}
          onUnreadCountChange={setUnreadMessagesCount}
          showToast={showToast}
        />
      )}

      {/* Sell Quantity Modal */}
      {sellingItem && (
        <SellQuantityModal
          isOpen={Boolean(sellingItem)}
          item={sellingItem}
          settings={settings}
          onClose={() => setSellingItem(null)}
          onConfirm={async (item, qty, isFoil, customPrice) => {
            await sellItemQuantity(item, qty, isFoil, customPrice);
          }}
        />
      )}

      {/* Notification Toast */}
      <Toast message={toastMessage} />
      {showUpdateBanner && <UpdateBanner onReload={() => reloadNow(activeTab)} />}
    </div>
  );
}
