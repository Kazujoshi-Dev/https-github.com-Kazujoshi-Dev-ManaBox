import { langFromCard } from '../utils/formatters';
import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { CollectionItem, WishlistItem, Catalog, DeckItem, ScryfallCard, CardCondition, CardLanguage, AppSettings } from '../types';
import { collectionApi, wishlistApi, catalogsApi, decksApi, settingsApi } from '../services/api';

interface UseAppDataProps {
  userId?: string | null;
  onUnauthorized: () => void;
  showToast: (message: string) => void;
  onSettingsLoaded?: (settings: Partial<AppSettings>) => void;
}

export function useAppData({ userId, onUnauthorized, showToast, onSettingsLoaded }: UseAppDataProps) {
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState<boolean>(false);

  // Load all user data on auth status change
  useEffect(() => {
    let isCurrent = true;

    async function loadData() {
      if (!userId) {
        setIsLoading(false);
        setCollection([]);
        setWishlist([]);
        setCatalogs([]);
        setDecks([]);
        return;
      }

      try {
        setIsLoading(true);

        const [colRes, wishRes, catRes, setRes, deckRes] = await Promise.all([
          collectionApi.getAll(onUnauthorized),
          wishlistApi.getAll(onUnauthorized),
          catalogsApi.getAll(onUnauthorized),
          settingsApi.get(onUnauthorized),
          decksApi.getAll(onUnauthorized)
        ]);

        if (!isCurrent) return;

        if (colRes.ok) {
          const colData = await colRes.json();
          setCollection(colData);
        }

        if (wishRes.ok) {
          const wishData = await wishRes.json();
          setWishlist(wishData);
        }

        if (catRes.ok) {
          const catData = await catRes.json();
          setCatalogs(catData);
        }

        if (deckRes && deckRes.ok) {
          const deckData = await deckRes.json();
          setDecks(deckData);
        }

        if (setRes.ok) {
          const remoteSettings = await setRes.json();
          if (remoteSettings && remoteSettings.currency) {
            onSettingsLoaded?.(remoteSettings);
          }
        }
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCurrent = false;
    };
  }, [userId, onUnauthorized, onSettingsLoaded]);

  // Collection CRUD
  const deleteCollectionItem = useCallback(async (id: string) => {
    try {
      const res = await collectionApi.delete(id, onUnauthorized);
      if (res.ok) {
        setCollection(prev => prev.filter(c => c.id !== id));
        showToast('Usunięto kartę z kolekcji');
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }, [onUnauthorized, showToast]);

  const updateQuantity = useCallback(async (id: string, deltaNormal: number, deltaFoil: number) => {
    const item = collection.find(c => c.id === id);
    if (!item) return;

    const newQtyNormal = Math.max(0, item.quantity + deltaNormal);
    const newQtyFoil = Math.max(0, item.quantityFoil + deltaFoil);

    if (newQtyNormal === 0 && newQtyFoil === 0) {
      await deleteCollectionItem(id);
      return;
    }

    try {
      const res = await collectionApi.update(id, { quantity: newQtyNormal, quantityFoil: newQtyFoil }, onUnauthorized);
      if (res.ok) {
        const updated = await res.json();
        setCollection(prev => prev.map(c => c.id === id ? updated : c));
      }
    } catch (err) {
      console.error('Failed to update quantity:', err);
    }
  }, [collection, deleteCollectionItem, onUnauthorized]);

  const updateCollectionItemData = useCallback(async (id: string, updates: Partial<CollectionItem>) => {
    try {
      const res = await collectionApi.update(id, updates, onUnauthorized);
      if (res.ok) {
        const updated = await res.json();
        setCollection(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
        return updated;
      }
    } catch (err) {
      console.error('Failed to update item data:', err);
    }
    return null;
  }, [onUnauthorized]);

  const toggleForSale = useCallback(async (item: CollectionItem, customPrice?: number | null) => {
    const nextForSale = !item.isForSale;
    const updates: Partial<CollectionItem> = {
      isForSale: nextForSale,
      ...(customPrice !== undefined ? { salePrice: customPrice } : {})
    };
    const res = await updateCollectionItemData(item.id, updates);
    if (res) {
      if (nextForSale) {
        showToast(`Wystawiono "${item.card.name}" na sprzedaż! Przeniesiono ją z klasera do kategorii „Sprzedam”.`);
      } else {
        showToast(`Wycofano "${item.card.name}" ze sprzedaży i wróciła do klasera „${item.binder || 'Klaser Główny'}”.`);
      }
    }
  }, [updateCollectionItemData, showToast]);

  const sellItemQuantity = useCallback(async (
    item: CollectionItem,
    quantityToSell: number,
    isFoil: boolean = false,
    customPrice?: number | null
  ) => {
    const normalQty = item.quantity || 0;
    const foilQty = item.quantityFoil || 0;

    if (quantityToSell <= 0) return;

    // Case 1: Selling all available copies of this item
    const isSellingEntireItem =
      (isFoil && quantityToSell >= foilQty && normalQty === 0) ||
      (!isFoil && quantityToSell >= normalQty && foilQty === 0) ||
      (quantityToSell >= (normalQty + foilQty));

    if (isSellingEntireItem) {
      const updates: Partial<CollectionItem> = {
        isForSale: true,
        ...(customPrice !== undefined ? { salePrice: customPrice } : {})
      };
      await updateCollectionItemData(item.id, updates);
      showToast(`Wystawiono "${item.card.name}" (${quantityToSell} szt.) na sprzedaż!`);
      return;
    }

    // Case 2: Partial quantity -> split item
    try {
      const remainingNormal = isFoil ? normalQty : Math.max(0, normalQty - quantityToSell);
      const remainingFoil = isFoil ? Math.max(0, foilQty - quantityToSell) : foilQty;

      // 1. Update existing item with reduced count
      await updateCollectionItemData(item.id, {
        quantity: remainingNormal,
        quantityFoil: remainingFoil
      });

      // 2. Create new item specifically marked for sale
      const newItemData = {
        cardId: item.cardId || item.card.id,
        card: item.card,
        quantity: isFoil ? 0 : quantityToSell,
        quantityFoil: isFoil ? quantityToSell : 0,
        condition: item.condition,
        language: item.language,
        purchasePrice: item.purchasePrice,
        notes: item.notes,
        binder: item.binder,
        isForSale: true,
        salePrice: customPrice !== undefined ? customPrice : item.salePrice
      };

      const res = await collectionApi.create(newItemData, onUnauthorized);
      if (res.ok) {
        const createdItem = await res.json();
        setCollection((prev) => [createdItem, ...prev]);
        showToast(`Wystawiono ${quantityToSell} szt. "${item.card.name}" na sprzedaż!`);
      }
    } catch (err: any) {
      console.error('Error splitting item for sale:', err);
      showToast('Wystąpił błąd podczas wystawiania kart na sprzedaż.');
    }
  }, [updateCollectionItemData, onUnauthorized, showToast]);

  const saveToCollection = useCallback(async (
    data: {
      card: ScryfallCard;
      quantity: number;
      quantityFoil: number;
      condition: CardCondition;
      language: CardLanguage;
      purchasePrice?: number | null;
      notes?: string;
      binder?: string;
    },
    existingItem?: CollectionItem | null
  ): Promise<CollectionItem | null> => {
    try {
      // Find existing item if passed or match by card ID / name in current collection
      const targetExisting = existingItem || collection.find(
        (c) =>
          c.card.id === data.card.id ||
          c.cardId === data.card.id ||
          (c.card.name.toLowerCase() === data.card.name.toLowerCase() &&
           c.card.set.toLowerCase() === data.card.set.toLowerCase() &&
           c.card.collector_number === data.card.collector_number)
      );

      if (targetExisting) {
        // Bez wskazanej pozycji (np. „Dodaj” z wyszukiwarki) karta, którą już masz, dostaje
        // dodatkowe sztuki — nie nadpisujemy posiadanej liczby.
        const isAddition = !existingItem;
        const payload = isAddition
          ? {
              ...data,
              quantity: (targetExisting.quantity || 0) + (data.quantity || 0),
              quantityFoil: (targetExisting.quantityFoil || 0) + (data.quantityFoil || 0),
              condition: targetExisting.condition,
              language: targetExisting.language,
              binder: targetExisting.binder,
              notes: targetExisting.notes || data.notes
            }
          : data;
        const res = await collectionApi.update(targetExisting.id, {
          cardId: data.card.id,
          ...payload
        }, onUnauthorized);

        if (res.ok) {
          const updated: CollectionItem = await res.json();
          setCollection(prev => prev.map(c => c.id === updated.id ? updated : c));
          showToast(
            isAddition
              ? `Dodano "${data.card.name}", masz teraz ${updated.quantity + updated.quantityFoil} szt.`
              : `Zapisano wersję "${data.card.name}" [${data.card.set.toUpperCase()}] #${data.card.collector_number}`
          );
          return updated;
        }
      } else {
        const res = await collectionApi.create({
          cardId: data.card.id,
          ...data
        }, onUnauthorized);

        if (res.ok) {
          const newItem: CollectionItem = await res.json();
          setCollection(prev => [newItem, ...prev]);
          showToast(`Dodano "${data.card.name}" do kolekcji!`);
          return newItem;
        }
      }
    } catch (err) {
      console.error('Failed to save card:', err);
    }
    return null;
  }, [collection, onUnauthorized, showToast]);

  /**
   * Dodaje kartę od razu na sprzedaż (bez szukania jej w kolekcji). Ta sama karta w tym samym
   * stanie i języku, już wystawiona, dostaje dodatkowe sztuki; inaczej powstaje nowa pozycja.
   */
  const addCardForSale = useCallback(async (data: {
    card: ScryfallCard;
    quantity: number;
    isFoil: boolean;
    condition: CardCondition;
    language: CardLanguage;
    salePrice: number | null;
  }): Promise<boolean> => {
    const qty = Math.max(1, Math.floor(data.quantity || 1));
    const existing = collection.find(
      (c) =>
        c.isForSale &&
        (c.card.id === data.card.id || c.cardId === data.card.id) &&
        c.condition === data.condition &&
        c.language === data.language &&
        (data.isFoil ? c.quantityFoil > 0 && c.quantity === 0 : c.quantity > 0 && c.quantityFoil === 0)
    );
    try {
      if (existing) {
        const res = await collectionApi.update(existing.id, {
          cardId: existing.cardId || existing.card.id,
          card: existing.card,
          quantity: existing.quantity + (data.isFoil ? 0 : qty),
          quantityFoil: existing.quantityFoil + (data.isFoil ? qty : 0),
          condition: existing.condition,
          language: existing.language,
          purchasePrice: existing.purchasePrice,
          notes: existing.notes,
          binder: existing.binder,
          isForSale: true,
          salePrice: data.salePrice ?? existing.salePrice ?? null
        }, onUnauthorized);
        if (!res.ok) throw new Error();
        const updated: CollectionItem = await res.json();
        setCollection((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        showToast(`Dodano ${qty} szt. „${data.card.name}” do oferty, wystawione: ${updated.quantity + updated.quantityFoil} szt.`);
        return true;
      }
      const binder = catalogs.find((c) => c.isDefault)?.name || catalogs[0]?.name || 'Klaser Główny';
      const res = await collectionApi.create({
        cardId: data.card.id,
        card: data.card,
        quantity: data.isFoil ? 0 : qty,
        quantityFoil: data.isFoil ? qty : 0,
        condition: data.condition,
        language: data.language,
        binder,
        isForSale: true,
        salePrice: data.salePrice
      }, onUnauthorized);
      if (!res.ok) throw new Error();
      const created: CollectionItem = await res.json();
      setCollection((prev) => [created, ...prev]);
      showToast(`Wystawiono na sprzedaż: ${qty} szt. „${data.card.name}”`);
      return true;
    } catch {
      showToast('Nie udało się dodać karty na sprzedaż. Spróbuj ponownie.');
      return false;
    }
  }, [collection, catalogs, onUnauthorized, showToast]);

  const quickAddToCollection = useCallback((card: ScryfallCard) => {
    const defaultBinder = (catalogs && catalogs.length > 0)
      ? (catalogs.find(c => c.isDefault)?.name || catalogs[0].name)
      : 'Klaser Główny';

    saveToCollection({
      card,
      quantity: 1,
      quantityFoil: 0,
      condition: 'NM',
      language: langFromCard(card),
      binder: defaultBinder,
      purchasePrice: null
    });
  }, [catalogs, saveToCollection]);

  // Wishlist CRUD
  const addToWishlist = useCallback(async (card: ScryfallCard, isFoil = false) => {
    try {
      const res = await wishlistApi.create({
        cardId: card.id,
        card,
        targetQuantity: 1,
        isFoil
      }, onUnauthorized);

      if (res.ok) {
        const newItem = await res.json();
        setWishlist(prev => [newItem, ...prev]);
        showToast(`Dodano "${card.name}"${isFoil ? ' (Foil)' : ''} do Listy Życzeń!`);
      }
    } catch (err) {
      console.error('Failed to add to wishlist:', err);
    }
  }, [onUnauthorized, showToast]);

  const updateWishlistItem = useCallback(async (
    id: string,
    patch: { card?: ScryfallCard; isFoil?: boolean; targetQuantity?: number; notes?: string }
  ): Promise<WishlistItem | null> => {
    try {
      const res = await wishlistApi.update(id, patch, onUnauthorized);
      if (res.ok) {
        const updated: WishlistItem = await res.json();
        setWishlist(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        return updated;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Nie udało się zapisać zmiany na liście życzeń.');
    } catch (err) {
      console.error('Failed to update wishlist item:', err);
      showToast('Nie udało się zapisać zmiany na liście życzeń.');
    }
    return null;
  }, [onUnauthorized, showToast]);

  const removeFromWishlist = useCallback(async (id: string) => {
    try {
      const res = await wishlistApi.delete(id, onUnauthorized);
      if (res.ok) {
        setWishlist(prev => prev.filter(w => w.id !== id));
        showToast('Usunięto z Listy Życzeń');
      }
    } catch (err) {
      console.error('Failed to remove from wishlist:', err);
    }
  }, [onUnauthorized, showToast]);

  // Catalog CRUD
  const createCatalog = useCallback(async (
    name: string,
    description?: string,
    color?: string,
    isDefault?: boolean
  ): Promise<Catalog | null> => {
    try {
      const res = await catalogsApi.create({ name, description, color, isDefault }, onUnauthorized);
      if (res.ok) {
        const created = await res.json();
        if (created.isDefault) {
          setCatalogs(prev => [...prev.map(c => ({ ...c, isDefault: false })), created]);
        } else {
          setCatalogs(prev => [...prev, created]);
        }
        showToast(`Utworzono katalog "${created.name}"`);
        return created;
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Błąd tworzenia katalogu');
      }
    } catch (err: any) {
      showToast(err.message || 'Nie udało się utworzyć katalogu');
      throw err;
    }
  }, [onUnauthorized, showToast]);

  const updateCatalog = useCallback(async (id: string, updates: Partial<Catalog>) => {
    try {
      const res = await catalogsApi.update(id, updates, onUnauthorized);
      if (res.ok) {
        const updated = await res.json();
        if (updated.isDefault) {
          setCatalogs(prev => prev.map(c => c.id === id ? updated : { ...c, isDefault: false }));
        } else {
          setCatalogs(prev => prev.map(c => c.id === id ? updated : c));
        }

        const colRes = await collectionApi.getAll(onUnauthorized);
        if (colRes.ok) setCollection(await colRes.json());
        showToast(`Zaktualizowano katalog "${updated.name}"`);
      }
    } catch (err) {
      console.error('Failed to update catalog:', err);
    }
  }, [onUnauthorized, showToast]);

  const setDefaultCatalog = useCallback(async (id: string) => {
    try {
      const res = await catalogsApi.setDefault(id, onUnauthorized);
      if (res.ok) {
        const data = await res.json();
        if (data.catalogs) {
          setCatalogs(data.catalogs);
        } else {
          setCatalogs(prev => prev.map(c => ({
            ...c,
            isDefault: c.id === id
          })));
        }
        const target = catalogs.find(c => c.id === id);
        showToast(`Oznaczono "${target?.name || 'Katalog'}" jako domyślny`);
      }
    } catch (err) {
      console.error('Failed to set default catalog:', err);
    }
  }, [catalogs, onUnauthorized, showToast]);

  const deleteCatalog = useCallback(async (id: string) => {
    try {
      const res = await catalogsApi.delete(id, onUnauthorized);
      if (res.ok) {
        const data = await res.json();
        if (data.catalogs) {
          setCatalogs(data.catalogs);
        } else {
          setCatalogs(prev => prev.filter(c => c.id !== id));
        }
        const colRes = await collectionApi.getAll(onUnauthorized);
        if (colRes.ok) setCollection(await colRes.json());
        showToast(
          data.deletedItems > 0
            ? `Usunięto klaser i ${data.deletedItems} pozycji z kolekcji. Głównym klaserem jest teraz: ${data.reassignedTo}`
            : `Usunięto klaser. Karty przeniesiono do: ${data.reassignedTo}`
        );
      }
    } catch (err) {
      console.error('Failed to delete catalog:', err);
    }
  }, [onUnauthorized, showToast]);

  // Deck CRUD
  const createDeck = useCallback(async (data: {
    name: string;
    format: string;
    description: string;
    cardSource?: 'all' | 'collection';
    commander?: ScryfallCard | null;
  }): Promise<DeckItem> => {
    try {
      const res = await decksApi.create(data, onUnauthorized);
      if (res.ok) {
        const newDeck: DeckItem = await res.json();
        setDecks(prev => [newDeck, ...prev]);
        showToast(`Utworzono talię "${newDeck.name}" [${newDeck.format || 'EDH Commander'}]!`);
        return newDeck;
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Nie udało się utworzyć talii.');
      }
    } catch (err: any) {
      showToast(err.message || 'Błąd tworzenia talii.');
      throw err;
    }
  }, [onUnauthorized, showToast]);

  const updateDeck = useCallback(async (updated: DeckItem) => {
    setDecks(prev => prev.map(d => d.id === updated.id ? updated : d));
    try {
      await decksApi.update(updated, onUnauthorized);
    } catch (err) {
      console.error('Failed to update deck:', err);
    }
  }, [onUnauthorized]);

  const deleteDeck = useCallback(async (deckId: string) => {
    try {
      const res = await decksApi.delete(deckId, onUnauthorized);
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== deckId));
        showToast('Usunięto talię.');
      }
    } catch (err) {
      console.error('Failed to delete deck:', err);
    }
  }, [onUnauthorized, showToast]);

  // Price refresh
  const refreshPrices = useCallback(async () => {
    try {
      setIsRefreshingPrices(true);
      const res = await collectionApi.refreshPrices(onUnauthorized);
      if (res.ok) {
        const data = await res.json();
        if (data.collection) {
          setCollection(data.collection);
          const changed = data.changedCount ?? 0;
          const skipped = data.skippedCount ?? 0;
          showToast(
            (changed > 0
              ? `Zaktualizowano ceny: ${data.updatedCount} kart, ${changed} ze zmianą ceny.`
              : `Zaktualizowano ceny dla ${data.updatedCount} kart, bez zmian od ostatniej aktualizacji.`) +
              (skipped > 0 ? ` ${skipped} kart spoza bazy zaktualizujemy przy kolejnym odświeżeniu (najwcześniej za kilka godzin).` : '')
          );
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Nie udało się odświeżyć cen. Spróbuj ponownie później.');
      }
    } catch (err) {
      console.error('Failed to refresh prices:', err);
    } finally {
      setIsRefreshingPrices(false);
    }
  }, [onUnauthorized, showToast]);

  // Import / Export
  const exportCollection = useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(collection, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mana-screw-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Pobrano plik z kopią zapasową kolekcji');
  }, [collection, showToast]);

  const importCollection = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          const res = await collectionApi.bulkImport(importedData, onUnauthorized);
          if (res.ok) {
            const colRes = await collectionApi.getAll(onUnauthorized);
            if (colRes.ok) {
              setCollection(await colRes.json());
              showToast('Pomyślnie zaimportowano kolekcję!');
            }
          }
        }
      } catch (err) {
        alert('Nieprawidłowy format pliku JSON');
      }
    };
    reader.readAsText(file);
  }, [onUnauthorized, showToast]);

  const bulkAddToCollection = useCallback(async (items: any[]) => {
    try {
      const res = await collectionApi.bulkAdd(items, onUnauthorized);
      if (res.ok) {
        const colRes = await collectionApi.getAll(onUnauthorized);
        if (colRes.ok) {
          const fresh = await colRes.json();
          setCollection(fresh);
          return true;
        }
      }
    } catch (err) {
      console.error('Failed to bulk add to collection:', err);
    }
    return false;
  }, [onUnauthorized]);

  return {
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
  };
}
