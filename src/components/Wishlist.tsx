import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';

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
  showToast
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Publiczny link do listy życzeń (działa bez logowania, jak oferta w „Sprzedam”)
  const publicShareSlug = currentUser?.username || currentUser?.id || '';
  const publicShareUrl = `${window.location.origin}/?szukam=${encodeURIComponent(publicShareSlug)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicShareUrl);
      setCopiedLink(true);
      showToast?.('Skopiowano link do listy życzeń! Każdy bez konta może go otworzyć.');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showToast?.('Nie udało się skopiować. Zaznacz link i skopiuj ręcznie.');
    }
  };

  const handleCopyTextList = async () => {
    if (wishlist.length === 0) return;
    const lines = wishlist.map(item =>
      `${item.targetQuantity}x ${item.card.name} (${item.card.set.toUpperCase()})${item.isFoil ? ' [FOIL]' : ''}`
    );
    const header = `=== SZUKAM KART (${currentUser?.username || 'Gracz MTG'}) ===\nLista życzeń: ${publicShareUrl}\n\n`;
    try {
      await navigator.clipboard.writeText(header + lines.join('\n'));
      setCopiedText(true);
      showToast?.('Skopiowano listę kart (.txt) do schowka!');
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      showToast?.('Nie udało się skopiować listy.');
    }
  };

  // Calculate total estimated budget to buy all items on wishlist
  const totalWishlistCost = wishlist.reduce((acc, item) => {
    const price = getCardPrice(item.card, item.isFoil, settings);
    return acc + (price * item.targetQuantity);
  }, 0);

  return (
    <div className="space-y-6">
      
      {/* Wishlist Header Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderHeart className="w-6 h-6 text-rose-400" />
            <h2 className="text-xl font-bold text-stone-100">Lista Życzeń (Wishlist)</h2>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Karty, które chcesz w przyszłości zdobyć do swoich talii lub klasera.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-stone-950 p-3 rounded-xl border border-stone-800">
          <div>
            <p className="text-[11px] font-bold text-stone-400">Szacowany koszt</p>
            <p className="text-lg font-bold tabular-nums text-emerald-400">{formatCurrency(totalWishlistCost, settings.currency)}</p>
          </div>
          <button
            onClick={onOpenSearchTab}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Dodaj kolejne</span>
          </button>
        </div>
      </div>

      {/* Publiczny link do listy */}
      {publicShareSlug && (
        <div className="bg-stone-900 border border-rose-500/30 rounded-2xl p-4 shadow-xl flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5">
          <div className="lg:w-72 shrink-0 space-y-0.5">
            <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-rose-400" />
              <span>Publiczny link do listy życzeń</span>
            </p>
            <p className="text-[11px] text-stone-400">
              Wyślij go sprzedającym. Zobaczą, jakich kart szukasz, bez zakładania konta.
            </p>
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-2 bg-stone-950 p-2 rounded-xl border border-stone-800">
            <input
              type="text"
              readOnly
              value={publicShareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Publiczny link do listy życzeń"
              className="bg-transparent text-xs text-stone-300 tabular-nums w-full min-w-0 focus:outline-none truncate px-1"
              title={publicShareUrl}
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-9 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Skopiowano!' : 'Kopiuj'}</span>
            </button>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <a
              href={publicShareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-stone-400 hover:text-rose-300 transition-colors flex items-center gap-1 font-medium min-h-9"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Podgląd</span>
            </a>
            <button
              type="button"
              onClick={handleCopyTextList}
              disabled={wishlist.length === 0}
              className="text-xs text-stone-400 hover:text-amber-300 transition-colors flex items-center gap-1 font-medium cursor-pointer min-h-9 disabled:opacity-40 disabled:cursor-default"
              title="Skopiuj listę kart jako tekst"
            >
              {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
              <span>{copiedText ? 'Skopiowano!' : 'Kopiuj listę (.txt)'}</span>
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
            <h3 className="text-lg font-bold text-stone-200">Twoja Lista Życzeń jest pusta</h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
              Możesz dodawać upatrzone karty bezpośrednio z poziomu wyszukiwarki Scryfall API.
            </p>
          </div>
          <button
            onClick={onOpenSearchTab}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Przeglądaj karty na Scryfall</span>
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
                        {card.set}
                      </span>
                      {item.isFoil && (
                        <span className="text-[11px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Foil</span>
                        </span>
                      )}
                      <span className="text-[11px] text-stone-300 tabular-nums">
                        x{item.targetQuantity}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-stone-400">Rynkowo</p>
                      <p className="text-sm tabular-nums font-bold text-emerald-400">
                        {formatCurrency(itemTotal, settings.currency)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onMoveToCollection(item)}
                        title="Przenieś do kolekcji (kupiłem tę kartę)"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Kupiono</span>
                      </button>

                      <button
                        onClick={() => onRemoveFromWishlist(item.id)}
                        title="Usuń z listy życzeń"
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

    </div>
  );
};
