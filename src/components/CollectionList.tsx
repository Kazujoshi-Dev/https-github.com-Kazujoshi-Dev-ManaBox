import React, { useState, useMemo } from 'react';
import { CollectionItem, FilterOptions, AppSettings, Catalog, DeckItem } from '../types';
import { CardItem } from './CardItem';
import { formatCurrency, getCardPrice } from '../utils/formatters';
import { 
  Search, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  Plus, 
  Sparkles, 
  X,
  FolderOpen,
  Folder,
  FolderPlus,
  Edit2,
  Trash2,
  Check,
  ChevronRight,
  Info,
  Star,
  Swords,
  Crown
} from 'lucide-react';

interface CollectionListProps {
  collection: CollectionItem[];
  settings: AppSettings;
  catalogs?: Catalog[];
  decks?: DeckItem[];
  onCreateCatalog?: (name: string, description?: string, color?: string, isDefault?: boolean) => Promise<Catalog | null>;
  onUpdateCatalog?: (id: string, updates: Partial<Catalog>) => Promise<void>;
  onDeleteCatalog?: (id: string) => Promise<void>;
  onSetDefaultCatalog?: (id: string) => Promise<void>;
  onOpenCreateDeckModal?: () => void;
  onSelectDeck?: (deck: DeckItem) => void;
  onUpdateQuantity: (id: string, deltaNormal: number, deltaFoil: number) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: CollectionItem) => void;
  onViewCardDetails: (item: CollectionItem) => void;
  onOpenAddModal: () => void;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string; lightBg: string }> = {
  amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', dot: 'bg-amber-400', lightBg: 'bg-amber-500/10' },
  emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-400', lightBg: 'bg-emerald-500/10' },
  blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400', lightBg: 'bg-blue-500/10' },
  purple: { bg: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400', lightBg: 'bg-purple-500/10' },
  rose: { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-400', dot: 'bg-rose-400', lightBg: 'bg-rose-500/10' },
  cyan: { bg: 'bg-cyan-500/15', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-400', lightBg: 'bg-cyan-500/10' },
  orange: { bg: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400', lightBg: 'bg-orange-500/10' },
  stone: { bg: 'bg-stone-500/15', border: 'border-stone-500/40', text: 'text-stone-300', dot: 'bg-stone-400', lightBg: 'bg-stone-500/10' },
};

export const CollectionList: React.FC<CollectionListProps> = ({
  collection,
  settings,
  catalogs = [],
  decks = [],
  onCreateCatalog,
  onUpdateCatalog,
  onDeleteCatalog,
  onSetDefaultCatalog,
  onOpenCreateDeckModal,
  onSelectDeck,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onOpenAddModal
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: '',
    color: 'ALL',
    type: 'ALL',
    rarity: 'ALL',
    set: 'ALL',
    binder: 'ALL',
    sortBy: 'price_desc',
    onlyFoil: false
  });

  // Catalog modal state (create or edit)
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState<boolean>(false);
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [modalCatName, setModalCatName] = useState<string>('');
  const [modalCatDesc, setModalCatDesc] = useState<string>('');
  const [modalCatColor, setModalCatColor] = useState<string>('amber');
  const [modalCatIsDefault, setModalCatIsDefault] = useState<boolean>(false);
  const [catalogModalError, setCatalogModalError] = useState<string | null>(null);
  const [isCatalogSaving, setIsCatalogSaving] = useState<boolean>(false);

  // Delete catalog confirmation
  const [catalogToDelete, setCatalogToDelete] = useState<Catalog | null>(null);

  // Compute catalog stats (counts and total values)
  const catalogStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalCards: number; totalValue: number }>();
    
    collection.forEach(item => {
      const card = item.card;
      if (!card) return;
      const b = item.binder || 'Klaser Główny';
      const existing = stats.get(b) || { count: 0, totalCards: 0, totalValue: 0 };

      const qty = item.quantity + item.quantityFoil;
      const normPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);
      const val = (item.quantity * normPrice) + (item.quantityFoil * foilPrice);

      existing.count += 1;
      existing.totalCards += qty;
      existing.totalValue += val;
      stats.set(b, existing);
    });

    return stats;
  }, [collection, settings]);

  // Unique sets list for dropdown
  const sets = useMemo(() => {
    const list = new Map<string, string>(); // code -> name
    collection.forEach(item => {
      if (item.card && item.card.set) {
        list.set(item.card.set, item.card.set_name || item.card.set.toUpperCase());
      }
    });
    return Array.from(list.entries());
  }, [collection]);

  // Filter & Sort Logic
  const filteredCollection = useMemo(() => {
    return collection.filter(item => {
      const card = item.card;
      if (!card) return false;

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchName = card.name.toLowerCase().includes(query);
        const matchType = card.type_line?.toLowerCase().includes(query);
        const matchSet = card.set_name?.toLowerCase().includes(query) || card.set.toLowerCase().includes(query);
        const matchNotes = item.notes?.toLowerCase().includes(query);
        if (!matchName && !matchType && !matchSet && !matchNotes) return false;
      }

      // Color filter
      if (filters.color !== 'ALL') {
        const colors = card.colors || [];
        if (filters.color === 'MULTI' && colors.length < 2) return false;
        if (filters.color === 'C' && colors.length > 0) return false;
        if (['W', 'U', 'B', 'R', 'G'].includes(filters.color) && !colors.includes(filters.color)) return false;
      }

      // Type filter
      if (filters.type !== 'ALL') {
        if (!card.type_line?.toLowerCase().includes(filters.type.toLowerCase())) return false;
      }

      // Rarity filter
      if (filters.rarity !== 'ALL') {
        if (card.rarity.toLowerCase() !== filters.rarity.toLowerCase()) return false;
      }

      // Set filter
      if (filters.set !== 'ALL') {
        if (card.set.toLowerCase() !== filters.set.toLowerCase()) return false;
      }

      // Binder filter
      if (filters.binder !== 'ALL') {
        if (item.binder !== filters.binder) return false;
      }

      // Only Foil filter
      if (filters.onlyFoil && item.quantityFoil <= 0) return false;

      return true;
    }).sort((a, b) => {
      const cardA = a.card;
      const cardB = b.card;
      
      const priceA = (a.quantity * getCardPrice(cardA, false, settings)) + (a.quantityFoil * getCardPrice(cardA, true, settings));
      const priceB = (b.quantity * getCardPrice(cardB, false, settings)) + (b.quantityFoil * getCardPrice(cardB, true, settings));

      switch (filters.sortBy) {
        case 'price_desc':
          return priceB - priceA;
        case 'price_asc':
          return priceA - priceB;
        case 'name':
          return cardA.name.localeCompare(cardB.name);
        case 'cmc_desc':
          return (cardB.cmc || 0) - (cardA.cmc || 0);
        case 'cmc_asc':
          return (cardA.cmc || 0) - (cardB.cmc || 0);
        case 'added_desc':
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
        default:
          return 0;
      }
    });
  }, [collection, filters, settings]);

  // Subtotal metrics for filtered results
  const filteredMetrics = useMemo(() => {
    let cardsCount = 0;
    let totalValue = 0;

    filteredCollection.forEach(item => {
      const card = item.card;
      const normalPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);
      
      cardsCount += item.quantity + item.quantityFoil;
      totalValue += (item.quantity * normalPrice) + (item.quantityFoil * foilPrice);
    });

    return { cardsCount, totalValue };
  }, [filteredCollection, settings]);

  const handleResetFilters = () => {
    setFilters({
      searchQuery: '',
      color: 'ALL',
      type: 'ALL',
      rarity: 'ALL',
      set: 'ALL',
      binder: 'ALL',
      sortBy: 'price_desc',
      onlyFoil: false
    });
  };

  const openCreateCatalogModal = () => {
    setEditingCatalog(null);
    setModalCatName('');
    setModalCatDesc('');
    setModalCatColor('amber');
    setModalCatIsDefault(catalogs.length === 0);
    setCatalogModalError(null);
    setIsCatalogModalOpen(true);
  };

  const openEditCatalogModal = (cat: Catalog, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCatalog(cat);
    setModalCatName(cat.name);
    setModalCatDesc(cat.description || '');
    setModalCatColor(cat.color || 'amber');
    setModalCatIsDefault(Boolean(cat.isDefault));
    setCatalogModalError(null);
    setIsCatalogModalOpen(true);
  };

  const handleSaveCatalogModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCatName.trim()) {
      setCatalogModalError('Nazwa katalogu jest wymagana');
      return;
    }

    setIsCatalogSaving(true);
    setCatalogModalError(null);

    try {
      if (editingCatalog && onUpdateCatalog) {
        await onUpdateCatalog(editingCatalog.id, {
          name: modalCatName.trim(),
          description: modalCatDesc.trim(),
          color: modalCatColor,
          isDefault: modalCatIsDefault
        });
        if (filters.binder === editingCatalog.name) {
          setFilters(prev => ({ ...prev, binder: modalCatName.trim() }));
        }
      } else if (onCreateCatalog) {
        const created = await onCreateCatalog(modalCatName.trim(), modalCatDesc.trim(), modalCatColor, modalCatIsDefault);
        if (created) {
          // Switch to this new catalog
          setFilters(prev => ({ ...prev, binder: created.name }));
        }
      }
      setIsCatalogModalOpen(false);
    } catch (err: any) {
      setCatalogModalError(err.message || 'Wystąpił błąd podczas zapisywania katalogu');
    } finally {
      setIsCatalogSaving(false);
    }
  };

  const handleDeleteCatalogConfirm = async () => {
    if (!catalogToDelete || !onDeleteCatalog) return;
    try {
      const deletedName = catalogToDelete.name;
      await onDeleteCatalog(catalogToDelete.id);
      if (filters.binder === deletedName) {
        setFilters(prev => ({ ...prev, binder: 'ALL' }));
      }
      setCatalogToDelete(null);
    } catch (err: any) {
      alert(err.message || 'Nie udało się usunąć katalogu');
    }
  };

  const activeCatalogObj = catalogs.find(c => c.name === filters.binder);

  return (
    <div className="space-y-6">
      
      {/* 1. CATALOGS BAR (Katalogi kolekcji) */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-100 flex items-center gap-2">
                <span>Katalogi i Klasery Kolekcji</span>
                <span className="text-[10px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full font-mono font-normal">
                  {catalogs.length} katalogów
                </span>
              </h2>
              <p className="text-[11px] text-stone-400">
                Wybierz katalog, aby filtrować karty lub utwórz nowy do organizacji swoich talii i klaserów.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={openCreateCatalogModal}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer shrink-0"
            >
              <FolderPlus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Utwórz nowy katalog</span>
            </button>

            <button
              onClick={onOpenCreateDeckModal}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-950/40 transition-all cursor-pointer shrink-0 border border-purple-400/30"
            >
              <Swords className="w-4 h-4 stroke-[2.5] text-purple-200" />
              <span>+ Utwórz nową talię</span>
            </button>
          </div>
        </div>

        {/* Catalog Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          {/* Decks quick access (if any exist) */}
          {decks && decks.length > 0 && (
            <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-stone-800 shrink-0">
              <span className="text-[10px] uppercase font-mono font-bold text-purple-400 px-1.5 flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>Talii EDH:</span>
              </span>
              {decks.map(deck => {
                const count = (deck.commander ? 1 : 0) + (deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0);
                return (
                  <button
                    key={deck.id}
                    onClick={() => onSelectDeck && onSelectDeck(deck)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border bg-purple-950/60 text-purple-200 border-purple-800/80 hover:bg-purple-900/80 hover:border-purple-500 shadow-sm"
                    title={`Otwórz talię ${deck.name} (${deck.format || 'EDH Commander'})`}
                  >
                    <Swords className="w-3 h-3 text-purple-300" />
                    <span className="truncate max-w-[120px]">{deck.name}</span>
                    <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                      count === 100
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-purple-900/90 text-purple-300 border border-purple-700/50'
                    }`}>
                      {count}/100
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* All Cards Tab */}
          <button
            onClick={() => setFilters(prev => ({ ...prev, binder: 'ALL' }))}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
              filters.binder === 'ALL'
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md font-extrabold'
                : 'bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-850'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Wszystkie karty</span>
            <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
              filters.binder === 'ALL' ? 'bg-stone-950 text-amber-300' : 'bg-stone-800 text-stone-400'
            }`}>
              {collection.length}
            </span>
          </button>

          {/* Individual Catalog Tabs */}
          {catalogs.map(cat => {
            const isSelected = filters.binder === cat.name;
            const stats = catalogStats.get(cat.name) || { count: 0, totalCards: 0, totalValue: 0 };
            const colorStyle = COLOR_MAP[cat.color || 'amber'] || COLOR_MAP.amber;

            return (
              <div
                key={cat.id}
                onClick={() => setFilters(prev => ({ ...prev, binder: cat.name }))}
                className={`group px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
                  isSelected
                    ? `${colorStyle.bg} ${colorStyle.border} ${colorStyle.text} ring-1 ring-amber-500/40 shadow-md`
                    : 'bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-850'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${colorStyle.dot}`} />
                <span className="truncate max-w-[140px]">{cat.name}</span>
                
                {cat.isDefault && (
                  <span title="Domyślny katalog">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  </span>
                )}

                <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                  isSelected ? 'bg-stone-950/80 text-stone-200' : 'bg-stone-800 text-stone-400'
                }`}>
                  {stats.count}
                </span>

                {/* Quick Action Buttons for Catalog */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                  {!cat.isDefault && onSetDefaultCatalog && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetDefaultCatalog(cat.id);
                      }}
                      title="Oznacz ten katalog jako domyślny"
                      className="p-1 hover:text-amber-400 text-stone-500 rounded transition-colors"
                    >
                      <Star className="w-3 h-3" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => openEditCatalogModal(cat, e)}
                    title={`Edytuj katalog ${cat.name}`}
                    className="p-1 hover:text-amber-300 text-stone-500 rounded transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>

                  {onDeleteCatalog && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCatalogToDelete(cat);
                      }}
                      title={`Usuń katalog ${cat.name}`}
                      className="p-1 hover:text-rose-400 text-stone-500 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Catalog Detailed Banner (when a specific catalog is active) */}
        {activeCatalogObj && (
          <div className="mt-2 p-3 bg-stone-950/70 border border-stone-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border ${COLOR_MAP[activeCatalogObj.color || 'amber']?.bg || 'bg-amber-500/10'} ${COLOR_MAP[activeCatalogObj.color || 'amber']?.border || 'border-amber-500/30'} ${COLOR_MAP[activeCatalogObj.color || 'amber']?.text || 'text-amber-400'}`}>
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-stone-100">{activeCatalogObj.name}</h3>
                  {activeCatalogObj.isDefault && (
                    <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded-full flex items-center gap-1 font-bold">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      Domyślny
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {activeCatalogObj.description || 'Katalog kart kolekcji'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[10px] uppercase font-mono text-stone-400">Wartość katalogu</p>
                <p className="font-mono font-black text-emerald-400 text-sm">
                  {formatCurrency(catalogStats.get(activeCatalogObj.name)?.totalValue || 0, settings.currency)}
                </p>
              </div>

              <div className="flex items-center gap-1.5 border-l border-stone-800 pl-3">
                {activeCatalogObj.isDefault ? (
                  <span className="px-2.5 py-1.5 bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/30 font-bold text-xs flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Domyślny katalog</span>
                  </span>
                ) : onSetDefaultCatalog ? (
                  <button
                    onClick={() => onSetDefaultCatalog(activeCatalogObj.id)}
                    className="px-2.5 py-1.5 bg-stone-900 hover:bg-amber-500/20 text-stone-300 hover:text-amber-300 rounded-lg border border-stone-800 hover:border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Ustaw ten katalog jako domyślny (nowo dodawane karty będą trafiać do niego)"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ustaw jako domyślny</span>
                  </button>
                ) : null}

                <button
                  onClick={(e) => openEditCatalogModal(activeCatalogObj, e)}
                  className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-amber-300 rounded-lg border border-stone-800 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edytuj</span>
                </button>

                {onDeleteCatalog && (
                  <button
                    onClick={() => setCatalogToDelete(activeCatalogObj)}
                    className="px-2.5 py-1.5 bg-stone-900 hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 rounded-lg border border-stone-800 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Usuń ten katalog"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń katalog</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. SEARCH & ADVANCED FILTERS BAR */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg space-y-4">
        
        {/* Top Controls Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Szukaj w kolekcji (nazwa, typ, set, notatka)..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {filters.searchQuery && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Color Filter Pills */}
          <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-800 shrink-0">
            {[
              { id: 'ALL', label: 'Wszystkie' },
              { id: 'W', label: 'W', bg: 'bg-amber-100 text-stone-900 font-bold' },
              { id: 'U', label: 'U', bg: 'bg-blue-600 text-white font-bold' },
              { id: 'B', label: 'B', bg: 'bg-stone-800 text-stone-200 font-bold' },
              { id: 'R', label: 'R', bg: 'bg-red-600 text-white font-bold' },
              { id: 'G', label: 'G', bg: 'bg-emerald-600 text-white font-bold' },
              { id: 'C', label: 'Bezbarwne' },
              { id: 'MULTI', label: 'Wielobarwne' }
            ].map(col => (
              <button
                key={col.id}
                onClick={() => setFilters(prev => ({ ...prev, color: col.id }))}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                  filters.color === col.id
                    ? 'bg-amber-500 text-stone-950 font-extrabold shadow-sm'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`}
              >
                {col.bg ? <span className={`px-1.5 py-0.2 rounded text-[11px] ${col.bg}`}>{col.label}</span> : col.label}
              </button>
            ))}
          </div>

        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-stone-800/60 text-xs">
          
          {/* Type Filter */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Typ karty</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">Wszystkie typy</option>
              <option value="Creature">Stwory (Creature)</option>
              <option value="Instant">Zaklęcia (Instant)</option>
              <option value="Sorcery">Sorcery</option>
              <option value="Enchantment">Enchantment</option>
              <option value="Artifact">Artefakty</option>
              <option value="Planeswalker">Planeswalker</option>
              <option value="Land">Lądy (Land)</option>
            </select>
          </div>

          {/* Rarity Filter */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Rzadkość</label>
            <select
              value={filters.rarity}
              onChange={(e) => setFilters(prev => ({ ...prev, rarity: e.target.value }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">Wszystkie rzadkości</option>
              <option value="mythic">Mityczne (Mythic)</option>
              <option value="rare">Rzadkie (Rare)</option>
              <option value="uncommon">Niepospolite (Uncommon)</option>
              <option value="common">Pospolite (Common)</option>
            </select>
          </div>

          {/* Binder / Catalog Filter */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Katalog / Klaser</label>
            <select
              value={filters.binder}
              onChange={(e) => setFilters(prev => ({ ...prev, binder: e.target.value }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">Wszystkie katalogi</option>
              {catalogs.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Set Filter */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Dodatek (Set)</label>
            <select
              value={filters.set}
              onChange={(e) => setFilters(prev => ({ ...prev, set: e.target.value }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 truncate cursor-pointer"
            >
              <option value="ALL">Wszystkie dodatki</option>
              {sets.map(([code, name]) => (
                <option key={code} value={code}>[{code.toUpperCase()}] {name}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">Sortowanie</label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="price_desc">Cena: Najwyższa</option>
              <option value="price_asc">Cena: Najniższa</option>
              <option value="name">Nazwa A-Z</option>
              <option value="cmc_desc">Mana CMC: Max</option>
              <option value="cmc_asc">Mana CMC: Min</option>
              <option value="added_desc">Najnowsze w kolekcji</option>
            </select>
          </div>

          {/* View Mode Toggle & Only Foil */}
          <div className="flex items-end justify-between gap-2">
            <button
              onClick={() => setFilters(prev => ({ ...prev, onlyFoil: !prev.onlyFoil }))}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                filters.onlyFoil
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-stone-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Tylko Foil</span>
            </button>

            <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-lg border border-stone-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-stone-800 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
                title="Widok kafelkowy (Binder)"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1 rounded transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-stone-800 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
                title="Widok tabeli"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Results Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 text-xs gap-2">
        <div className="flex items-center gap-2 text-stone-400 flex-wrap">
          <span>Wyświetlono: <strong className="text-stone-100 font-mono">{filteredCollection.length}</strong> pozycji ({filteredMetrics.cardsCount} kart)</span>
          <span>•</span>
          <span>Wartość: <strong className="text-emerald-400 font-mono font-bold">{formatCurrency(filteredMetrics.totalValue, settings.currency)}</strong></span>
        </div>

        {(filters.searchQuery || filters.color !== 'ALL' || filters.type !== 'ALL' || filters.rarity !== 'ALL' || filters.binder !== 'ALL' || filters.set !== 'ALL' || filters.onlyFoil) && (
          <button
            onClick={handleResetFilters}
            className="text-amber-400 hover:text-amber-300 underline text-xs cursor-pointer self-start sm:self-auto"
          >
            Wyczyść wszystkie filtry
          </button>
        )}
      </div>

      {/* Collection Cards Area */}
      {filteredCollection.length === 0 ? (
        <div className="bg-stone-900/60 border border-stone-800/80 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-stone-800/80 mx-auto flex items-center justify-center text-stone-500">
            <FolderOpen className="w-8 h-8 text-stone-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-200">
              {filters.binder !== 'ALL' ? `Brak kart w katalogu "${filters.binder}"` : 'Brak kart w kolekcji'}
            </h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
              {filters.binder !== 'ALL' 
                ? `W tym katalogu nie ma jeszcze kart spełniających filtry. Możesz dodać do niego kartę z wyszukiwarki lub edytując istniejącą pozycję.`
                : 'Nie znaleziono kart spełniających kryteria wyszukiwania. Dodaj nową kartę wyszukując w API Scryfall lub zmień filtry.'}
            </p>
          </div>
          <button
            onClick={onOpenAddModal}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Szukaj i dodaj kartę do katalogu</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredCollection.map(item => (
            <CardItem
              key={item.id}
              item={item}
              viewMode="grid"
              settings={settings}
              onUpdateQuantity={onUpdateQuantity}
              onDeleteItem={onDeleteItem}
              onEditItem={onEditItem}
              onViewCardDetails={onViewCardDetails}
            />
          ))}
        </div>
      ) : (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-950 text-stone-400 uppercase font-mono text-[10px] tracking-wider border-b border-stone-800">
                <th className="py-3 px-3">Karta</th>
                <th className="py-3 px-3">Koszt</th>
                <th className="py-3 px-3">Set / Rzadkość</th>
                <th className="py-3 px-3">Stan / Język</th>
                <th className="py-3 px-3">Cena (Szt)</th>
                <th className="py-3 px-3">Ilość</th>
                <th className="py-3 px-3">Wartość</th>
                <th className="py-3 px-3 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredCollection.map(item => (
                <CardItem
                  key={item.id}
                  item={item}
                  viewMode="table"
                  settings={settings}
                  onUpdateQuantity={onUpdateQuantity}
                  onDeleteItem={onDeleteItem}
                  onEditItem={onEditItem}
                  onViewCardDetails={onViewCardDetails}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE / EDIT CATALOG MODAL */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6 text-stone-100 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-400" />
                <span>{editingCatalog ? 'Edytuj katalog' : 'Utwórz nowy katalog'}</span>
              </h3>
              <button
                onClick={() => setIsCatalogModalOpen(false)}
                className="text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catalogModalError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold">
                {catalogModalError}
              </div>
            )}

            <form onSubmit={handleSaveCatalogModal} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-stone-300 mb-1">
                  Nazwa katalogu *
                </label>
                <input
                  type="text"
                  placeholder="np. Talia Commander Urza, Na Wymianę..."
                  value={modalCatName}
                  onChange={(e) => setModalCatName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-stone-300 mb-1">
                  Opis (opcjonalnie)
                </label>
                <input
                  type="text"
                  placeholder="np. Główne karty formatu Modern..."
                  value={modalCatDesc}
                  onChange={(e) => setModalCatDesc(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-bold text-stone-300 mb-1.5">
                  Kolor etykiety
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.keys(COLOR_MAP).map(col => {
                    const isSelected = modalCatColor === col;
                    const style = COLOR_MAP[col];
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setModalCatColor(col)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${style.bg} ${style.border} ${
                          isSelected ? 'ring-2 ring-amber-400 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${style.dot}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Catalog Checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-950 border border-stone-800 cursor-pointer hover:border-stone-700 transition-colors">
                <input
                  type="checkbox"
                  checked={modalCatIsDefault}
                  onChange={(e) => setModalCatIsDefault(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-stone-900 border-stone-700 cursor-pointer"
                />
                <div className="flex-1 text-xs">
                  <span className="font-bold text-stone-200 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Oznacz jako domyślny katalog</span>
                  </span>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Nowe karty dodawane do kolekcji będą automatycznie przypisywane do tego katalogu.
                  </p>
                </div>
              </label>

              <div className="pt-3 border-t border-stone-800 flex items-center justify-between gap-2">
                {editingCatalog && onDeleteCatalog ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCatalogModalOpen(false);
                      setCatalogToDelete(editingCatalog);
                    }}
                    className="px-3 py-2 bg-stone-900 hover:bg-rose-950/60 text-rose-400 border border-stone-800 hover:border-rose-800/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń katalog</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCatalogModalOpen(false)}
                    className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={isCatalogSaving || !modalCatName.trim()}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isCatalogSaving ? 'Zapisywanie...' : editingCatalog ? 'Zapisz zmiany' : 'Utwórz katalog'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CATALOG CONFIRMATION MODAL */}
      {catalogToDelete && (() => {
        const otherCatalogs = catalogs.filter(c => c.id !== catalogToDelete.id);
        const nextDefaultName = otherCatalogs.find(c => c.isDefault)?.name || otherCatalogs[0]?.name || 'Klaser Główny';
        const cardCount = catalogStats.get(catalogToDelete.name)?.count || 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 text-stone-100 space-y-4 shadow-2xl">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>Usunąć katalog "{catalogToDelete.name}"?</span>
              </h3>

              <div className="space-y-2 text-xs text-stone-300 leading-relaxed">
                <p>
                  Karty przypisane do tego katalogu (<strong>{cardCount} pozycji</strong>) 
                  <strong> NIE zostaną usunięte</strong>. Zostaną automatycznie przeniesione do katalogu: 
                  <span className="text-amber-300 font-bold ml-1">"{nextDefaultName}"</span>.
                </p>
                {catalogToDelete.isDefault && (
                  <p className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    ⭐ Ten katalog jest obecnie <strong>domyślny</strong>. Po jego usunięciu katalog <strong>"{nextDefaultName}"</strong> zostanie automatycznie nowym katalogiem domyślnym.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setCatalogToDelete(null)}
                  className="px-3.5 py-1.5 bg-stone-800 text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-700 cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCatalogConfirm}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-colors"
                >
                  Tak, usuń katalog
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
