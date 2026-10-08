import { PageHeader } from './ui/PageHeader';
import { publicUrl } from '../utils/publicLinks';
import React, { useState, useMemo, Suspense } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { CollectionItem, AppSettings, AuthUser } from '../types';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  CircleDollarSign, 
  Link, 
  Copy, 
  Check, 
  ExternalLink, 
  Search, 
  ArrowUpDown, 
  Sparkles, 
  Trash2, 
  Eye, 
  FileText, 
  Folder, 
  ShoppingBag,
  Share2,
  DollarSign,
  Map as MapIcon,
  Loader2,
  Plus
} from 'lucide-react';

// Mapa (Leaflet) ładowana dopiero po otwarciu — nie spowalnia reszty aplikacji
const SellersMapModal = lazyWithReload(() => import('./SellersMapModal'));
const ForSaleAddModal = lazyWithReload(() => import('./for-sale/ForSaleAddModal'));

interface ForSaleListProps {
  collection: CollectionItem[];
  settings: AppSettings;
  currentUser: AuthUser | null;
  onToggleForSale: (item: CollectionItem, customPrice?: number | null) => Promise<void> | void;
  onUpdateCollectionItem: (id: string, updates: Partial<CollectionItem>) => Promise<CollectionItem | null> | void;
  onViewCardDetails: (item: CollectionItem) => void;
  onGoToCollection: () => void;
  showToast?: (message: string) => void;
  onOpenSellerProfile?: (username: string) => void;
  onAddCardForSale?: (data: import('./for-sale/ForSaleAddModal').ForSaleAddData) => Promise<boolean>;
}

export const ForSaleList: React.FC<ForSaleListProps> = ({
  collection,
  settings,
  currentUser,
  onToggleForSale,
  onUpdateCollectionItem,
  onViewCardDetails,
  onGoToCollection,
  showToast,
  onOpenSellerProfile,
  onAddCardForSale,
}) => {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterFoilOnly, setFilterFoilOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');

  // 1. Filter only cards marked for sale
  const allForSaleCards = useMemo(() => {
    return collection.filter(item => Boolean(item.isForSale));
  }, [collection]);

  // Metrics
  const totalCardsCount = useMemo(() => {
    return allForSaleCards.reduce((sum, item) => sum + item.quantity + item.quantityFoil, 0);
  }, [allForSaleCards]);

  const totalValue = useMemo(() => {
    return allForSaleCards.reduce((sum, item) => {
      if (item.salePrice !== undefined && item.salePrice !== null) {
        return sum + (item.salePrice * (item.quantity + item.quantityFoil));
      }
      const priceNorm = getCardPrice(item.card, false, settings);
      const priceFoil = getCardPrice(item.card, true, settings);
      return sum + (item.quantity * priceNorm) + (item.quantityFoil * priceFoil);
    }, 0);
  }, [allForSaleCards, settings]);

  // Public link generation
  const publicShareSlug = currentUser?.username || currentUser?.id || 'oferta';
  const publicShareUrl = publicUrl('sale', publicShareSlug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicShareUrl);
    setCopiedLink(true);
    showToast?.('Skopiowano publiczny link do schowka! Każdy bez konta może go otworzyć.');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyTextList = () => {
    if (allForSaleCards.length === 0) return;
    const textList = allForSaleCards
      .map(item => {
        const totalQty = item.quantity + item.quantityFoil;
        const foilTag = item.quantityFoil > 0 ? ' [FOIL]' : '';
        const price = item.salePrice !== undefined && item.salePrice !== null
          ? formatCurrency(item.salePrice, settings.currency)
          : formatCurrency(getCardPrice(item.card, Boolean(item.quantityFoil > 0), settings), settings.currency);
        return `${totalQty}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} [${item.condition}, ${item.language}] - ${price}`;
      })
      .join('\n');

    const header = `=== KARTY NA SPRZEDAŻ (${currentUser?.username || 'Gracz MTG'}) ===\nŁącznie: ${totalCardsCount} szt. | Wartość: ${formatCurrency(totalValue, settings.currency)}\nPubliczna oferta: ${publicShareUrl}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedText(true);
    showToast?.('Skopiowano listę kart (.txt) gotową do wklejenia na grupach MTG / Discord!');
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleSaveCustomPrice = async (item: CollectionItem) => {
    const val = parseFloat(tempPrice.replace(',', '.'));
    const finalPrice = isNaN(val) || val <= 0 ? null : val;
    await onUpdateCollectionItem(item.id, { salePrice: finalPrice });
    setEditingPriceId(null);
    setTempPrice('');
    showToast?.(finalPrice !== null ? `Zapisano własną cenę ${formatCurrency(finalPrice, settings.currency)} dla "${item.card.name}"` : `Przywrócono domyślną cenę rynkową dla "${item.card.name}"`);
  };

  // Filtered & sorted cards
  const displayedCards = useMemo(() => {
    return allForSaleCards
      .filter(item => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          item.card.name.toLowerCase().includes(q) ||
          (item.card.type_line && item.card.type_line.toLowerCase().includes(q)) ||
          item.card.set.toLowerCase().includes(q) ||
          item.card.set_name.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        );
      })
      .filter(item => {
        if (filterCondition === 'all') return true;
        return item.condition === filterCondition;
      })
      .filter(item => {
        if (!filterFoilOnly) return true;
        return item.quantityFoil > 0;
      })
      .sort((a, b) => {
        if (sortBy === 'price-desc') {
          const valA = a.salePrice ?? getCardPrice(a.card, Boolean(a.quantityFoil > 0), settings);
          const valB = b.salePrice ?? getCardPrice(b.card, Boolean(b.quantityFoil > 0), settings);
          return valB - valA;
        }
        if (sortBy === 'price-asc') {
          const valA = a.salePrice ?? getCardPrice(a.card, Boolean(a.quantityFoil > 0), settings);
          const valB = b.salePrice ?? getCardPrice(b.card, Boolean(b.quantityFoil > 0), settings);
          return valA - valB;
        }
        if (sortBy === 'name') {
          return a.card.name.localeCompare(b.card.name);
        }
        if (sortBy === 'edhrec') {
          const rankA = a.card.edhrec_rank ?? 999999;
          const rankB = b.card.edhrec_rank ?? 999999;
          return rankA - rankB;
        }
        return 0;
      });
  }, [allForSaleCards, searchQuery, filterCondition, filterFoilOnly, sortBy, settings]);

  return (
    <div className="space-y-6">
      
      <PageHeader
        title="Sprzedam"
        description="Karty oznaczone na sprzedaż. Kupujący widzą je pod Twoim publicznym linkiem, bez zakładania konta."
        meta={
          <>
            <span><span className="text-stone-100 font-medium tabular-nums">{totalCardsCount}</span> kart</span>
            <span>Wartość oferty <span className="text-stone-100 font-medium tabular-nums">{formatCurrency(totalValue, settings.currency)}</span></span>
          </>
        }
        actions={
          <>
            <button type="button" onClick={() => setIsMapOpen(true)} className="btn btn-secondary">
              <MapIcon className="w-4 h-4" />
              Mapa sprzedawców
            </button>
            {onAddCardForSale && (
              <button type="button" onClick={() => setIsAddOpen(true)} className="btn btn-primary">
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Dodaj kartę na sprzedaż
              </button>
            )}
          </>
        }
      />
      {isAddOpen && onAddCardForSale && (
        <Suspense fallback={null}>
          <ForSaleAddModal collection={collection} settings={settings} onAdd={onAddCardForSale} onClose={() => setIsAddOpen(false)} />
        </Suspense>
      )}

      {/* Publiczny link do oferty */}
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-stone-300 shrink-0">
          <Share2 className="w-4 h-4 text-stone-400" />
          Twój link do oferty
        </div>
        <input
          type="text"
          readOnly
          value={publicShareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Publiczny link do oferty"
          className="flex-1 min-w-0 h-9 bg-stone-950 border border-stone-800 rounded-lg px-3 text-sm text-stone-300 focus:outline-none focus:border-stone-600"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={handleCopyLink} className="btn btn-primary">
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedLink ? 'Skopiowano' : 'Kopiuj link'}
          </button>
          <a href={publicShareUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" title="Zobacz, jak widzą ofertę kupujący">
            <ExternalLink className="w-4 h-4" />
            <span className="hidden lg:inline">Podgląd</span>
          </a>
          <button type="button" onClick={handleCopyTextList} className="btn btn-ghost" title="Kopiuj listę kart jako tekst">
            {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
            <span className="hidden lg:inline">{copiedText ? 'Skopiowano' : 'Lista .txt'}</span>
          </button>
        </div>
      </div>

      {/* 2. Empty State or Cards Board */}
      {allForSaleCards.length === 0 ? (
        <div className="bg-stone-900/70 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-5 shadow-inner">
          <div className="w-20 h-20 rounded-2xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center shadow-lg">
            <CircleDollarSign className="w-10 h-10" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">
              Nie masz jeszcze żadnych kart na sprzedaż
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Przejdź do zakładki <strong className="text-stone-200">„Kolekcja”</strong> i kliknij zieloną ikonkę dolara (<span className="text-emerald-400 font-bold">$</span>) na kafelku dowolnej karty w klaserze obok opcji <strong className="text-stone-200">„Edytuj pozycję”</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToCollection}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/60 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Folder className="w-4 h-4" />
            <span>Przejdź do kolekcji</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Controls & Filter Bar */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj w ofercie (nazwa, set, typ)..."
                className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2.5 flex-wrap">
              
              {/* Foil toggle */}
              <button
                type="button"
                onClick={() => setFilterFoilOnly(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterFoilOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                    : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Tylko foil</span>
              </button>

              {/* Condition */}
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Wszystkie stany</option>
                <option value="NM">Stan NM (Near Mint)</option>
                <option value="EX">Stan EX (Excellent)</option>
                <option value="GD">Stan GD (Good)</option>
                <option value="LP">Stan LP (Light Played)</option>
                <option value="PL">Stan PL (Played)</option>
              </select>

              {/* Sort by */}
              <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
                >
                  <option value="price-desc">Cena: Najwyższa</option>
                  <option value="price-asc">Cena: Najniższa</option>
                  <option value="name">Nazwa A-Z</option>
                  <option value="edhrec">Popularność EDHREC</option>
                </select>
              </div>

            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayedCards.map(item => {
              const imageUri = getCardImageUri(item.card, 'normal');
              const edhrecRank = getCardEdhrecRank(item.card);
              const marketPriceNormal = getCardPrice(item.card, false, settings);
              const marketPriceFoil = getCardPrice(item.card, true, settings);
              const activeMarketPrice = item.quantityFoil > 0 ? marketPriceFoil : marketPriceNormal;
              const effectivePrice = item.salePrice ?? activeMarketPrice;
              const isEditingPrice = editingPriceId === item.id;

              return (
                <div
                  key={item.id}
                  className="group relative bg-stone-900 rounded-2xl border border-emerald-500/30 hover:border-emerald-400/70 transition-all duration-300 overflow-hidden flex flex-col shadow-lg hover:shadow-2xl hover:shadow-emerald-950/30"
                >
                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 z-10 bg-emerald-950/95 text-emerald-300 border border-emerald-500/50 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 backdrop-blur-md">
                    <CircleDollarSign className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                    <span>Na sprzedaż</span>
                  </div>

                  {item.quantityFoil > 0 && (
                    <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
                      <Sparkles className="w-3 h-3 fill-stone-950" />
                      <span>Foil</span>
                    </div>
                  )}

                  {/* Card Image Area */}
                  <div
                    onClick={() => onViewCardDetails(item)}
                    className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-stone-950 cursor-pointer group-hover:brightness-105 transition-all"
                  >
                    <img
                      src={imageUri}
                      alt={item.card.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => handleCardImageError(e, imageUri)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    {/* EDHREC Rank */}
                    {edhrecRank != null && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <EdhrecBadge rank={edhrecRank} size="xs" />
                      </div>
                    )}

                    {/* Asking Price Tag on image */}
                    <div className="absolute bottom-2 right-2 bg-stone-950/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-emerald-500/40 shadow-xl">
                      <p className="text-[11px] font-bold text-stone-400 leading-none">Cena</p>
                      <p className="text-xs font-bold tabular-nums text-emerald-300 leading-tight">
                        {formatCurrency(effectivePrice, settings.currency)}
                      </p>
                    </div>
                  </div>

                  {/* Card Content & Action Area */}
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4
                          onClick={() => onViewCardDetails(item)}
                          className="font-bold text-xs text-stone-100 hover:text-emerald-300 transition-colors line-clamp-1 cursor-pointer"
                          title={item.card.name}
                        >
                          {item.card.name}
                        </h4>
                        <ManaSymbol cost={item.card.mana_cost} size="sm" />
                      </div>

                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.2 rounded border border-stone-700">
                          {item.card.set.toUpperCase()}
                        </span>
                        <span className={`text-[11px] px-1.5 py-0.2 rounded border font-semibold ${getRarityColor(item.card.rarity)}`}>
                          {getRarityLabel(item.card.rarity)}
                        </span>
                        <span className="text-[11px] text-stone-400 bg-stone-800 px-1.5 py-0.2 rounded">
                          {item.condition} • {item.language}
                        </span>
                      </div>
                    </div>

                    {/* Price customizer */}
                    <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
                      {isEditingPrice ? (
                        <div className="space-y-1 bg-stone-950 p-2 rounded-xl border border-emerald-500/40">
                          <label className="text-[11px] text-stone-400 block font-medium">Własna cena ({settings.currency}):</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.5"
                              value={tempPrice}
                              onChange={(e) => setTempPrice(e.target.value)}
                              placeholder={activeMarketPrice ? activeMarketPrice.toString() : '0.00'}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs text-emerald-300 tabular-nums font-bold focus:outline-none focus:border-emerald-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveCustomPrice(item)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPriceId(null)}
                              className="px-2 py-1 bg-stone-800 text-stone-400 text-[11px] rounded-lg cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceId(item.id);
                              setTempPrice(item.salePrice !== undefined && item.salePrice !== null ? item.salePrice.toString() : '');
                            }}
                            className="text-stone-400 hover:text-emerald-300 transition-colors text-[11px] font-medium underline cursor-pointer"
                            title="Zmień cenę sprzedaży na własną"
                          >
                            {item.salePrice ? 'Własna cena: Zmień' : 'Ustaw własną cenę'}
                          </button>

                          <span className="tabular-nums text-[11px] text-stone-500">
                            {item.quantity + item.quantityFoil} szt.
                          </span>
                        </div>
                      )}

                      {/* Bottom action bar */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-stone-500 truncate max-w-[100px]" title={item.binder || 'Klaser Główny'}>
                          {item.binder || 'Klaser'}
                        </span>

                        <button
                          type="button"
                          onClick={() => onToggleForSale(item)}
                          className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                          title="Wycofaj kartę ze sprzedaży"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Wycofaj</span>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {isMapOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          }
        >
          <SellersMapModal onClose={() => setIsMapOpen(false)} onOpenSeller={(u) => onOpenSellerProfile?.(u)} />
        </Suspense>
      )}
    </div>
  );
};
