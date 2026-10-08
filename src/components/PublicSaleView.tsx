import { SendMessageModal } from './messages/SendMessageModal';
import React, { useState, useMemo } from 'react';
import { CollectionItem, AppSettings, ScryfallCard } from '../types';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { AppFooter } from './AppFooter';
import {
  CircleDollarSign,
  Search,
  ArrowUpDown,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Eye,
  ShoppingBag,
  LogIn,
  Share2,
  Mail,
  X
} from 'lucide-react';

interface PublicSaleViewProps {
  seller: {
    id: string;
    username: string;
  };
  cards: CollectionItem[];
  settings: AppSettings;
  onOpenLogin: () => void;
  onViewCardDetails?: (card: ScryfallCard) => void;
  showToast?: (message: string) => void;
  /** Zalogowany odwiedzający (może pisać do sprzedawcy). */
  currentUserId?: string | null;
}

export const PublicSaleView: React.FC<PublicSaleViewProps> = ({
  seller,
  cards,
  settings,
  onOpenLogin,
  onViewCardDetails,
  showToast,
  currentUserId = null,
}) => {
  const [messageSubject, setMessageSubject] = useState<string | null>(null);
  const isOwnOffer = Boolean(currentUserId && currentUserId === seller.id);
  // Bez logowania przycisk prowadzi do logowania; po zalogowaniu otwiera okno wiadomości
  const writeToSeller = (subject = '') => {
    if (!currentUserId) {
      showToast?.('Zaloguj się, aby napisać do sprzedawcy.');
      onOpenLogin();
      return;
    }
    setMessageSubject(subject);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterFoilOnly, setFilterFoilOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [selectedPreviewCard, setSelectedPreviewCard] = useState<CollectionItem | null>(null);

  // Metrics
  const totalCardsCount = useMemo(() => {
    return cards.reduce((sum, item) => sum + item.quantity + item.quantityFoil, 0);
  }, [cards]);

  const totalValue = useMemo(() => {
    return cards.reduce((sum, item) => {
      if (item.salePrice !== undefined && item.salePrice !== null) {
        return sum + (item.salePrice * (item.quantity + item.quantityFoil));
      }
      const priceNorm = getCardPrice(item.card, false, settings);
      const priceFoil = getCardPrice(item.card, true, settings);
      return sum + (item.quantity * priceNorm) + (item.quantityFoil * priceFoil);
    }, 0);
  }, [cards, settings]);

  const currentUrl = window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedLink(true);
    showToast?.('Skopiowano link do oferty!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyTextList = () => {
    if (cards.length === 0) return;
    const textList = cards
      .map(item => {
        const totalQty = item.quantity + item.quantityFoil;
        const foilTag = item.quantityFoil > 0 ? ' [FOIL]' : '';
        const price = item.salePrice !== undefined && item.salePrice !== null
          ? formatCurrency(item.salePrice, settings.currency)
          : formatCurrency(getCardPrice(item.card, Boolean(item.quantityFoil > 0), settings), settings.currency);
        return `${totalQty}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} [${item.condition}, ${item.language}] - ${price}`;
      })
      .join('\n');

    const header = `=== KARTY NA SPRZEDAŻ OD: ${seller.username} ===\nŁącznie: ${totalCardsCount} szt. | Wartość: ${formatCurrency(totalValue, settings.currency)}\nLink do oferty: ${currentUrl}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedText(true);
    showToast?.('Skopiowano listę kart (.txt) do schowka!');
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Filtered & sorted cards
  const displayedCards = useMemo(() => {
    return cards
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
  }, [cards, searchQuery, filterCondition, filterFoilOnly, sortBy, settings]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans pb-16">
      
      {/* Top Navbar */}
      <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-emerald-600 items-center justify-center shadow-lg shadow-emerald-950/60 ring-1 ring-emerald-400/30">
              <CircleDollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-emerald-200 truncate">
                  <span className="hidden sm:inline">Mana Screw • </span>Oferta na sprzedaż
                </h1>
                <span className="hidden md:inline text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  Publiczny Klaser
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Sprzedający: <strong className="text-emerald-300">@{seller.username}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyLink}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white border border-stone-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Kopiuj link do tej oferty"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="hidden sm:inline">{copiedLink ? 'Skopiowano!' : 'Udostępnij link'}</span>
            </button>

            {!isOwnOffer && (
              <button type="button" onClick={() => writeToSeller()} className="btn btn-primary" title={`Napisz do @${seller.username}`}>
                <Mail className="w-4 h-4" />
                <span className="sm:hidden">Napisz</span>
                <span className="hidden sm:inline">Napisz do sprzedawcy</span>
              </button>
            )}
            {!currentUserId && (
              <button type="button" onClick={onOpenLogin} className="btn btn-secondary" aria-label="Zaloguj się">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Zaloguj się</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-6 space-y-6">
        
        {/* Banner with metrics */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs tabular-nums font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 ">
              Oferta Sprzedaży
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Karty gracza @{seller.username}
            </h2>
            <p className="text-xs text-stone-400 max-w-xl">
              Przeglądaj karty wystawione na sprzedaż. Ceny podane są w walucie <strong>{settings.currency}</strong> (wycena rynkowa Cardmarket / TCGPlayer lub cena ustalona przez sprzedawcę).
            </p>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-stone-800 shadow-inner">
              <span className="text-[11px] font-bold text-stone-400 block">Karty na sprzedaż</span>
              <span className="text-lg font-bold text-stone-100 tabular-nums">{totalCardsCount} szt.</span>
            </div>

            <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-emerald-500/30 shadow-inner">
              <span className="text-[11px] font-bold text-stone-400 block">Łączna wartość</span>
              <span className="text-lg font-bold text-emerald-300 tabular-nums">{formatCurrency(totalValue, settings.currency)}</span>
            </div>

            <button
              type="button"
              onClick={handleCopyTextList}
              className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-bold rounded-2xl transition-all flex items-center gap-2 cursor-pointer"
              title="Kopiuj listę .txt"
            >
              {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-emerald-400" />}
              <span>{copiedText ? 'Skopiowano listę!' : 'Kopiuj listę (.txt)'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj karty (nazwa, set, typ)..."
              className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
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
        {displayedCards.length === 0 ? (
          <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-3">
            <ShoppingBag className="w-12 h-12 text-stone-600 mx-auto" />
            <h3 className="text-base font-bold text-white">Brak kart spełniających kryteria</h3>
            <p className="text-xs text-stone-400">Zmień frazę wyszukiwania lub zresetuj filtry.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayedCards.map(item => {
              const imageUri = getCardImageUri(item.card, 'normal');
              const edhrecRank = getCardEdhrecRank(item.card);
              const marketPriceNormal = getCardPrice(item.card, false, settings);
              const marketPriceFoil = getCardPrice(item.card, true, settings);
              const activeMarketPrice = item.quantityFoil > 0 ? marketPriceFoil : marketPriceNormal;
              const effectivePrice = item.salePrice ?? activeMarketPrice;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedPreviewCard(item)}
                  className="group relative bg-stone-900 rounded-2xl border border-stone-800 hover:border-emerald-400/70 transition-all duration-300 overflow-hidden flex flex-col shadow-lg hover:shadow-2xl cursor-pointer"
                >
                  {item.quantityFoil > 0 && (
                    <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
                      <Sparkles className="w-3 h-3 fill-stone-950" />
                      <span>Foil</span>
                    </div>
                  )}

                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-stone-950">
                    <img
                      src={imageUri}
                      alt={item.card.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => handleCardImageError(e, imageUri)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    {edhrecRank != null && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <EdhrecBadge rank={edhrecRank} size="xs" />
                      </div>
                    )}

                    <div className="absolute bottom-2 right-2 bg-stone-950/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-emerald-500/40 shadow-xl">
                      <p className="text-[11px] font-bold text-stone-400 leading-none">Cena</p>
                      <p className="text-xs font-bold tabular-nums text-emerald-300 leading-tight">
                        {formatCurrency(effectivePrice, settings.currency)}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-bold text-xs text-stone-100 group-hover:text-emerald-300 transition-colors line-clamp-1">
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

                    <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400">
                      <span>Dostępne: <strong className="text-stone-200">{item.quantity + item.quantityFoil} szt.</strong></span>
                      <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform font-bold text-[11px]">
                        Szczegóły →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>

      {/* Card Preview Modal for Visitors */}
      {selectedPreviewCard && (
        <div
          onClick={() => setSelectedPreviewCard(null)}
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 relative overflow-hidden max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
          >
            <button
              onClick={() => setSelectedPreviewCard(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-xl bg-stone-800/80 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="w-44 rounded-2xl overflow-hidden shadow-2xl border border-stone-700 shrink-0">
                <img
                  src={getCardImageUri(selectedPreviewCard.card, 'large') || getCardImageUri(selectedPreviewCard.card, 'normal')}
                  alt={selectedPreviewCard.card.name}
                  className="w-full h-auto object-cover"
                />
              </div>

              <div className="space-y-3 flex-1 min-w-0 text-left">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedPreviewCard.card.name}
                  </h3>
                  <p className="text-xs text-stone-400">{selectedPreviewCard.card.type_line}</p>
                </div>

                <div className="bg-stone-950 p-3 rounded-2xl border border-emerald-500/30 space-y-1">
                  <span className="text-[11px] font-bold text-stone-400 block">Cena sprzedaży</span>
                  <div className="text-xl font-bold tabular-nums text-emerald-300">
                    {formatCurrency(
                      selectedPreviewCard.salePrice ?? getCardPrice(selectedPreviewCard.card, Boolean(selectedPreviewCard.quantityFoil > 0), settings),
                      settings.currency
                    )}
                  </div>
                </div>

                <div className="text-xs space-y-1 text-stone-300">
                  <p>Dodatek: <strong className="text-stone-100">{selectedPreviewCard.card.set_name} ({selectedPreviewCard.card.set.toUpperCase()})</strong></p>
                  <p>Stan karty: <strong className="text-stone-100">{selectedPreviewCard.condition}</strong></p>
                  <p>Język: <strong className="text-stone-100">{selectedPreviewCard.language}</strong></p>
                  <p>Wersja: <strong className="text-stone-100">{selectedPreviewCard.quantityFoil > 0 ? 'Foil' : 'Standard'}</strong></p>
                  {selectedPreviewCard.notes && (
                    <p className="text-amber-300/90 pt-1 text-[11px]">Uwagi sprzedawcy: {selectedPreviewCard.notes}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-800 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-400">
                Sprzedający: <strong className="text-emerald-300">@{seller.username}</strong>
              </span>

              <div className="flex items-center gap-2">
                {!isOwnOffer && (
                  <button
                    type="button"
                    onClick={() => {
                      const c = selectedPreviewCard.card;
                      setSelectedPreviewCard(null);
                      writeToSeller(`Pytanie o kartę: ${c.name} (${c.set.toUpperCase()})`);
                    }}
                    className="btn btn-primary h-9"
                  >
                    <Mail className="w-4 h-4" />
                    Napisz do sprzedawcy
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPreviewCard(null)}
                  className="btn btn-ghost h-9"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AppFooter />

      {messageSubject !== null && currentUserId && (
        <SendMessageModal
          isOpen
          onClose={() => setMessageSubject(null)}
          recipient={{ id: seller.id, username: seller.username }}
          initialSubject={messageSubject}
          showToast={showToast}
        />
      )}
    </div>
  );
};
