import { PageHeader } from './ui/PageHeader';
import { publicUrl } from '../utils/publicLinks';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RegisteredUserSummary, AppSettings, AuthUser, CollectionItem, ScryfallCard, WishlistItem, WishlistMatches } from '../types';
import { usersApi, publicSaleApi, sellersApi } from '../services/api';
import { useBackToClose } from '../hooks/useBackButton';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  Users, 
  Search, 
  CircleDollarSign, 
  ShoppingBag, 
  Share2, 
  Check, 
  ExternalLink, 
  ArrowLeft, 
  RefreshCw, 
  Calendar, 
  MapPin,
  Layers, 
  Sparkles, 
  Eye, 
  FileText,
  ArrowUpDown,
  FolderHeart,
  Heart,
  Mail
} from 'lucide-react';
import { SendMessageModal } from './messages/SendMessageModal';
import { useT, locale, plural } from '../i18n';

interface UsersListProps {
  settings: AppSettings;
  currentUser?: AuthUser | null;
  onViewCardDetails?: (card: ScryfallCard) => void;
  showToast?: (message: string) => void;
  /** Profil do automatycznego otwarcia (np. po kliknięciu sprzedawcy na mapie). */
  profileRequest?: { username: string; nonce: number } | null;
  onProfileRequestHandled?: () => void;
}

export const UsersList: React.FC<UsersListProps> = ({
  settings,
  currentUser,
  onViewCardDetails,
  showToast,
  profileRequest,
  onProfileRequestHandled,
}) => {
  const t = useT();
  const [users, setUsers] = useState<RegisteredUserSummary[]>([]);
  // Ile kart z MOJEJ listy życzeń ma każdy użytkownik (w kolekcji / na sprzedaż)
  const [matches, setMatches] = useState<WishlistMatches>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterForSaleOnly, setFilterForSaleOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'matches-desc' | 'sale-desc' | 'wishlist-desc' | 'created-desc' | 'name' | 'cards-desc'>('matches-desc');

  // Selected user profile state
  const [selectedUser, setSelectedUser] = useState<RegisteredUserSummary | null>(null);
  const [profileTab, setProfileTab] = useState<'for-sale' | 'wishlist'>('for-sale');

  // For-sale cards state for selected user
  const [sellerOffers, setSellerOffers] = useState<{
    seller: { id: string; username: string; createdAt?: string };
    cards: CollectionItem[];
    settings: AppSettings;
  } | null>(null);
  const [isLoadingOffers, setIsLoadingOffers] = useState<boolean>(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  // Wishlist state for selected user
  const [userWishlist, setUserWishlist] = useState<WishlistItem[] | null>(null);
  const [isLoadingWishlist, setIsLoadingWishlist] = useState<boolean>(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);

  // Selected seller filter states (for-sale tab)
  const [cardSearchQuery, setCardSearchQuery] = useState<string>('');
  const [cardConditionFilter, setCardConditionFilter] = useState<string>('all');
  const [cardFoilOnly, setCardFoilOnly] = useState<boolean>(false);
  const [cardSortBy, setCardSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');

  // Wishlist filter states (wishlist tab)
  const [wishlistSearchQuery, setWishlistSearchQuery] = useState<string>('');
  const [wishlistFoilOnly, setWishlistFoilOnly] = useState<boolean>(false);
  const [wishlistSortBy, setWishlistSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');

  const [copiedLinkUser, setCopiedLinkUser] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedWishlistText, setCopiedWishlistText] = useState<boolean>(false);

  // Send message modal state
  const [sendMessageRecipient, setSendMessageRecipient] = useState<RegisteredUserSummary | null>(null);
  const [isSendMessageOpen, setIsSendMessageOpen] = useState<boolean>(false);
  const [sendMessageSubject, setSendMessageSubject] = useState<string>('');

  const handleOpenSendMessage = (user: RegisteredUserSummary, e?: React.MouseEvent, subject = '') => {
    if (e) e.stopPropagation();
    setSendMessageRecipient(user);
    setSendMessageSubject(subject);
    setIsSendMessageOpen(true);
  };

  // Load all registered users
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (err: any) {
      console.error('Error loading users:', err);
      setError(err.message || t('Nie udało się pobrać listy użytkowników.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    sellersApi.getWishlistMatches().then(setMatches).catch(() => setMatches({}));
  }, [loadUsers]);

  // Load offers for a selected user
  const loadOffers = useCallback(async (userRef: string) => {
    setIsLoadingOffers(true);
    setOffersError(null);
    try {
      const data = await publicSaleApi.getOffers(userRef);
      setSellerOffers(data);
    } catch (err: any) {
      console.error('Error fetching seller offers:', err);
      setOffersError(err.message || t('Nie udało się pobrać oferty sprzedaży tego użytkownika.'));
      setSellerOffers(null);
    } finally {
      setIsLoadingOffers(false);
    }
  }, []);

  // Load wishlist for a selected user
  const loadWishlist = useCallback(async (userRef: string) => {
    setIsLoadingWishlist(true);
    setWishlistError(null);
    try {
      const data = await usersApi.getWishlist(userRef);
      setUserWishlist(data.wishlist || []);
    } catch (err: any) {
      console.error('Error fetching user wishlist:', err);
      setWishlistError(err.message || t('Nie udało się pobrać listy życzeń tego użytkownika.'));
      setUserWishlist(null);
    } finally {
      setIsLoadingWishlist(false);
    }
  }, []);

  // Open profile with specific tab
  const handleOpenUserProfile = useCallback((user: RegisteredUserSummary, tab: 'for-sale' | 'wishlist' = 'for-sale') => {
    setSelectedUser(user);
    setProfileTab(tab);
    setCardSearchQuery('');
    setCardConditionFilter('all');
    setCardFoilOnly(false);
    setWishlistSearchQuery('');
    setWishlistFoilOnly(false);

    loadOffers(user.username || user.id);
    loadWishlist(user.username || user.id);
  }, [loadOffers, loadWishlist]);

  // Otwarcie profilu na życzenie (np. kliknięcie sprzedawcy na mapie) — gdy lista jest już wczytana
  useEffect(() => {
    if (!profileRequest || users.length === 0) return;
    const ref = profileRequest.username.toLowerCase();
    const user = users.find((u) => u.username.toLowerCase() === ref);
    if (user) handleOpenUserProfile(user, 'for-sale');
    onProfileRequestHandled?.();
  }, [profileRequest, users, handleOpenUserProfile, onProfileRequestHandled]);

  const handleBackToList = () => {
    setSelectedUser(null);
    setSellerOffers(null);
    setUserWishlist(null);
    setOffersError(null);
    setWishlistError(null);
  };

  // „Wstecz” w profilu gracza wraca do listy
  useBackToClose(Boolean(selectedUser), handleBackToList);

  const handleCopyUserLink = (username: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = publicUrl('sale', username);
    navigator.clipboard.writeText(url);
    setCopiedLinkUser(username);
    showToast?.(t('Skopiowano publiczny link do oferty użytkownika @{name}!', { name: username }));
    setTimeout(() => setCopiedLinkUser(null), 2500);
  };

  // Filtered & sorted users list
  const filteredUsers = useMemo(() => {
    return users
      .filter((u) => {
        if (filterForSaleOnly && u.forSaleCount <= 0) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return u.username.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'matches-desc') {
          // Najpierw karty z mojej listy życzeń wystawione na sprzedaż, potem posiadane w kolekcji
          const ma = matches[a.id] || { forSale: 0, collection: 0 };
          const mb = matches[b.id] || { forSale: 0, collection: 0 };
          return mb.forSale - ma.forSale || mb.collection - ma.collection || b.forSaleCount - a.forSaleCount;
        }
        if (sortBy === 'sale-desc') {
          return b.forSaleCount - a.forSaleCount;
        }
        if (sortBy === 'wishlist-desc') {
          return (b.wishlistCount || 0) - (a.wishlistCount || 0);
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
  }, [users, searchQuery, filterForSaleOnly, sortBy, matches]);

  // Total stats for the community
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const sellersCount = users.filter((u) => u.forSaleCount > 0).length;
    const totalCardsOnSale = users.reduce((sum, u) => sum + u.forSaleCount, 0);
    const totalWishlistItems = users.reduce((sum, u) => sum + (u.wishlistCount || 0), 0);
    return { totalUsers, sellersCount, totalCardsOnSale, totalWishlistItems };
  }, [users]);

  // Filtered & sorted cards for the currently selected user (for-sale tab)
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

  // Filtered & sorted wishlist items for selected user
  const displayedWishlist = useMemo(() => {
    if (!userWishlist) return [];
    return userWishlist
      .filter((item) => {
        if (!wishlistSearchQuery.trim()) return true;
        const q = wishlistSearchQuery.toLowerCase().trim();
        return (
          item.card.name.toLowerCase().includes(q) ||
          (item.card.type_line && item.card.type_line.toLowerCase().includes(q)) ||
          item.card.set.toLowerCase().includes(q) ||
          item.card.set_name.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        );
      })
      .filter((item) => {
        if (!wishlistFoilOnly) return true;
        return item.isFoil;
      })
      .sort((a, b) => {
        const effSettings = sellerOffers?.settings || settings;
        if (wishlistSortBy === 'price-desc') {
          const valA = getCardPrice(a.card, a.isFoil, effSettings);
          const valB = getCardPrice(b.card, b.isFoil, effSettings);
          return valB - valA;
        }
        if (wishlistSortBy === 'price-asc') {
          const valA = getCardPrice(a.card, a.isFoil, effSettings);
          const valB = getCardPrice(b.card, b.isFoil, effSettings);
          return valA - valB;
        }
        if (wishlistSortBy === 'name') {
          return a.card.name.localeCompare(b.card.name);
        }
        if (wishlistSortBy === 'edhrec') {
          const rankA = a.card.edhrec_rank ?? 999999;
          const rankB = b.card.edhrec_rank ?? 999999;
          return rankA - rankB;
        }
        return 0;
      });
  }, [userWishlist, wishlistSearchQuery, wishlistFoilOnly, wishlistSortBy, sellerOffers, settings]);

  const selectedUserWishlistCost = useMemo(() => {
    if (!userWishlist) return 0;
    const effSettings = sellerOffers?.settings || settings;
    return userWishlist.reduce((sum, item) => {
      const price = getCardPrice(item.card, item.isFoil, effSettings);
      return sum + price * (item.targetQuantity || 1);
    }, 0);
  }, [userWishlist, sellerOffers, settings]);

  const selectedUserWishlistCount = useMemo(() => {
    if (!userWishlist) return 0;
    return userWishlist.reduce((sum, item) => sum + (item.targetQuantity || 1), 0);
  }, [userWishlist]);

  // Export handlers
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
        return `${totalQty}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} [${item.condition}, ${item.language}] - ${price}`;
      })
      .join('\n');

    const shareUrl = publicUrl('sale', sellerOffers.seller.username);
    const header = `=== ${t('KARTY NA SPRZEDAŻ OD:')} @${sellerOffers.seller.username} ===\n${t('Łącznie: {n} pozycji', { n: sellerOffers.cards.length })} | ${t('Wartość:')} ${formatCurrency(selectedUserTotalValue, effSettings.currency)}\n${t('Publiczny link:')} ${shareUrl}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedText(true);
    showToast?.(t('Skopiowano listę kart (.txt) użytkownika @{name} do schowka!', { name: sellerOffers.seller.username }));
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleCopyWishlistTextList = () => {
    if (!userWishlist || userWishlist.length === 0 || !selectedUser) return;
    const effSettings = sellerOffers?.settings || settings;
    const textList = userWishlist
      .map((item) => {
        const foilTag = item.isFoil ? ' [FOIL]' : '';
        const price = formatCurrency(getCardPrice(item.card, item.isFoil, effSettings), effSettings.currency);
        return `${item.targetQuantity || 1}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} - ${price}${item.notes ? ` (${t('Notatka:')} ${item.notes})` : ''}`;
      })
      .join('\n');

    const header = `=== ${t('LISTA ŻYCZEŃ UŻYTKOWNIKA')} @${selectedUser.username} ===\n${t('Szacowany koszt:')} ${formatCurrency(selectedUserWishlistCost, effSettings.currency)} | ${t('Liczba kart:')} ${selectedUserWishlistCount} ${t('szt.')}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedWishlistText(true);
    showToast?.(t('Skopiowano listę życzeń użytkownika @{name} do schowka!', { name: selectedUser.username }));
    setTimeout(() => setCopiedWishlistText(false), 2500);
  };

  // Helper to format date
  const formatJoinDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return t('Niedawno');
    }
  };

  // -------------------------------------------------------------
  // DETAIL VIEW: Viewing specific user's profile (sale & wishlist)
  // -------------------------------------------------------------
  // Okno wiadomości: dostępne w liście graczy i w profilu sprzedawcy
  const sendMessageModal = isSendMessageOpen ? (
    <SendMessageModal
      isOpen={isSendMessageOpen}
      onClose={() => {
        setIsSendMessageOpen(false);
        setSendMessageRecipient(null);
        setSendMessageSubject('');
      }}
      recipient={sendMessageRecipient}
      availableUsers={users}
      initialSubject={sendMessageSubject}
      showToast={showToast}
    />
  ) : null;

  if (selectedUser) {
    const effSettings = sellerOffers?.settings || settings;
    const profileSaleUrl = publicUrl('sale', selectedUser.username);
    const forSaleBadgeCount = sellerOffers?.cards.reduce((sum, c) => sum + c.quantity + c.quantityFoil, 0) ?? selectedUser.forSaleCount;
    const wishlistBadgeCount = userWishlist ? selectedUserWishlistCount : (selectedUser.wishlistCount || 0);

    return (
      <div className="space-y-6 pb-12">
        {/* Navigation Top Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={handleBackToList}
            className="btn btn-ghost -ml-3 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>{t('Wszyscy gracze')}</span>
          </button>

          <div className="flex items-center gap-2">
            {currentUser && currentUser.id !== selectedUser.id && (
              <button
                type="button"
                onClick={() => handleOpenSendMessage(selectedUser)}
                className="btn btn-primary"
                title={t('Napisz wiadomość do @{name}', { name: selectedUser.username })}
              >
                <Mail className="w-4 h-4" />
                <span>{profileTab === 'for-sale' ? t('Napisz do sprzedawcy') : t('Napisz wiadomość')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCopyUserLink(selectedUser.username)}
              className="btn btn-secondary"
              title={t('Kopiuj publiczny link do oferty tego użytkownika')}
            >
              {copiedLinkUser === selectedUser.username ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span>{copiedLinkUser === selectedUser.username ? t('Skopiowano link!') : t('Udostępnij ofertę')}</span>
            </button>

            <a
              href={profileSaleUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              title={t('Otwórz publiczny podgląd kupującego w nowej karcie')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('Podgląd kupującego')}</span>
            </a>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-stone-800 text-stone-100 text-xl font-semibold flex items-center justify-center shrink-0">
              {selectedUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-50 truncate">
                {selectedUser.username}
                {currentUser?.id === selectedUser.id && <span className="ml-2 text-sm font-normal text-stone-500">{t('(Twoje konto)')}</span>}
              </h2>
              <p className="text-sm text-stone-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {t('Na Mana Screw od {date}', { date: formatJoinDate(selectedUser.createdAt) })}
              </p>
            </div>
          </div>

          <div role="tablist" aria-label={t('Profil gracza')} className="flex items-center gap-1 border-b border-stone-800">
            {([
              { id: 'for-sale', label: t('Na sprzedaż'), icon: CircleDollarSign, count: forSaleBadgeCount, tone: 'text-emerald-400' },
              { id: 'wishlist', label: t('Lista życzeń'), icon: FolderHeart, count: wishlistBadgeCount, tone: 'text-rose-400' }
            ] as const).map((tab) => {
              const active = profileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setProfileTab(tab.id)}
                  className={`-mb-px h-11 px-3 flex items-center gap-2 text-sm border-b-2 cursor-pointer ${
                    active ? 'border-amber-400 text-stone-50 font-medium' : 'border-transparent text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 ${active ? tab.tone : 'text-stone-500'}`} />
                  {tab.label}
                  <span className="text-xs text-stone-500 tabular-nums">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: KARTY NA SPRZEDAŻ                                      */}
        {/* ------------------------------------------------------------- */}
        {profileTab === 'for-sale' && (
          <div className="space-y-4">
            {isLoadingOffers ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <p className="text-sm font-bold text-stone-400">
                  {t('Pobieranie oferty sprzedaży użytkownika @{name}...', { name: selectedUser.username })}
                </p>
              </div>
            ) : offersError ? (
              <div className="bg-stone-900 border border-rose-800/50 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-bold text-rose-400">{offersError}</p>
                <button
                  onClick={() => loadOffers(selectedUser.username || selectedUser.id)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold"
                >
                  {t('Spróbuj ponownie')}
                </button>
              </div>
            ) : !sellerOffers || sellerOffers.cards.length === 0 ? (
              <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4 shadow-inner">
                <div className="w-16 h-16 rounded-2xl bg-stone-800/80 text-stone-500 mx-auto flex items-center justify-center">
                  <CircleDollarSign className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-bold text-white">
                    {t('Brak kart wystawionych na sprzedaż')}
                  </h3>
                  <p className="text-xs text-stone-400">
                    {t('Użytkownik @{name} nie posiada aktualnie żadnych kart w kategorii „Sprzedam”.', { name: selectedUser.username })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileTab('wishlist')}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <FolderHeart className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('Zobacz listę życzeń użytkownika')}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header Sub-bar with Value & Copy .txt */}
                <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-stone-400">
                      {t('Wycena oferty:')} <strong className="text-emerald-300 tabular-nums text-sm">{formatCurrency(selectedUserTotalValue, effSettings.currency)}</strong>
                    </span>
                    <span className="text-xs text-stone-500">•</span>
                    <span className="text-xs text-stone-400">
                      {t('Pozycji:')} <strong className="text-stone-200 tabular-nums">{sellerOffers.cards.length}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopySellerTextList}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm self-start sm:self-auto"
                    title={t('Skopiuj listę kart (.txt)')}
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{copiedText ? t('Skopiowano listę!') : t('Kopiuj listę (.txt)')}</span>
                  </button>
                </div>

                {/* Filter & Sort Bar */}
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                    <input
                      type="text"
                      value={cardSearchQuery}
                      onChange={(e) => setCardSearchQuery(e.target.value)}
                      placeholder={t('Szukaj w ofercie @{name}...', { name: selectedUser.username })}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCardFoilOnly((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        cardFoilOnly
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                          : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('Tylko foil')}</span>
                    </button>

                    <select
                      value={cardConditionFilter}
                      onChange={(e) => setCardConditionFilter(e.target.value)}
                      className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="all">{t('Wszystkie stany')}</option>
                      <option value="NM">{t('Stan NM (Near Mint)')}</option>
                      <option value="EX">{t('Stan EX (Excellent)')}</option>
                      <option value="GD">{t('Stan GD (Good)')}</option>
                      <option value="LP">{t('Stan LP (Light Played)')}</option>
                      <option value="PL">{t('Stan PL (Played)')}</option>
                    </select>

                    <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300">
                      <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                      <select
                        value={cardSortBy}
                        onChange={(e) => setCardSortBy(e.target.value as any)}
                        className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
                      >
                        <option value="price-desc">{t('Cena: Najwyższa')}</option>
                        <option value="price-asc">{t('Cena: Najniższa')}</option>
                        <option value="name">{t('Nazwa A-Z')}</option>
                        <option value="edhrec">{t('Popularność EDHREC')}</option>
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
                        {isFoil && (
                          <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
                            <Sparkles className="w-3 h-3 fill-stone-950" />
                            <span>{t('Foil')}</span>
                          </div>
                        )}

                        <div className="absolute top-2 left-2 z-10 bg-stone-950/85 backdrop-blur-md text-stone-200 text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-full border border-stone-800 shadow">
                          {item.condition} • {item.language}
                        </div>

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

                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <div className="px-3 py-1.5 rounded-full bg-stone-900/90 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 shadow-lg">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('Szczegóły Scryfall')}</span>
                            </div>
                          </div>

                          {rank !== null && (
                            <div className="absolute bottom-2 left-2 z-10">
                              <EdhrecBadge rank={rank} />
                            </div>
                          )}
                        </div>

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
                              <span className="truncate max-w-[110px] tabular-nums text-[11px]">
                                {card.set.toUpperCase()} • #{card.collector_number}
                              </span>
                              <span className={`capitalize font-semibold text-[11px] ${rarityColor}`}>
                                {getRarityLabel(card.rarity)}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                            <span className="tabular-nums text-stone-400 text-[11px] flex items-center gap-1.5">
                              {t('Ilość:')} <strong className="text-stone-200">{item.quantity + item.quantityFoil}x</strong>
                              {currentUser && currentUser.id !== selectedUser.id && (
                                <button
                                  type="button"
                                  onClick={(e) =>
                                    handleOpenSendMessage(selectedUser, e, t('Pytanie o kartę: {card}', { card: `${item.card.name} (${item.card.set.toUpperCase()})` }))
                                  }
                                  className="ml-1 w-7 h-7 rounded-md flex items-center justify-center text-stone-400 hover:text-amber-300 hover:bg-stone-800 cursor-pointer"
                                  title={t('Napisz do sprzedawcy o tej karcie')}
                                  aria-label={t('Napisz do sprzedawcy o karcie {name}', { name: item.card.name })}
                                >
                                  <Mail className="w-4 h-4" />
                                </button>
                              )}
                            </span>

                            <div className="text-right">
                              <span className="tabular-nums font-bold text-emerald-300 text-sm">
                                {formatCurrency(effectivePrice, effSettings.currency)}
                              </span>
                              {item.salePrice !== undefined && item.salePrice !== null && (
                                <span className="block text-[11px] text-emerald-400/80 tabular-nums">{t('Cena sprzedawcy')}</span>
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
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: LISTA ŻYCZEŃ (WISHLIST)                                */}
        {/* ------------------------------------------------------------- */}
        {profileTab === 'wishlist' && (
          <div className="space-y-4">
            {isLoadingWishlist ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
                <p className="text-sm font-bold text-stone-400">
                  {t('Pobieranie listy życzeń użytkownika @{name}...', { name: selectedUser.username })}
                </p>
              </div>
            ) : wishlistError ? (
              <div className="bg-stone-900 border border-rose-800/50 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-bold text-rose-400">{wishlistError}</p>
                <button
                  onClick={() => loadWishlist(selectedUser.username || selectedUser.id)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold"
                >
                  {t('Spróbuj ponownie')}
                </button>
              </div>
            ) : !userWishlist || userWishlist.length === 0 ? (
              <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4 shadow-inner">
                <div className="w-16 h-16 rounded-2xl bg-stone-800/80 text-rose-400/60 mx-auto flex items-center justify-center">
                  <FolderHeart className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-bold text-white">
                    {t('Lista życzeń jest pusta')}
                  </h3>
                  <p className="text-xs text-stone-400">
                    {t('Użytkownik @{name} nie posiada jeszcze żadnych kart na swojej liście życzeń.', { name: selectedUser.username })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileTab('for-sale')}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <CircleDollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('Zobacz karty na sprzedaż')}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header Sub-bar with Value & Copy .txt */}
                <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-stone-400">
                      {t('Szacowany koszt rynkowy:')} <strong className="text-emerald-300 tabular-nums text-sm">{formatCurrency(selectedUserWishlistCost, effSettings.currency)}</strong>
                    </span>
                    <span className="text-xs text-stone-500">•</span>
                    <span className="text-xs text-stone-400">
                      {t('Poszukiwanych kart:')} <strong className="text-rose-300 tabular-nums">{selectedUserWishlistCount} {t('szt.')}</strong> ({plural(userWishlist.length, ['{n} pozycja', '{n} pozycje', '{n} pozycji'], ['{n} entry', '{n} entries'])})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyWishlistTextList}
                    className="px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm self-start sm:self-auto"
                    title={t('Skopiuj listę życzeń (.txt)')}
                  >
                    {copiedWishlistText ? <Check className="w-3.5 h-3.5 text-rose-400" /> : <FileText className="w-3.5 h-3.5 text-rose-400" />}
                    <span>{copiedWishlistText ? t('Skopiowano listę!') : t('Kopiuj listę życzeń (.txt)')}</span>
                  </button>
                </div>

                {/* Filter & Sort Bar */}
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                    <input
                      type="text"
                      value={wishlistSearchQuery}
                      onChange={(e) => setWishlistSearchQuery(e.target.value)}
                      placeholder={t('Szukaj na liście życzeń @{name}...', { name: selectedUser.username })}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-rose-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setWishlistFoilOnly((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        wishlistFoilOnly
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                          : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('Tylko foil')}</span>
                    </button>

                    <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300">
                      <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
                      <select
                        value={wishlistSortBy}
                        onChange={(e) => setWishlistSortBy(e.target.value as any)}
                        className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
                      >
                        <option value="price-desc">{t('Cena: Najwyższa')}</option>
                        <option value="price-asc">{t('Cena: Najniższa')}</option>
                        <option value="name">{t('Nazwa A-Z')}</option>
                        <option value="edhrec">{t('Popularność EDHREC')}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Wishlist Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {displayedWishlist.map((item) => {
                    const card = item.card;
                    const imageUri = getCardImageUri(card, 'normal');
                    const rarityColor = getRarityColor(card.rarity);
                    const isFoil = item.isFoil;
                    const effectivePrice = getCardPrice(card, isFoil, effSettings);
                    const rank = getCardEdhrecRank(card);

                    return (
                      <div
                        key={item.id}
                        className="group relative bg-stone-900 rounded-2xl border border-stone-800 hover:border-rose-500/50 transition-all duration-300 overflow-hidden flex flex-col shadow-md hover:shadow-xl hover:shadow-rose-950/20"
                      >
                        {isFoil && (
                          <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
                            <Sparkles className="w-3 h-3 fill-stone-950" />
                            <span>{t('Foil')}</span>
                          </div>
                        )}

                        <div className="absolute top-2 left-2 z-10 bg-rose-950/90 backdrop-blur-md text-rose-300 text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-full border border-rose-500/40 shadow flex items-center gap-1">
                          <Heart className="w-2.5 h-2.5 fill-rose-400 text-rose-400" />
                          <span>{t('Szuka:')} {item.targetQuantity || 1}x</span>
                        </div>

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

                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <div className="px-3 py-1.5 rounded-full bg-stone-900/90 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 shadow-lg">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('Szczegóły Scryfall')}</span>
                            </div>
                          </div>

                          {rank !== null && (
                            <div className="absolute bottom-2 left-2 z-10">
                              <EdhrecBadge rank={rank} />
                            </div>
                          )}
                        </div>

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
                              <span className="truncate max-w-[110px] tabular-nums text-[11px]">
                                {card.set.toUpperCase()} • #{card.collector_number}
                              </span>
                              <span className={`capitalize font-semibold text-[11px] ${rarityColor}`}>
                                {getRarityLabel(card.rarity)}
                              </span>
                            </div>

                            {item.notes && (
                              <p className="text-[11px] text-stone-400 italic line-clamp-1 mt-1 bg-stone-950/50 px-1.5 py-0.5 rounded border border-stone-800">
                                {item.notes}
                              </p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                            <span className="tabular-nums text-stone-400 text-[11px]">
                              {t('Szuka:')} <strong className="text-rose-300 font-bold">{item.targetQuantity || 1}x</strong>
                            </span>

                            <div className="text-right">
                              <span className="tabular-nums font-bold text-emerald-300 text-sm">
                                {formatCurrency(effectivePrice, effSettings.currency)}
                              </span>
                              <span className="block text-[11px] text-stone-500 tabular-nums">{t('Cena rynkowa')}</span>
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
        )}
          {sendMessageModal}
    </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN VIEW: Registered Users Directory
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={t('Gracze')}
        description={t('Zarejestrowani gracze, ich karty na sprzedaż i listy życzeń.')}
        meta={
          <>
            <span><span className="text-stone-100 font-medium tabular-nums">{stats.totalUsers}</span> {plural(stats.totalUsers, ['gracz', 'graczy', 'graczy'], ['player', 'players'])}</span>
            <span><span className="text-stone-100 font-medium tabular-nums">{stats.sellersCount}</span> {t('sprzedaje')}</span>
            <span><span className="text-stone-100 font-medium tabular-nums">{stats.totalCardsOnSale}</span> {t('kart na sprzedaż')}</span>
            <span><span className="text-stone-100 font-medium tabular-nums">{stats.totalWishlistItems}</span> {t('kart na listach życzeń')}</span>
          </>
        }
        actions={
          <button type="button" onClick={loadUsers} disabled={isLoading} className="btn btn-secondary" title={t('Odśwież listę graczy')}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('Odśwież')}
          </button>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Szukaj gracza po nazwie')}
            aria-label={t('Szukaj gracza po nazwie')}
            className="w-full h-10 bg-stone-900 border border-stone-800 focus:border-amber-500 rounded-lg pl-10 pr-3.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap md:ml-auto">
          <button
            type="button"
            onClick={() => setFilterForSaleOnly((prev) => !prev)}
            aria-pressed={filterForSaleOnly}
            className={`h-10 px-3 rounded-lg text-sm border flex items-center gap-2 cursor-pointer ${
              filterForSaleOnly ? 'bg-stone-800 text-stone-50 border-stone-600' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-stone-700'
            }`}
          >
            <CircleDollarSign className="w-4 h-4 text-emerald-400" />
            {t('Tylko sprzedający')}
          </button>
          <label className="h-10 flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-lg px-3 text-sm text-stone-400">
            <ArrowUpDown className="w-4 h-4" />
            <span className="sr-only">{t('Sortuj')}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-sm text-stone-200 focus:outline-none cursor-pointer"
            >
              <option value="matches-desc">{t('Najwięcej kart z mojej listy życzeń')}</option>
              <option value="sale-desc">{t('Najwięcej kart na sprzedaż')}</option>
              <option value="wishlist-desc">{t('Najdłuższa lista życzeń')}</option>
              <option value="created-desc">{t('Najnowsi gracze')}</option>
              <option value="name">{t('Nazwa gracza (A-Z)')}</option>
              <option value="cards-desc">{t('Największa kolekcja')}</option>
            </select>
          </label>
        </div>
      </div>

      {/* 3. Users List Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
          <p className="text-sm font-bold text-stone-400">{t('Ładowanie zarejestrowanych graczy...')}</p>
        </div>
      ) : error ? (
        <div className="bg-stone-900 border border-rose-800/50 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-bold text-rose-400">{error}</p>
          <button
            onClick={loadUsers}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold"
          >
            {t('Spróbuj ponownie')}
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-3 shadow-inner">
          <div className="w-16 h-16 rounded-2xl bg-stone-800/80 text-stone-500 mx-auto flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">{t('Nie znaleziono użytkowników')}</h3>
          <p className="text-xs text-stone-400">
            {searchQuery || filterForSaleOnly
              ? t('Żaden użytkownik nie spełnia wybranych kryteriów wyszukiwania.')
              : t('Brak zarejestrowanych użytkowników w systemie.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((u) => {
            const isSelf = currentUser?.id === u.id;
            const hasForSale = u.forSaleCount > 0;
            const hasWishlist = (u.wishlistCount || 0) > 0;

            const wishOwned = !isSelf ? matches[u.id]?.collection || 0 : 0;
            const wishSale = !isSelf ? matches[u.id]?.forSale || 0 : 0;
            const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 cursor-pointer';
            return (
              <article
                key={u.id}
                onClick={() => handleOpenUserProfile(u, hasForSale ? 'for-sale' : 'wishlist')}
                className="group bg-stone-900 rounded-xl border border-stone-800 hover:border-stone-700 p-4 flex flex-col gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-stone-800 text-stone-200 text-base font-semibold flex items-center justify-center shrink-0">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-stone-50 truncate">
                      {u.username}
                      {isSelf && <span className="ml-2 text-xs font-normal text-stone-500">{t('(Ty)')}</span>}
                    </h3>
                    <p className="text-xs text-stone-400 truncate">
                      {u.city ? `${u.city}, ` : ''}{t('od')} {formatJoinDate(u.createdAt)}
                    </p>
                  </div>
                </div>

                {wishSale > 0 ? (
                  <p className="text-sm text-rose-300 flex items-center gap-1.5 -mt-1">
                    <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400 shrink-0" />
                    {plural(wishSale, ['Sprzedaje {n} kartę z Twojej listy życzeń', 'Sprzedaje {n} karty z Twojej listy życzeń', 'Sprzedaje {n} kart z Twojej listy życzeń'], ['Sells {n} card from your wishlist', 'Sells {n} cards from your wishlist'])}
                  </p>
                ) : wishOwned > 0 ? (
                  <p className="text-xs text-stone-400 flex items-center gap-1.5 -mt-1" title={t('Karty są w kolekcji gracza, ale nie wystawił ich na sprzedaż. Możesz do niego napisać.')}>
                    <Heart className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                    {t('Ma {n} z Twojej listy, ale nie sprzedaje', { n: wishOwned })}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden bg-stone-800 text-sm">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenUserProfile(u, 'for-sale');
                    }}
                    className="bg-stone-900 hover:bg-stone-850 px-3 py-2 text-left cursor-pointer"
                    title={t('Zobacz karty na sprzedaż')}
                  >
                    <span className="block text-xs text-stone-400">{t('Sprzedaje')}</span>
                    <span className={`block tabular-nums font-medium ${hasForSale ? 'text-emerald-300' : 'text-stone-500'}`}>
                      {hasForSale ? kartyLabel(u.forSaleCount) : 'nic'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenUserProfile(u, 'wishlist');
                    }}
                    className="bg-stone-900 hover:bg-stone-850 px-3 py-2 text-left cursor-pointer"
                    title={t('Zobacz listę życzeń')}
                  >
                    <span className="block text-xs text-stone-400">{t('Szuka')}</span>
                    <span className={`block tabular-nums font-medium ${hasWishlist ? 'text-stone-100' : 'text-stone-500'}`}>
                      {hasWishlist ? kartyLabel(u.wishlistCount || 0) : 'nic'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-end -mr-1.5 -mt-1" onClick={(e) => e.stopPropagation()}>
                  {currentUser && currentUser.id !== u.id && (
                    <button type="button" onClick={(e) => handleOpenSendMessage(u, e)} className={iconBtn} title={t('Napisz do {name}', { name: u.username })} aria-label={t('Napisz do {name}', { name: u.username })}>
                      <Mail className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleCopyUserLink(u.username, e)}
                    className={iconBtn}
                    title={t('Kopiuj publiczny link do oferty')}
                    aria-label={t('Kopiuj publiczny link do oferty')}
                  >
                    {copiedLinkUser === u.username ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sendMessageModal}
    </div>
  );
};

/** „1 karta”, „3 karty”, „5 kart”. */
function kartyLabel(n: number): string {
  return plural(n, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards']);
}
