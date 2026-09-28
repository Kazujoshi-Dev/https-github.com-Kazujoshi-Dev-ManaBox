import React, { useState, useEffect, useMemo } from 'react';
import { CollectionItem, WishlistItem, ScryfallCard, CardCondition, CardLanguage, AppSettings, Catalog } from './types';
import { Header } from './components/Header';
import { CollectionList } from './components/CollectionList';
import { CardSearch } from './components/CardSearch';
import { Analytics } from './components/Analytics';
import { Wishlist } from './components/Wishlist';
import { CardModal } from './components/CardModal';
import { SettingsModal } from './components/SettingsModal';
import { SetTopCards } from './components/SetTopCards';
import { getCardPrice, DEFAULT_SETTINGS } from './utils/formatters';
import { Sparkles, Check, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'collection' | 'search' | 'set-top' | 'analytics' | 'wishlist'>('collection');
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
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

  // Fetch initial data from server
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [colRes, wishRes, catRes] = await Promise.all([
          fetch('/api/collection'),
          fetch('/api/wishlist'),
          fetch('/api/catalogs')
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
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

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
      const res = await fetch(`/api/collection/${id}`, {
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
      const res = await fetch(`/api/collection/${id}`, { method: 'DELETE' });
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
        const res = await fetch(`/api/collection/${selectedCollectionItemForModal.id}`, {
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
        const res = await fetch('/api/collection', {
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
      const res = await fetch('/api/wishlist', {
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
      const res = await fetch('/api/catalogs', {
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
      const res = await fetch(`/api/catalogs/${id}`, {
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
        const colRes = await fetch('/api/collection');
        if (colRes.ok) setCollection(await colRes.json());
        showToast(`Zaktualizowano katalog "${updated.name}"`);
      }
    } catch (err) {
      console.error('Failed to update catalog:', err);
    }
  };

  const handleSetDefaultCatalog = async (id: string) => {
    try {
      const res = await fetch(`/api/catalogs/${id}/set-default`, { method: 'POST' });
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
      const res = await fetch(`/api/catalogs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.catalogs) {
          setCatalogs(data.catalogs);
        } else {
          setCatalogs(prev => prev.filter(c => c.id !== id));
        }
        // Reload collection since cards were reassigned
        const colRes = await fetch('/api/collection');
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
      const res = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
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

  // Refresh Prices Batch
  const handleRefreshPrices = async () => {
    try {
      setIsRefreshingPrices(true);
      const res = await fetch('/api/collection/refresh-prices', { method: 'POST' });
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
    downloadAnchor.setAttribute("download", `kolekcja-mtg-${new Date().toISOString().slice(0, 10)}.json`);
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
          // Replace server collection with imported array
          for (const item of importedData) {
            await fetch('/api/collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item)
            });
          }
          // Reload
          const colRes = await fetch('/api/collection');
          if (colRes.ok) {
            setCollection(await colRes.json());
            showToast('Pomyślnie zaimportowano kolekcję!');
          }
        }
      } catch (err) {
        alert('Nieprawidłowy format pliku JSON');
      }
    };
    reader.readAsText(file);
  };

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
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshPrices={handleRefreshPrices}
        isRefreshing={isRefreshingPrices}
        onOpenAddModal={() => setActiveTab('search')}
        onExportCollection={handleExportCollection}
        onImportCollection={handleImportCollection}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <p className="text-sm font-bold text-stone-400">Ładowanie kolekcji i cen ze Scryfall API...</p>
          </div>
        ) : (
          <>
            {activeTab === 'collection' && (
              <CollectionList
                collection={collection}
                settings={settings}
                catalogs={catalogs}
                onCreateCatalog={handleCreateCatalog}
                onUpdateCatalog={handleUpdateCatalog}
                onDeleteCatalog={handleDeleteCatalog}
                onSetDefaultCatalog={handleSetDefaultCatalog}
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
          onSaveSettings={(newSettings) => {
            setSettings(newSettings);
            localStorage.setItem('mtg_app_settings', JSON.stringify(newSettings));
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
