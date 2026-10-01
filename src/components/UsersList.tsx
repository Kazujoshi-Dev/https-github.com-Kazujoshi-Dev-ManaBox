import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RegisteredUserSummary, AppSettings, AuthUser, CollectionItem, ScryfallCard } from '../types';
import { usersApi, publicSaleApi } from '../services/api';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  Users, 
  Search, 
  CircleDollarSign, 
  ShoppingBag, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowLeft, 
  RefreshCw, 
  Calendar, 
  Layers, 
  Sparkles, 
  Eye, 
  FileText,
  UserCheck,
  ArrowUpDown,
  Filter
} from 'lucide-react';

interface UsersListProps {
  settings: AppSettings;
  currentUser?: AuthUser | null;
  onViewCardDetails?: (card: ScryfallCard) => void;
  showToast?: (message: string) => void;
}

export const UsersList: React.FC<UsersListProps> = ({
  settings,
  currentUser,
  onViewCardDetails,
  showToast,
}) => {
  const [users, setUsers] = useState<RegisteredUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterForSaleOnly, setFilterForSaleOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'sale-desc' | 'created-desc' | 'name' | 'cards-desc'>('sale-desc');

  // Selected seller state for viewing their for-sale cards
  const [selectedUser, setSelectedUser] = useState<RegisteredUserSummary | null>(null);
  const [sellerOffers, setSellerOffers] = useState<{
    seller: { id: string; username: string; email?: string; createdAt?: string };
    cards: CollectionItem[];
    settings: AppSettings;
  } | null>(null);
  const [isLoadingOffers, setIsLoadingOffers] = useState<boolean>(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  // Selected seller filter states
  const [cardSearchQuery, setCardSearchQuery] = useState<string>('');
  const [cardConditionFilter, setCardConditionFilter] = useState<string>('all');
  const [cardFoilOnly, setCardFoilOnly] = useState<boolean>(false);
  const [cardSortBy, setCardSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');
  const [copiedLinkUser, setCopiedLinkUser] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Load all registered users
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (err: any) {
      console.error('Error loading users:', err);
      setError(err.message || 'Nie udało się pobrać listy użytkowników.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Load offers for a selected user
  const handleSelectUser = useCallback(async (user: RegisteredUserSummary) => {
    setSelectedUser(user);
    setIsLoadingOffers(true);
    setOffersError(null);
    setCardSearchQuery('');
    setCardConditionFilter('all');
    setCardFoilOnly(false);
    try {
      const data = await publicSaleApi.getOffers(user.username || user.id);
      setSellerOffers(data);
    } catch (err: any) {
      console.error('Error fetching seller offers:', err);
      setOffersError(err.message || 'Nie udało się pobrać oferty sprzedaży tego użytkownika.');
      setSellerOffers(null);
    } finally {
      setIsLoadingOffers(false);
    }
  }, []);

  const handleBackToList = () => {
    setSelectedUser(null);
    setSellerOffers(null);
    setOffersError(null);
  };

  const handleCopyUserLink = (username: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = `${window.location.origin}/?sprzedam=${encodeURIComponent(username)}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkUser(username);
    showToast?.(`Skopiowano publiczny link do oferty użytkownika @${username}!`);
    setTimeout(() => setCopiedLinkUser(null), 2500);
  };

  // Filtered & sorted users list
  const filteredUsers = useMemo(() => {
    return users
      .filter((u) => {
        if (filterForSaleOnly && u.forSaleCount <= 0) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          u.username.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'sale-desc') {
          return b.forSaleCount - a.forSaleCount;
        }
        if (sortBy === 'created-desc') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'name') {
          return a.username.localeCompare(b.username);
        }
        if (sortBy === 'cards-desc') {
          return b.totalCardsCount - a.totalCardsCount;
        }
        return 0;
      });
  }, [users, searchQuery, filterForSaleOnly, sortBy]);

  // Total stats for the community
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const sellersCount = users.filter((u) => u.forSaleCount > 0).length;
    const totalCardsOnSale = users.reduce((sum, u) => sum + u.forSaleCount, 0);
    return { totalUsers, sellersCount, totalCardsOnSale };
  }, [users]);

  // Filtered & sorted cards for the currently selected user
  const displayedCards = useMemo(() => {
    if (!sellerOffers) return [];
    return sellerOffers.cards
      .filter((item) => {
        if (!cardSearchQuery.trim()) return true;
        const q = cardSearchQuery.toLowerCase().trim();
        return (
          item.card.name.toLowerCase().includes(q) ||
          (item.card.type_line && item.card.type_line.toLowerCase().includes(q)) ||
          item.card.set.toLowerCase().includes(q) ||
          item.card.set_name.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        );
      })
      .filter((item) => {
        if (cardConditionFilter === 'all') return true;
        return item.condition === cardConditionFilter;
      })
      .filter((item) => {
        if (!cardFoilOnly) return true;
        return item.quantityFoil > 0;
      })
      .sort((a, b) => {
        const effSettings = sellerOffers.settings || settings;
        if (cardSortBy === 'price-desc') {
          const valA = a.salePrice ?? getCardPrice(a.card, Boolean(a.quantityFoil > 0), effSettings);
          const valB = b.salePrice ?? getCardPrice(b.card, Boolean(b.quantityFoil > 0), effSettings);
          return valB - valA;
        }
        if (cardSortBy === 'price-asc') {
          const valA = a.salePrice ?? getCardPrice(a.card, Boolean(a.quantityFoil > 0), effSettings);
          const valB = b.salePrice ?? getCardPrice(b.card, Boolean(b.quantityFoil > 0), effSettings);
          return valA - valB;
        }
        if (cardSortBy === 'name') {
          return a.card.name.localeCompare(b.card.name);
        }
        if (cardSortBy === 'edhrec') {
          const rankA = a.card.edhrec_rank ?? 999999;
          const rankB = b.card.edhrec_rank ?? 999999;
          return rankA - rankB;
        }
        return 0;
      });
  }, [sellerOffers, cardSearchQuery, cardConditionFilter, cardFoilOnly, cardSortBy, settings]);

  const selectedUserTotalValue = useMemo(() => {
    if (!sellerOffers) return 0;
    const effSettings = sellerOffers.settings || settings;
    return sellerOffers.cards.reduce((sum, item) => {
      if (item.salePrice !== undefined && item.salePrice !== null) {
        return sum + item.salePrice * (item.quantity + item.quantityFoil);
      }
      const priceNorm = getCardPrice(item.card, false, effSettings);
      const priceFoil = getCardPrice(item.card, true, effSettings);
      return sum + item.quantity * priceNorm + item.quantityFoil * priceFoil;
    }, 0);
  }, [sellerOffers, settings]);

  const handleCopySellerTextList = () => {
    if (!sellerOffers || sellerOffers.cards.length === 0) return;
    const effSettings = sellerOffers.settings || settings;
    const textList = sellerOffers.cards
      .map((item) => {
        const totalQty = item.quantity + item.quantityFoil;
        const foilTag = item.quantityFoil > 0 ? ' [FOIL]' : '';
        const price =
          item.salePrice !== undefined && item.salePrice !== null
            ? formatCurrency(item.salePrice, effSettings.currency)
            : formatCurrency(getCardPrice(item.card, Boolean(item.quantityFoil > 0), effSettings), effSettings.currency);
        return `${totalQty}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} [${item.condition}, ${item.language}] — ${price}`;
      })
      .join('\n');

    const shareUrl = `${window.location.origin}/?sprzedam=${encodeURIComponent(sellerOffers.seller.username)}`;
    const header = `=== KARTY NA SPRZEDAŻ OD: @${sellerOffers.seller.username} ===\nŁącznie: ${sellerOffers.cards.length} pozycji | Wartość: ${formatCurrency(selectedUserTotalValue, effSettings.currency)}\nPubliczny link: ${shareUrl}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedText(true);
    showToast?.(`Skopiowano listę kart (.txt) użytkownika @${sellerOffers.seller.username} do schowka!`);
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Helper to format date
  const formatJoinDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return 'Niedawno';
    }
  };

  // -------------------------------------------------------------
  // DETAIL VIEW: Viewing specific user's cards for sale
  // -------------------------------------------------------------
  if (selectedUser) {
    const effSettings = sellerOffers?.settings || settings;
    const publicUrl = `${window.location.origin}/?sprzedam=${encodeURIComponent(selectedUser.username)}`;

    return (
      <div className="space-y-6 pb-12">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={handleBackToList}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-stone-200 hover:text-white border border-stone-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Wróć do listy użytkowników</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyUserLink(selectedUser.username)}
              className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700/80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Kopiuj publiczny link do oferty tego użytkownika"
            >
              {copiedLinkUser === selectedUser.username ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{copiedLinkUser === selectedUser.username ? 'Skopiowano link!' : 'Udostępnij link'}</span>
            </button>

            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-emerald-300 border border-stone-700/80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Otwórz publiczny podgląd kupującego w nowej karcie"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Podgląd oferty</span>
            </a>
          </div>
        </div>

        {/* Seller Banner */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-blue-600 border border-emerald-400/40 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-emerald-950/60 ring-2 ring-emerald-500/20">
                {selectedUser.username.charAt(0).toUpperCase()}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    @{selectedUser.username}
                  </h2>
                  {currentUser?.id === selectedUser.id && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                      To Twoje konto
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                    Oferta na Sprzedaż
                  </span>
                </div>
                <p className="text-xs text-stone-400 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-stone-500" />
                  <span>Konto zarejestrowane: {formatJoinDate(selectedUser.createdAt)}</span>
                </p>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-stone-800 shadow-inner">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Karty na sprzedaż</span>
                <span className="text-lg font-black text-emerald-300 font-mono">
                  {sellerOffers?.cards.reduce((sum, c) => sum + c.quantity + c.quantityFoil, 0) ?? selectedUser.forSaleCount} szt.
                </span>
              </div>

              <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-emerald-500/30 shadow-inner">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Wartość oferty</span>
                <span className="text-lg font-black text-emerald-300 font-mono">
                  {formatCurrency(selectedUserTotalValue, effSettings.currency)}
                </span>
              </div>

              {sellerOffers && sellerOffers.cards.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopySellerTextList}
                  className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-bold rounded-2xl transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  title="Skopiuj listę kart (.txt)"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>{copiedText ? 'Skopiowano listę!' : 'Kopiuj listę (.txt)'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content: Loading, Error or Cards Grid */}
        {isLoadingOffers ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-sm font-bold text-stone-400">
              Pobieranie oferty sprzedaży użytkownika @{selectedUser.username}...
            </p>
          </div>
        ) : offersError ? (
          <div className="bg-stone-900 border border-rose-800/50 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-bold text-rose-400">{offersError}</p>
            <button
              onClick={() => handleSelectUser(selectedUser)}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : !sellerOffers || sellerOffers.cards.length === 0 ? (
          <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-3xl p-12 text-center space-y-4 shadow-inner">
            <div className="w-16 h-16 rounded-2xl bg-stone-800/80 text-stone-500 mx-auto flex items-center justify-center">
              <CircleDollarSign className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-white">
                Brak kart wystawionych na sprzedaż
              </h3>
              <p className="text-xs text-stone-400">
                Użytkownik @{selectedUser.username} nie posiada aktualnie żadnych kart w kategorii „Sprzedam”.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBackToList}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 rounded-xl text-xs font-semibold cursor-pointer"
            >
              ← Zobacz innych użytkowników
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filter & Sort Bar */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Search within seller cards */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input
                  type="text"
                  value={cardSearchQuery}
                  onChange={(e) => setCardSearchQuery(e.target.value)}
                  placeholder={`Szukaj w ofercie @${selectedUser.username}...`}
                  className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCardFoilOnly((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    cardFoilOnly
                      ? 'bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border-amber-500/40 shadow'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tylko Foil</span>
                </button>

                <select
                  value={cardConditionFilter}
                  onChange={(e) => setCardConditionFilter(e.target.value)}
                  className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
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
                    value={cardSortBy}
                    onChange={(e) => setCardSortBy(e.target.value as any)}
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
              {displayedCards.map((item) => {
                const card = item.card;
                const imageUri = getCardImageUri(card, 'normal');
                const rarityColor = getRarityColor(card.rarity);
                const isFoil = item.quantityFoil > 0;
                const effectivePrice =
                  item.salePrice !== undefined && item.salePrice !== null
                    ? item.salePrice
                    : getCardPrice(card, isFoil, effSettings);
                const rank = getCardEdhrecRank(card);

                return (
                  <div
                    key={item.id}
                    className="group relative bg-stone-900 rounded-2xl border border-stone-800 hover:border-emerald-500/50 transition-all duration-300 overflow-hidden flex flex-col shadow-md hover:shadow-xl hover:shadow-emerald-950/20"
                  >
                    {/* Foil Badge */}
                    {isFoil && (
                      <div className="absolute top-0 right-0 z-10 bg-gradient-to-l from-amber-500 via-purple-500 to-blue-500 text-stone-950 font-extrabold text-[10px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 uppercase tracking-wider">
                        <Sparkles className="w-3 h-3 fill-stone-950" />
                        <span>Foil</span>
                      </div>
                    )}

                    {/* Condition badge */}
                    <div className="absolute top-2 left-2 z-10 bg-stone-950/85 backdrop-blur-md text-stone-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-stone-800 shadow">
                      {item.condition} • {item.language}
                    </div>

                    {/* Image */}
                    <div
                      onClick={() => onViewCardDetails?.(card)}
                      className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-stone-950 cursor-pointer group-hover:brightness-105 transition-all"
                    >
                      <img
                        src={imageUri}
                        alt={card.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => handleCardImageError(e, imageUri)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />

                      {/* Hover action overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="px-3 py-1.5 rounded-full bg-stone-900/90 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 shadow-lg">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Szczegóły Scryfall</span>
                        </div>
                      </div>

                      {/* EDHREC Rank */}
                      {rank !== null && (
                        <div className="absolute bottom-2 left-2 z-10">
                          <EdhrecBadge rank={rank} />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h4
                          onClick={() => onViewCardDetails?.(card)}
                          className="font-bold text-xs text-stone-100 hover:text-amber-300 cursor-pointer line-clamp-1 transition-colors"
                          title={card.name}
                        >
                          {card.name}
                        </h4>

                        <div className="flex items-center justify-between gap-1 text-[11px] text-stone-400 mt-1">
                          <span className="truncate max-w-[110px] uppercase font-mono text-[10px]">
                            {card.set} • #{card.collector_number}
                          </span>
                          <span className={`capitalize font-semibold text-[10px] ${rarityColor}`}>
                            {getRarityLabel(card.rarity)}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Price and Qty */}
                      <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                        <span className="font-mono text-stone-400 text-[11px]">
                          Ilość: <strong className="text-stone-200">{item.quantity + item.quantityFoil}x</strong>
                        </span>

                        <div className="text-right">
                          <span className="font-mono font-black text-emerald-300 text-sm">
                            {formatCurrency(effectivePrice, effSettings.currency)}
                          </span>
                          {item.salePrice !== undefined && item.salePrice !== null && (
                            <span className="block text-[9px] text-emerald-400/80 font-mono">Cena sprzedawcy</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN VIEW: Registered Users Directory
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/10 via-purple-600/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 border border-blue-400/40 flex items-center justify-center shadow-lg shadow-blue-950/60">
                <Users className="w-6 h-6 text-white stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Społeczność & Użytkownicy
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    {stats.totalUsers} graczy
                  </span>
                </div>
                <p className="text-xs text-stone-400">
                  Przeglądaj zarejestrowanych graczy i ich karty wystawione na sprzedaż
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <div className="flex items-baseline gap-1.5 bg-stone-950/80 px-3 py-1.5 rounded-xl border border-stone-800">
                <span className="text-[11px] uppercase font-bold text-stone-400">Aktywni sprzedawcy:</span>
                <span className="text-sm font-extrabold font-mono text-emerald-400">
                  {stats.sellersCount}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 bg-stone-950/80 px-3 py-1.5 rounded-xl border border-stone-800">
                <span className="text-[11px] uppercase font-bold text-stone-400">Karty na sprzedaż:</span>
                <span className="text-sm font-extrabold font-mono text-amber-300">
                  {stats.totalCardsOnSale} szt.
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadUsers}
              disabled={isLoading}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              title="Odśwież listę użytkowników"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">Odśwież</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj gracza po nazwie lub emailu..."
            className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterForSaleOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              filterForSaleOnly
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow'
                : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
            }`}
          >
            <CircleDollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tylko z kartami na sprzedaż</span>
          </button>

          <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
            >
              <option value="sale-desc">Karty na sprzedaż (najwięcej)</option>
              <option value="created-desc">Data dołączenia (najnowsi)</option>
              <option value="name">Nazwa gracza (A-Z)</option>
              <option value="cards-desc">Wielkość kolekcji (ogółem)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Users List Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
          <p className="text-sm font-bold text-stone-400">Ładowanie zarejestrowanych graczy...</p>
        </div>
      ) : error ? (
        <div className="bg-stone-900 border border-rose-800/50 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-bold text-rose-400">{error}</p>
          <button
            onClick={loadUsers}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold"
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-3xl p-12 text-center space-y-3 shadow-inner">
          <div className="w-16 h-16 rounded-2xl bg-stone-800/80 text-stone-500 mx-auto flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">Nie znaleziono użytkowników</h3>
          <p className="text-xs text-stone-400">
            {searchQuery || filterForSaleOnly
              ? 'Żaden użytkownik nie spełnia wybranych kryteriów wyszukiwania.'
              : 'Brak zarejestrowanych użytkowników w systemie.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((u) => {
            const isSelf = currentUser?.id === u.id;
            const hasForSale = u.forSaleCount > 0;

            return (
              <div
                key={u.id}
                onClick={() => handleSelectUser(u)}
                className="group relative bg-stone-900 rounded-2xl border border-stone-800 hover:border-blue-500/50 p-5 shadow-lg hover:shadow-xl hover:shadow-blue-950/20 transition-all duration-300 flex flex-col justify-between cursor-pointer space-y-4"
              >
                {/* Top Section: Avatar & Details */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 border border-blue-400/30 flex items-center justify-center text-white text-lg font-black shadow-md shadow-blue-950/50 group-hover:scale-105 transition-transform">
                        {u.username.charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-stone-100 group-hover:text-blue-300 text-sm transition-colors">
                            @{u.username}
                          </h3>
                        </div>
                        <p className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-stone-500" />
                          <span>Dołączył: {formatJoinDate(u.createdAt)}</span>
                        </p>
                      </div>
                    </div>

                    {isSelf && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                        Ty
                      </span>
                    )}
                  </div>

                  {/* Badges & Metrics */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col justify-center ${
                        hasForSale
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : 'bg-stone-950/60 border-stone-800/80 text-stone-400'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 flex items-center gap-1">
                        <CircleDollarSign className="w-3 h-3 text-emerald-400" />
                        <span>Sprzedaż</span>
                      </span>
                      <span className="text-sm font-black font-mono mt-0.5">
                        {hasForSale ? `${u.forSaleCount} szt.` : 'Brak'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-stone-950/60 border border-stone-800/80 text-stone-300 flex flex-col justify-center">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-amber-400" />
                        <span>Kolekcja</span>
                      </span>
                      <span className="text-sm font-black font-mono mt-0.5 text-stone-200">
                        {u.totalCardsCount} szt.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectUser(u);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      hasForSale
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950/50'
                        : 'bg-stone-800 hover:bg-stone-750 text-stone-300'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{hasForSale ? 'Przeglądaj ofertę' : 'Zobacz profil'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleCopyUserLink(u.username, e)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-emerald-300 hover:bg-stone-800 transition-colors cursor-pointer border border-transparent hover:border-stone-700"
                    title={`Kopiuj publiczny link do oferty użytkownika @${u.username}`}
                  >
                    {copiedLinkUser === u.username ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
