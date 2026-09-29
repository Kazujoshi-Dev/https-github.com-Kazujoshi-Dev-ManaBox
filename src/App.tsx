import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CollectionItem, WishlistItem, ScryfallCard, CardCondition, CardLanguage, AppSettings, Catalog, AuthUser, DeckItem } from './types';
import { Header } from './components/Header';
import { CollectionList } from './components/CollectionList';
import { CardSearch } from './components/CardSearch';
import { Analytics } from './components/Analytics';
import { Wishlist } from './components/Wishlist';
import { CardModal } from './components/CardModal';
import { SettingsModal } from './components/SettingsModal';
import { SetTopCards } from './components/SetTopCards';
import { AuthView } from './components/AuthView';
import { DeckBuilder } from './components/DeckBuilder';
import { DeckCreateModal } from './components/DeckCreateModal';
import { getCardPrice, DEFAULT_SETTINGS, formatCurrency } from './utils/formatters';
import { Sparkles, Check, AlertCircle, Swords, Crown, Plus, Trash2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('mtg_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<'collection' | 'decks' | 'search' | 'set-top' | 'analytics' | 'wishlist'>('collection');
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckItem | null>(null);
  const [isDeckCreateModalOpen, setIsDeckCreateModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState<boolean>(false);
  
  // App Settings state
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('mtg_app_settings');
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
    return DEFAULT_SETTINGS;
  });

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Modal states
  const [selectedCardForModal, setSelectedCardForModal] = useState<ScryfallCard | null>(null);
  const [selectedCollectionItemForModal, setSelectedCollectionItemForModal] = useState<CollectionItem | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Helper for authenticated requests
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = localStorage.getItem('mtg_auth_token');
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('mtg_auth_token');
      localStorage.removeItem('mtg_auth_user');
      setCurrentUser(null);
    }
    return res;
  }, []);

  const handleAuthSuccess = (user: AuthUser, token: string) => {
    localStorage.setItem('mtg_auth_token', token);
    localStorage.setItem('mtg_auth_user', JSON.stringify(user));
    setCurrentUser(user);
    showToast(`Witaj w kolekcji, ${user.username}!`);
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('mtg_auth_token');
    localStorage.removeItem('mtg_auth_user');
    setCurrentUser(null);
    setCollection([]);
    setWishlist([]);
    setCatalogs([]);
    setDecks([]);
    setSelectedDeck(null);
    showToast('Pomyślnie wylogowano z konta.');
  };

  // Optional: Auto fetch NBP exchange rates on app start if enabled
  useEffect(() => {
    if (settings.autoNbpRate) {
      Promise.all([
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json').then(res => res.json()).catch(() => null),
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json').then(res => res.json()).catch(() => null)
      ]).then(([eurData, usdData]) => {
        let eur = settings.eurToPlnRate;
        let usd = settings.usdToPlnRate;
        let updated = false;

        if (eurData?.rates?.[0]?.mid) {
          eur = eurData.rates[0].mid;
          updated = true;
        }
        if (usdData?.rates?.[0]?.mid) {
          usd = usdData.rates[0].mid;
          updated = true;
        }

        if (updated) {
          const newSettings: AppSettings = {
            ...settings,
            eurToPlnRate: eur,
            usdToPlnRate: usd,
            lastNbpUpdate: new Date().toISOString()
          };
          setSettings(newSettings);
          localStorage.setItem('mtg_app_settings', JSON.stringify(newSettings));
        }
      });
    }
  }, []);

  // Fetch initial data for logged in user
  useEffect(() => {
    async function loadData() {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // Verify token validity first
        const meRes = await fetchWithAuth('/api/auth/me');
        if (!meRes.ok) {
          setIsLoading(false);
          return;
        }

        const [colRes, wishRes, catRes, setRes, deckRes] = await Promise.all([
          fetchWithAuth('/api/collection'),
          fetchWithAuth('/api/wishlist'),
          fetchWithAuth('/api/catalogs'),
          fetchWithAuth('/api/settings'),
          fetchWithAuth('/api/decks')
        ]);

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
            setSettings(prev => ({ ...prev, ...remoteSettings }));
          }
        }
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [currentUser, fetchWithAuth]);

  // Compute Total Stats
  const totals = useMemo(() => {
    let totalCards = 0;
    let totalValue = 0;
    let totalPurchaseCost = 0;

    collection.forEach(item => {
      const card = item.card;
      if (!card) return;

      const qty = item.quantity + item.quantityFoil;
      totalCards += qty;

      const normPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);

      totalValue += (item.quantity * normPrice) + (item.quantityFoil * foilPrice);

      if (item.purchasePrice) {
        totalPurchaseCost += item.purchasePrice * qty;
      }
    });

    return { totalCards, totalValue, totalPurchaseCost };
  }, [collection, settings]);

  // Update Quantity Handler
  const handleUpdateQuantity = async (id: string, deltaNormal: number, deltaFoil: number) => {
    const item = collection.find(c => c.id === id);
    if (!item) return;

    const newQtyNormal = Math.max(0, item.quantity + deltaNormal);
    const newQtyFoil = Math.max(0, item.quantityFoil + deltaFoil);

    if (newQtyNormal === 0 && newQtyFoil === 0) {
      handleDeleteItem(id);
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/collection/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQtyNormal, quantityFoil: newQtyFoil })
      });

      if (res.ok) {
        const updated = await res.json();
        setCollection(prev => prev.map(c => c.id === id ? updated : c));
      }
    } catch (err) {
      console.error('Failed to update quantity:', err);
    }
  };

  // Delete Item Handler
  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/collection/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCollection(prev => prev.filter(c => c.id !== id));
        showToast('Usunięto kartę z kolekcji');
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  // Save/Add Item to Collection
  const handleSaveToCollection = async (data: {
    card: ScryfallCard;
    quantity: number;
    quantityFoil: number;
    condition: CardCondition;
    language: CardLanguage;
    purchasePrice?: number | null;
    notes?: string;
    binder?: string;
  }) => {
    try {
      if (selectedCollectionItemForModal) {
        // Edit existing
        const res = await fetchWithAuth(`/api/collection/${selectedCollectionItemForModal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: data.card.id,
            ...data
          })
        });
        if (res.ok) {
          const updated = await res.json();
          setCollection(prev => prev.map(c => c.id === updated.id ? updated : c));
          setSelectedCollectionItemForModal(updated);
          setSelectedCardForModal(updated.card);
          showToast(`Zapisano wersję "${data.card.name}" [${data.card.set.toUpperCase()}] #${data.card.collector_number}`);
        }
      } else {
        // Create new entry
        const res = await fetchWithAuth('/api/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: data.card.id,
            ...data
          })
        });
        if (res.ok) {
          const newItem = await res.json();
          setCollection(prev => [newItem, ...prev]);
          showToast(`Dodano "${data.card.name}" do kolekcji!`);
        }
      }
    } catch (err) {
      console.error('Failed to save card:', err);
    }
  };

  // Add to Wishlist
  const handleAddToWishlist = async (card: ScryfallCard) => {
    try {
      const res = await fetchWithAuth('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          card,
          targetQuantity: 1,
          isFoil: false
        })
      });

      if (res.ok) {
        const newItem = await res.json();
        setWishlist(prev => [newItem, ...prev]);
        showToast(`Dodano "${card.name}" do Listy Życzeń!`);
      }
    } catch (err) {
      console.error('Failed to add to wishlist:', err);
    }
  };

  // Quick Add to Collection directly
  const handleQuickAddToCollection = (card: ScryfallCard) => {
    const defaultBinder = (catalogs && catalogs.length > 0) ? (catalogs.find(c => c.isDefault)?.name || catalogs[0].name) : 'Klaser Główny';
    handleSaveToCollection({
      card,
      quantity: 1,
      quantityFoil: 0,
      condition: 'NM',
      language: 'EN',
      binder: defaultBinder,
      purchasePrice: null
    });
  };

  // Catalog Management Handlers
  const handleCreateCatalog = async (name: string, description?: string, color?: string, isDefault?: boolean): Promise<Catalog | null> => {
    try {
      const res = await fetchWithAuth('/api/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, color, isDefault })
      });
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
  };

  const handleUpdateCatalog = async (id: string, updates: Partial<Catalog>) => {
    try {
      const res = await fetchWithAuth(`/api/catalogs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.isDefault) {
          setCatalogs(prev => prev.map(c => c.id === id ? updated : { ...c, isDefault: false }));
        } else {
          setCatalogs(prev => prev.map(c => c.id === id ? updated : c));
        }
        // Reload collection to sync any cards renamed
        const colRes = await fetchWithAuth('/api/collection');
        if (colRes.ok) setCollection(await colRes.json());
        showToast(`Zaktualizowano katalog "${updated.name}"`);
      }
    } catch (err) {
      console.error('Failed to update catalog:', err);
    }
  };

  const handleSetDefaultCatalog = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/catalogs/${id}/set-default`, { method: 'POST' });
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
        showToast(`Oznaczono "${target?.name || 'Katalog'}" jako domyślny ⭐`);
      }
    } catch (err) {
      console.error('Failed to set default catalog:', err);
    }
  };

  const handleDeleteCatalog = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/catalogs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.catalogs) {
          setCatalogs(data.catalogs);
        } else {
          setCatalogs(prev => prev.filter(c => c.id !== id));
        }
        // Reload collection since cards were reassigned
        const colRes = await fetchWithAuth('/api/collection');
        if (colRes.ok) setCollection(await colRes.json());
        showToast(`Usunięto katalog. Karty przypisano do: ${data.reassignedTo}`);
      }
    } catch (err) {
      console.error('Failed to delete catalog:', err);
    }
  };

  // Remove from Wishlist
  const handleRemoveFromWishlist = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/wishlist/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWishlist(prev => prev.filter(w => w.id !== id));
        showToast('Usunięto z Listy Życzeń');
      }
    } catch (err) {
      console.error('Failed to remove from wishlist:', err);
    }
  };

  // Move from Wishlist to Collection
  const handleMoveWishlistToCollection = (wishlistItem: WishlistItem) => {
    setSelectedCardForModal(wishlistItem.card);
    setSelectedCollectionItemForModal(null);
    handleRemoveFromWishlist(wishlistItem.id);
  };

  // Deck Management Handlers (Defaults to EDH Commander)
  const handleCreateDeck = async (data: {
    name: string;
    format: string;
    description: string;
    cardSource?: 'all' | 'collection';
    commander?: ScryfallCard | null;
  }) => {
    try {
      const res = await fetchWithAuth('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const newDeck: DeckItem = await res.json();
        setDecks(prev => [newDeck, ...prev]);
        setSelectedDeck(newDeck);
        setActiveTab('decks');
        showToast(`Utworzono talię "${newDeck.name}" [${newDeck.format || 'EDH Commander'}]!`);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Nie udało się utworzyć talii.');
      }
    } catch (err: any) {
      showToast(err.message || 'Błąd tworzenia talii.');
      throw err;
    }
  };

  const handleUpdateDeck = async (updated: DeckItem) => {
    setSelectedDeck(updated);
    setDecks(prev => prev.map(d => d.id === updated.id ? updated : d));
    try {
      await fetchWithAuth(`/api/decks/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Failed to update deck:', err);
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    try {
      const res = await fetchWithAuth(`/api/decks/${deckId}`, { method: 'DELETE' });
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== deckId));
        if (selectedDeck?.id === deckId) {
          setSelectedDeck(null);
        }
        showToast('Usunięto talię.');
      }
    } catch (err) {
      console.error('Failed to delete deck:', err);
    }
  };


  // Refresh Prices Batch
  const handleRefreshPrices = async () => {
    try {
      setIsRefreshingPrices(true);
      const res = await fetchWithAuth('/api/collection/refresh-prices', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.collection) {
          setCollection(data.collection);
          showToast(`Zaktualizowano ceny dla ${data.updatedCount} kart z Scryfall API!`);
        }
      }
    } catch (err) {
      console.error('Failed to refresh prices:', err);
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  // Export Collection JSON
  const handleExportCollection = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(collection, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mana-screw-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Pobrano plik z kopią zapasową kolekcji');
  };

  // Import Collection JSON
  const handleImportCollection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          const res = await fetchWithAuth('/api/collection/bulk-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importedData)
          });
          if (res.ok) {
            const colRes = await fetchWithAuth('/api/collection');
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
  };

  // If not authenticated, display clean login / registration screen
  if (!currentUser) {
    return (
      <>
        <AuthView onAuthSuccess={handleAuthSuccess} />
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-bounce">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-500 selection:text-stone-950 pb-16">
      
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalCards={totals.totalCards}
        totalValue={totals.totalValue}
        totalPurchaseCost={totals.totalPurchaseCost}
        settings={settings}
        decksCount={decks.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshPrices={handleRefreshPrices}
        isRefreshing={isRefreshingPrices}
        onOpenAddModal={() => setActiveTab('search')}
        onExportCollection={handleExportCollection}
        onImportCollection={handleImportCollection}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <p className="text-sm font-bold text-stone-400">Ładowanie Twojej kolekcji i wycen rynkowych...</p>
          </div>
        ) : (
          <>
            {activeTab === 'collection' && (
              <CollectionList
                collection={collection}
                settings={settings}
                catalogs={catalogs}
                decks={decks}
                onCreateCatalog={handleCreateCatalog}
                onUpdateCatalog={handleUpdateCatalog}
                onDeleteCatalog={handleDeleteCatalog}
                onSetDefaultCatalog={handleSetDefaultCatalog}
                onOpenCreateDeckModal={() => setIsDeckCreateModalOpen(true)}
                onSelectDeck={(deck) => {
                  setSelectedDeck(deck);
                  setActiveTab('decks');
                }}
                onUpdateQuantity={handleUpdateQuantity}
                onDeleteItem={handleDeleteItem}
                onEditItem={(item) => {
                  setSelectedCardForModal(item.card);
                  setSelectedCollectionItemForModal(item);
                }}
                onViewCardDetails={(item) => {
                  setSelectedCardForModal(item.card);
                  setSelectedCollectionItemForModal(item);
                }}
                onOpenAddModal={() => setActiveTab('search')}
              />
            )}

            {activeTab === 'decks' && (
              selectedDeck ? (
                <DeckBuilder
                  deck={selectedDeck}
                  collection={collection}
                  settings={settings}
                  onUpdateDeck={handleUpdateDeck}
                  onBack={() => setSelectedDeck(null)}
                  onViewCardDetails={(card) => {
                    setSelectedCardForModal(card);
                    setSelectedCollectionItemForModal(null);
                  }}
                />
              ) : (
                <div className="space-y-6">
                  {/* Decks Header Banner */}
                  <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                          <Swords className="w-5 h-5 text-purple-300" />
                        </div>
                        <div>
                          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                            Twoje Talie (Format EDH Commander)
                          </h2>
                          <p className="text-xs text-stone-400">
                            Twórz talie 100-kartowe, stakuj karty według typów i zarządzaj dowódcą.
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsDeckCreateModalOpen(true)}
                      className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Utwórz nową talię EDH Commander</span>
                    </button>
                  </div>

                  {/* Decks Grid */}
                  {decks.length === 0 ? (
                    <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-purple-950/50 border border-purple-800/40 text-purple-400 mx-auto flex items-center justify-center">
                        <Swords className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Nie masz jeszcze żadnych talii</h3>
                        <p className="text-xs text-stone-400 max-w-sm mx-auto mt-1">
                          Kliknij przycisk poniżej, aby utworzyć swoją pierwszą 100-kartową talię w formacie EDH Commander.
                        </p>
                      </div>
                      <button
                        onClick={() => setIsDeckCreateModalOpen(true)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Utwórz nową talię</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {decks.map(deck => {
                        const count = (deck.commander ? 1 : 0) + (deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0);
                        let deckVal = 0;
                        if (deck.commander) deckVal += getCardPrice(deck.commander, false, settings);
                        deck.cards?.forEach(c => {
                          deckVal += getCardPrice(c.card, false, settings) * c.quantity;
                        });

                        return (
                          <div
                            key={deck.id}
                            onClick={() => setSelectedDeck(deck)}
                            className="group bg-stone-900 border border-stone-800 hover:border-purple-500/50 rounded-2xl p-5 shadow-xl transition-all cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden"
                          >
                            {/* Subtle commander art background glow if present */}
                            {deck.commander && (
                              <div
                                className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none group-hover:opacity-25 transition-opacity"
                                style={{
                                  backgroundImage: `url(${deck.commander.image_uris?.art_crop || deck.commander.image_uris?.normal || ''})`
                                }}
                              />
                            )}

                            <div className="relative z-10 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      {deck.format || 'EDH Commander'}
                                    </span>
                                  </div>
                                  <h3 className="text-lg font-black text-white group-hover:text-purple-200 transition-colors">
                                    {deck.name}
                                  </h3>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDeck(deck.id);
                                  }}
                                  className="text-stone-500 hover:text-rose-400 p-1 rounded-lg hover:bg-stone-800 transition-colors"
                                  title="Usuń talię"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              {deck.description && (
                                <p className="text-xs text-stone-400 line-clamp-2">
                                  {deck.description}
                                </p>
                              )}

                              {/* Commander Info if selected */}
                              {deck.commander ? (
                                <div className="flex items-center gap-2.5 p-2 bg-stone-950/80 rounded-xl border border-amber-500/30">
                                  <div className="w-8 h-10 rounded overflow-hidden border border-amber-500/40 shrink-0">
                                    <img
                                      src={deck.commander.image_uris?.art_crop || deck.commander.image_uris?.small}
                                      alt={deck.commander.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[10px] text-amber-400 font-bold block">
                                      👑 {deck.commander.name}
                                    </span>
                                    <span className="text-[10px] text-stone-400 truncate block">
                                      {deck.commander.type_line}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 bg-stone-950/50 rounded-xl border border-dashed border-stone-800 text-[11px] text-stone-500 flex items-center gap-1.5">
                                  <Crown className="w-3.5 h-3.5 text-stone-600" />
                                  <span>Brak wybranego dowódcy</span>
                                </div>
                              )}
                            </div>

                            <div className="relative z-10 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                  count === 100
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : count > 100
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}>
                                  {count} / 100 kart
                                </span>
                              </div>

                              <span className="font-mono font-bold text-amber-300">
                                {formatCurrency(deckVal, settings.currency)}
                              </span>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            )}

            {activeTab === 'search' && (
              <CardSearch
                settings={settings}
                onSelectCard={(card) => {
                  setSelectedCardForModal(card);
                  setSelectedCollectionItemForModal(null);
                }}
              />
            )}

            {activeTab === 'set-top' && (
              <SetTopCards
                settings={settings}
                onSelectCard={(card) => {
                  setSelectedCardForModal(card);
                  setSelectedCollectionItemForModal(null);
                }}
                onAddToCollection={handleQuickAddToCollection}
                onAddToWishlist={handleAddToWishlist}
              />
            )}

            {activeTab === 'analytics' && (
              <Analytics
                collection={collection}
                settings={settings}
                onViewCardDetails={(item) => {
                  setSelectedCardForModal(item.card);
                  setSelectedCollectionItemForModal(item);
                }}
              />
            )}

            {activeTab === 'wishlist' && (
              <Wishlist
                wishlist={wishlist}
                settings={settings}
                onRemoveFromWishlist={handleRemoveFromWishlist}
                onMoveToCollection={handleMoveWishlistToCollection}
                onOpenSearchTab={() => setActiveTab('search')}
                onViewCardDetails={(card) => {
                  setSelectedCardForModal(card);
                  setSelectedCollectionItemForModal(null);
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={async (newSettings) => {
            setSettings(newSettings);
            localStorage.setItem('mtg_app_settings', JSON.stringify(newSettings));
            try {
              await fetchWithAuth('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
              });
            } catch (err) {
              console.warn('Failed to save settings remotely:', err);
            }
            showToast('Zapisano nowe ustawienia wyceny i waluty!');
          }}
        />
      )}

      {/* Card Detail & Add/Edit Modal */}
      {selectedCardForModal && (
        <CardModal
          card={selectedCardForModal}
          existingItem={selectedCollectionItemForModal}
          settings={settings}
          catalogs={catalogs}
          onCreateCatalog={handleCreateCatalog}
          onClose={() => {
            setSelectedCardForModal(null);
            setSelectedCollectionItemForModal(null);
          }}
          onSaveToCollection={handleSaveToCollection}
          onAddToWishlist={handleAddToWishlist}
        />
      )}

      {/* Deck Create Modal */}
      {isDeckCreateModalOpen && (
        <DeckCreateModal
          isOpen={isDeckCreateModalOpen}
          collection={collection}
          onClose={() => setIsDeckCreateModalOpen(false)}
          onCreateDeck={handleCreateDeck}
        />
      )}

      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
