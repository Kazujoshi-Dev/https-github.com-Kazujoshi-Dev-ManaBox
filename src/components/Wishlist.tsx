import React, { useState } from 'react';
import { WishlistItem, ScryfallCard, AppSettings } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { 
  FolderHeart, 
  Sparkles, 
  Trash2, 
  Plus, 
  ExternalLink, 
  CheckCircle2, 
  Eye, 
  ArrowRightLeft 
} from 'lucide-react';

interface WishlistProps {
  wishlist: WishlistItem[];
  settings: AppSettings;
  onRemoveFromWishlist: (id: string) => void;
  onMoveToCollection: (wishlistItem: WishlistItem) => void;
  onOpenSearchTab: () => void;
  onViewCardDetails: (card: ScryfallCard) => void;
}

export const Wishlist: React.FC<WishlistProps> = ({
  wishlist,
  settings,
  onRemoveFromWishlist,
  onMoveToCollection,
  onOpenSearchTab,
  onViewCardDetails
}) => {
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
            <p className="text-[10px] uppercase font-bold text-stone-400">Szacowany koszt</p>
            <p className="text-lg font-bold font-mono text-emerald-400">{formatCurrency(totalWishlistCost, settings.currency)}</p>
          </div>
          <button
            onClick={onOpenSearchTab}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Dodaj kolejne</span>
          </button>
        </div>
      </div>

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

            return (
              <div
                key={item.id}
                className="bg-stone-900 rounded-xl border border-stone-800 hover:border-amber-500/40 p-4 transition-all flex gap-4 shadow-md"
              >
                <div 
                  onClick={() => onViewCardDetails(card)}
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
                </div>

                <div className="flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 
                        onClick={() => onViewCardDetails(card)}
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
                      <span className="uppercase font-mono text-[10px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">
                        {card.set}
                      </span>
                      {item.isFoil && (
                        <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Foil</span>
                        </span>
                      )}
                      <span className="text-[11px] text-stone-300 font-mono">
                        x{item.targetQuantity}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] uppercase text-stone-400">Rynkowo</p>
                      <p className="text-sm font-mono font-bold text-emerald-400">
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
