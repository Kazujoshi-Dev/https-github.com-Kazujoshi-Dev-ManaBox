import { PageHeader } from './ui/PageHeader';
import { publicUrl } from '../utils/publicLinks';
import React, { Suspense, useState } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';

const SellersMapModal = lazyWithReload(() => import('./SellersMapModal'));
import { WishlistItem, ScryfallCard, AppSettings, AuthUser } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError, getCardEdhrecRank } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import {
  FolderHeart,
  Sparkles,
  Trash2,
  Plus,
  ExternalLink,
  CheckCircle2,
  Eye,
  ArrowRightLeft,
  Share2,
  Copy,
  Check,
  FileText,
  Map as MapIcon,
  Loader2
} from 'lucide-react';
import { useT, plural } from '../i18n';

interface WishlistProps {
  wishlist: WishlistItem[];
  settings: AppSettings;
  onRemoveFromWishlist: (id: string) => void;
  onMoveToCollection: (wishlistItem: WishlistItem) => void;
  onOpenSearchTab: () => void;
  onViewCardDetails: (card: ScryfallCard) => void;
  /** Szczegóły pozycji listy — zmiany foil / wersji zapisują się na liście. */
  onViewWishlistItem?: (item: WishlistItem) => void;
  currentUser?: AuthUser | null;
  showToast?: (message: string) => void;
  /** Otwiera profil sprzedawcy (z mapy sprzedawców). */
  onOpenSellerProfile?: (username: string) => void;
}

export const Wishlist: React.FC<WishlistProps> = ({
  wishlist,
  settings,
  onRemoveFromWishlist,
  onMoveToCollection,
  onOpenSearchTab,
  onViewCardDetails,
  onViewWishlistItem,
  currentUser,
  showToast,
  onOpenSellerProfile,
}) => {
  const t = useT();
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Publiczny link do listy życzeń (działa bez logowania, jak oferta w „Sprzedam”)
  const publicShareSlug = currentUser?.username || currentUser?.id || '';
  const publicShareUrl = publicUrl('wishlist', publicShareSlug);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicShareUrl);
      setCopiedLink(true);
      showToast?.(t('Skopiowano link do listy życzeń! Każdy bez konta może go otworzyć.'));
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showToast?.(t('Nie udało się skopiować. Zaznacz link i skopiuj ręcznie.'));
    }
  };

  const handleCopyTextList = async () => {
    if (wishlist.length === 0) return;
    const lines = wishlist.map(item =>
      `${item.targetQuantity}x ${item.card.name} (${item.card.set.toUpperCase()})${item.isFoil ? ' [FOIL]' : ''}`
    );
    const header = `=== ${t('SZUKAM KART')} (${currentUser?.username || t('Gracz MTG')}) ===\n${t('Lista życzeń')}: ${publicShareUrl}\n\n`;
    try {
      await navigator.clipboard.writeText(header + lines.join('\n'));
      setCopiedText(true);
      showToast?.(t('Skopiowano listę kart (.txt) do schowka!'));
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      showToast?.(t('Nie udało się skopiować listy.'));
    }
  };

  // Calculate total estimated budget to buy all items on wishlist
  const totalWishlistCost = wishlist.reduce((acc, item) => {
    const price = getCardPrice(item.card, item.isFoil, settings);
    return acc + (price * item.targetQuantity);
  }, 0);

  return (
    <div className="space-y-6">
      
      <PageHeader
        title={t('Lista życzeń')}
        description={t('Karty, których szukasz do talii lub klasera.')}
        meta={
          <>
            <span><span className="text-stone-100 font-medium tabular-nums">{wishlist.length}</span> {plural(wishlist.length, ['pozycja', 'pozycje', 'pozycji'], ['entry', 'entries'])}</span>
            <span>{t('Szacowany koszt')} <span className="text-stone-100 font-medium tabular-nums">{formatCurrency(totalWishlistCost, settings.currency)}</span></span>
          </>
        }
        actions={
          <>
            <button type="button" onClick={() => setIsMapOpen(true)} className="btn btn-secondary" title={t('Kto w okolicy sprzedaje karty z Twojej listy')}>
              <MapIcon className="w-4 h-4" />
              {t('Mapa sprzedawców')}
            </button>
            <button type="button" onClick={onOpenSearchTab} className="btn btn-primary">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('Dodaj karty')}
            </button>
          </>
        }
      />

      {publicShareSlug && (
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-stone-300 shrink-0" title={t('Wyślij go sprzedającym. Zobaczą, jakich kart szukasz, bez zakładania konta.')}>
            <Share2 className="w-4 h-4 text-stone-400" />
            {t('Link do Twojej listy')}
          </div>
          <input
            type="text"
            readOnly
            value={publicShareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t('Publiczny link do listy życzeń')}
            className="flex-1 min-w-0 h-9 bg-stone-950 border border-stone-800 rounded-lg px-3 text-sm text-stone-300 focus:outline-none focus:border-stone-600"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={handleCopyLink} className="btn btn-primary">
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? t('Skopiowano') : t('Kopiuj link')}
            </button>
            <a href={publicShareUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" title={t('Zobacz, jak widzą listę inni')}>
              <ExternalLink className="w-4 h-4" />
              <span className="hidden lg:inline">{t('Podgląd')}</span>
            </a>
            <button type="button" onClick={handleCopyTextList} disabled={wishlist.length === 0} className="btn btn-ghost" title={t('Kopiuj listę kart jako tekst')}>
              {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
              <span className="hidden lg:inline">{copiedText ? t('Skopiowano') : t('Lista .txt')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Wishlist Items List */}
      {wishlist.length === 0 ? (
        <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-stone-800/80 mx-auto flex items-center justify-center text-rose-400">
            <FolderHeart className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-200">{t('Twoja lista życzeń jest pusta')}</h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
              {t('Możesz dodawać upatrzone karty bezpośrednio z poziomu wyszukiwarki Scryfall API.')}
            </p>
          </div>
          <button
            onClick={onOpenSearchTab}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>{t('Przeglądaj karty na Scryfall')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wishlist.map(item => {
            const card = item.card;
            const price = getCardPrice(card, item.isFoil, settings);
            const itemTotal = price * item.targetQuantity;
            const img = getCardImageUri(card, 'normal');
            const openDetails = () => (onViewWishlistItem ? onViewWishlistItem(item) : onViewCardDetails(card));

            return (
              <div
                key={item.id}
                className="bg-stone-900 rounded-xl border border-stone-800 hover:border-amber-500/40 p-4 transition-all flex gap-4 shadow-md"
              >
                <div 
                  onClick={openDetails}
                  className="w-20 h-28 shrink-0 rounded-lg overflow-hidden bg-stone-950 border border-stone-800 relative group cursor-pointer"
                >
                  <img 
                    src={img} 
                    alt={card.name} 
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, img)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Eye className="w-4 h-4 text-amber-300" />
                  </div>
                  {getCardEdhrecRank(card) != null && (
                    <div className="absolute bottom-1.5 left-1.5 z-10">
                      <EdhrecBadge rank={getCardEdhrecRank(card)} size="xs" />
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 
                        onClick={openDetails}
                        className="font-bold text-sm text-stone-100 hover:text-amber-300 transition-colors line-clamp-1 cursor-pointer"
                      >
                        {card.name}
                      </h4>
                      <ManaSymbol cost={card.mana_cost} size="sm" />
                    </div>

                    <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                      {card.type_line}
                    </p>

                    <div className="flex items-center gap-1.5 mt-2 text-xs">
                      <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">
                        {card.set.toUpperCase()}
                      </span>
                      {item.isFoil && (
                        <span className="text-[11px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>{t('Foil')}</span>
                        </span>
                      )}
                      <span className="text-[11px] text-stone-300 tabular-nums">
                        x{item.targetQuantity}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-stone-400">{t('Rynkowo')}</p>
                      <p className="text-sm tabular-nums font-bold text-emerald-400">
                        {formatCurrency(itemTotal, settings.currency)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onMoveToCollection(item)}
                        title={t('Przenieś do kolekcji (kupiłem tę kartę)')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>{t('Kupiono')}</span>
                      </button>

                      <button
                        onClick={() => onRemoveFromWishlist(item.id)}
                        title={t('Usuń z listy życzeń')}
                        className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {isMapOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          }
        >
          <SellersMapModal onClose={() => setIsMapOpen(false)} onOpenSeller={(u) => onOpenSellerProfile?.(u)} />
        </Suspense>
      )}
    </div>
  );
};
