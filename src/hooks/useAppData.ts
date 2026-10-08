import { langFromCard } from '../utils/formatters';
import { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import { entryKeyOf, matchesEntry, splitByFinish } from '../utils/collectionEntry';
import { CollectionItem, WishlistItem, Catalog, DeckItem, ScryfallCard, CardCondition, CardLanguage, AppSettings } from '../types';
import { collectionApi, wishlistApi, catalogsApi, decksApi, settingsApi } from '../services/api';

interface UseAppDataProps {
  userId?: string | null;
  onUnauthorized: () => void;
  showToast: (message: string) => void;
  onSettingsLoaded?: (settings: Partial<AppSettings>) => void;
}

interface CardSaveInput {
  card: ScryfallCard;
  quantity: number;
  quantityFoil: number;
  condition: CardCondition;
  language: CardLanguage;
  purchasePrice?: number | null;
  notes?: string;
  binder?: string;
}

export function useAppData({ userId, onUnauthorized, showToast, onSettingsLoaded }: UseAppDataProps) {
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  // Najświeższa kolekcja dla kilku zapisów pod rząd (np. skaner w trybie ciągłym)
  const collectionRef = useRef<CollectionItem[]>(collection);
  collectionRef.current = collection;
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

    // Przyciski +/− zmieniają liczbę sztuk tej pozycji: przy karcie foil to sztuki foil,
    // żeby nie dopisać do niej zwykłej wersji
    if (item.quantityFoil > 0 && item.quantity === 0) {
      deltaFoil += deltaNormal;
      deltaNormal = 0;
    }

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

  /**
   * Dopisuje sztuki jednej wersji (zwykła albo foil) do dokładnie takiej samej pozycji
   * (to samo wydanie, foil, stan, język, klaser) albo tworzy nową. Karta różniąca się
   * czymkolwiek nigdy nie łączy się z inną pozycją.
   */
  const addCopies = useCallback(async (data: CardSaveInput, foil: boolean, qty: number): Promise<CollectionItem | null> => {
    const key = entryKeyOf({ ...data, cardId: data.card.id }, foil);
    const match = collectionRef.current.find((c) => matchesEntry(c, key));
    if (match) {
      const res = await collectionApi.update(match.id, {
        quantity: (match.quantity || 0) + (foil ? 0 : qty),
        quantityFoil: (match.quantityFoil || 0) + (foil ? qty : 0),
      }, onUnauthorized);
      if (!res.ok) return null;
      const updated: CollectionItem = await res.json();
      collectionRef.current = collectionRef.current.map((c) => (c.id === updated.id ? updated : c));
      setCollection((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      return updated;
    }
    const res = await collectionApi.create({
      cardId: data.card.id,
      ...data,
      binder: key.binder,
      quantity: foil ? 0 : qty,
      quantityFoil: foil ? qty : 0,
    }, onUnauthorized);
    if (!res.ok) return null;
    const created: CollectionItem = await res.json();
    collectionRef.current = [created, ...collectionRef.current];
    setCollection((prev) => [created, ...prev]);
    return created;
  }, [onUnauthorized]);

  const saveToCollection = useCallback(async (
    data: CardSaveInput,
    existingItem?: CollectionItem | null
  ): Promise<CollectionItem | null> => {
    try {
      const label = `${data.card.name} [${data.card.set.toUpperCase()}] #${data.card.collector_number}`;

      if (existingItem) {
        // Edycja wskazanej pozycji. Gdy w formularzu pojawią się sztuki drugiej wersji
        // (np. foil przy zwykłej karcie), trafiają do osobnej pozycji.
        const itemIsFoil = (existingItem.quantityFoil || 0) > 0 && (existingItem.quantity || 0) === 0;
        const normal = Math.max(0, data.quantity || 0);
        const foil = Math.max(0, data.quantityFoil || 0);
        const both = normal > 0 && foil > 0;
        const ownPart = both
          ? { ...data, quantity: itemIsFoil ? 0 : normal, quantityFoil: itemIsFoil ? foil : 0 }
          : data;

        const res = await collectionApi.update(existingItem.id, { cardId: data.card.id, ...ownPart }, onUnauthorized);
        if (!res.ok) return null;
        const updated: CollectionItem = await res.json();
        collectionRef.current = collectionRef.current.map((c) => (c.id === updated.id ? updated : c));
        setCollection((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

        if (both) {
          const otherIsFoil = !itemIsFoil;
          const other = await addCopies(data, otherIsFoil, otherIsFoil ? foil : normal);
          showToast(other
            ? `Zapisano "${label}". Sztuki ${otherIsFoil ? 'foil' : 'zwykłe'} są osobną pozycją w kolekcji.`
            : 'Nie udało się zapisać wszystkich sztuk. Spróbuj ponownie.');
        } else {
          showToast(`Zapisano "${label}"`);
        }
        return updated;
      }

      // Dodawanie: zwykłe i foil to osobne pozycje, a sztuki łączą się tylko z identyczną kartą
      const parts = splitByFinish(data);
      let first: CollectionItem | null = null;
      let added = 0;
      for (const { foil, qty } of parts) {
        const saved = await addCopies(data, foil, qty);
        if (!saved) continue;
        first = first || saved;
        added += qty;
      }
      if (!first) {
        showToast('Nie udało się dodać karty do kolekcji. Spróbuj ponownie.');
        return null;
      }
      showToast(`Dodano ${added} szt. "${label}" do kolekcji`);
      return first;
    } catch (err) {
      console.error('Failed to save card:', err);
    }
    return null;
  }, [addCopies, onUnauthorized, showToast]);

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

    return saveToCollection({
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
    const res = await catalogsApi.update(id, updates, onUnauthorized);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Nie udało się zapisać katalogu.');
    }
    const updated: Catalog = await res.json();
    setCatalogs(prev => prev.map(c => c.id === id ? updated : (updated.isDefault ? { ...c, isDefault: false } : c)));
    // Odznaczenie domyślnego: serwer przenosi to oznaczenie na główny klaser
    const catRes = await catalogsApi.getAll(onUnauthorized);
    if (catRes.ok) setCatalogs(await catRes.json());

    const colRes = await collectionApi.getAll(onUnauthorized);
    if (colRes.ok) setCollection(await colRes.json());
    showToast(`Zaktualizowano katalog "${updated.name}"`);
  }, [onUnauthorized, showToast]);

  /** Usuwa karty katalogu z kolekcji (poza wystawionymi na sprzedaż); katalog zostaje. */
  const emptyCatalog = useCallback(async (id: string) => {
    const name = catalogs.find(c => c.id === id)?.name || 'katalog';
    const res = await catalogsApi.empty(id, onUnauthorized);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Nie udało się opróżnić katalogu.');
      return;
    }
    const data = await res.json();
    const colRes = await collectionApi.getAll(onUnauthorized);
    if (colRes.ok) setCollection(await colRes.json());
    showToast(data.deletedItems > 0
      ? `Opróżniono „${name}”: usunięto ${data.deletedItems} poz. z kolekcji`
      : `„${name}” był już pusty`);
  }, [catalogs, onUnauthorized, showToast]);

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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Nie udało się usunąć katalogu.');
        return;
      }
      const data = await res.json();
      if (data.catalogs) {
        setCatalogs(data.catalogs);
      } else {
        setCatalogs(prev => prev.filter(c => c.id !== id));
      }
      const colRes = await collectionApi.getAll(onUnauthorized);
      if (colRes.ok) setCollection(await colRes.json());
      showToast(`Usunięto katalog. Jego karty są teraz w: ${data.reassignedTo}`);
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

  /**
   * Dodaje wiele kart naraz. Duże listy idą paczkami po 250 (serwer scala je z istniejącymi pozycjami),
   * a `onProgress` dostaje liczbę zapisanych pozycji, żeby można było pokazać pasek postępu.
   */
  const bulkAddToCollection = useCallback(async (items: any[], onProgress?: (done: number, total: number) => void) => {
    const CHUNK = 250;
    let ok = true;
    try {
      onProgress?.(0, items.length);
      for (let i = 0; i < items.length; i += CHUNK) {
        const res = await collectionApi.bulkAdd(items.slice(i, i + CHUNK), onUnauthorized);
        if (!res.ok) {
          ok = false;
          break;
        }
        onProgress?.(Math.min(i + CHUNK, items.length), items.length);
      }
      // Kolekcję odświeżamy raz, na końcu (także po częściowym błędzie, żeby pokazać to, co się zapisało)
      const colRes = await collectionApi.getAll(onUnauthorized);
      if (colRes.ok) setCollection(await colRes.json());
      return ok;
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
  };
}
