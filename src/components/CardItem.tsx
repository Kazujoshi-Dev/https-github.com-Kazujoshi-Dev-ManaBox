import React, { useState } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { isDigitalOnly } from '../utils/mtgFormats';
import { 
  formatCurrency, 
  getCardImageUri, 
  getCardPrice, 
  getRarityColor, 
  getRarityLabel,
  handleCardImageError,
  getCardEdhrecRank
} from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { Plus, Minus, Trash2, Edit3, ExternalLink, Sparkles, Folder, Check, Eye, Trophy, CircleDollarSign, DollarSign } from 'lucide-react';
import { useT, locale, binderName, MAIN_BINDER } from '../i18n';
import { useShowEdhrecRank } from '../utils/displayPrefs';

interface CardItemProps {
  item: CollectionItem;
  viewMode: 'grid' | 'table';
  settings: AppSettings;
  onUpdateQuantity: (id: string, deltaNormal: number, deltaFoil: number) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: CollectionItem) => void;
  onViewCardDetails: (item: CollectionItem) => void;
  onToggleForSale?: (item: CollectionItem) => void;
}

export const CardItem: React.FC<CardItemProps> = ({
  item,
  viewMode,
  settings,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onToggleForSale,
}) => {
  const t = useT();
  const { card, quantity, quantityFoil, condition, language, binder } = item;
  const imageUri = getCardImageUri(card, 'normal');
  const priceNormal = getCardPrice(card, false, settings);
  const priceFoil = getCardPrice(card, true, settings);

  // Total value for this entry using active settings
  const itemTotalValue = (quantity * priceNormal) + (quantityFoil * priceFoil);
  const totalQuantity = quantity + quantityFoil;

  const isFoilOnly = quantityFoil > 0 && quantity === 0;
  const showEdhrec = useShowEdhrecRank();
  const edhrecRank = showEdhrec ? getCardEdhrecRank(card) : null;
  const showBinderBadge = settings.showBinderBadge !== false;
  const showPriceTag = settings.showPriceTag !== false;
  const showFoilBadge = settings.showFoilBadge !== false;

  if (viewMode === 'table') {
    return (
      <tr className="hover:bg-stone-800/50 border-b border-stone-800 transition-colors text-xs text-stone-300">
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onViewCardDetails(item)} 
              className="relative group shrink-0 w-10 h-14 rounded overflow-hidden bg-stone-900 border border-stone-700 hover:border-amber-500 transition-all cursor-pointer"
            >
              <img 
                src={imageUri} 
                alt={card.name} 
                referrerPolicy="no-referrer"
                onError={(e) => handleCardImageError(e, imageUri)}
                className="w-full h-full object-contain transition-transform" 
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Eye className="w-4 h-4 text-amber-300" />
              </div>
            </button>
            <div>
              <button 
                onClick={() => onViewCardDetails(item)}
                className="font-bold text-stone-100 hover:text-amber-300 text-sm text-left transition-colors flex items-center gap-1.5"
              >
                {card.name}
                {isFoilOnly && <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 inline" />}
              </button>
              <p className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>{card.type_line}</span>
                {showBinderBadge && (
                  <span className="text-[11px] text-amber-300/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">
                    {binderName(binder || MAIN_BINDER)}
                  </span>
                )}
                {edhrecRank != null && (
                  <EdhrecBadge rank={edhrecRank} size="xs" />
                )}
              </p>
            </div>
          </div>
        </td>

        <td className="py-2.5 px-3">
          <ManaSymbol cost={card.mana_cost} size="sm" />
        </td>

        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums text-[11px] bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">
              {card.set.toUpperCase()}
            </span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${getRarityColor(card.rarity)}`}>
              {getRarityLabel(card.rarity)}
            </span>
          </div>
        </td>

        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1">
            <span className="text-stone-300 bg-stone-800 tabular-nums px-1.5 py-0.5 rounded text-[11px]">
              {condition}
            </span>
            <span className="text-stone-400 tabular-nums text-[11px]">
              [{language}]
            </span>
          </div>
        </td>

        <td className="py-2.5 px-3 tabular-nums font-medium text-stone-200">
          <div className="flex flex-col">
            <span>{formatCurrency(priceNormal, settings.currency)}</span>
            {priceFoil > 0 && (
              <span className="text-[11px] text-amber-400 flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                {formatCurrency(priceFoil, settings.currency)}
              </span>
            )}
          </div>
        </td>

        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateQuantity(item.id, -1, 0)}
              disabled={quantity <= 0 && quantityFoil <= 0}
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 flex items-center justify-center disabled:opacity-30 cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="tabular-nums font-bold text-stone-100 min-w-[24px] text-center">
              {totalQuantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(item.id, 1, 0)}
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {t('Norm:')} {quantity} | Foil: {quantityFoil}
          </div>
        </td>

        <td className="py-2.5 px-3 tabular-nums font-bold text-emerald-400">
          {formatCurrency(itemTotalValue, settings.currency)}
        </td>

        <td className="py-2.5 px-3 text-right">
          <div className="flex items-center justify-end gap-1">
            {onToggleForSale && (item.isForSale || !isDigitalOnly(item.card)) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleForSale(item);
                }}
                title={
                  item.isForSale
                    ? t('Karta oznaczona na sprzedaż (w kategorii Sprzedam). Kliknij, aby wycofać.')
                    : t('Wystaw na sprzedaż (oznacz kartę i przenieś do kategorii Sprzedam)')
                }
                className={`p-1 rounded transition-colors cursor-pointer ${
                  item.isForSale
                    ? 'text-emerald-300 bg-emerald-500/25 border border-emerald-500/50 hover:bg-emerald-500/35 shadow-sm'
                    : 'text-stone-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
            <button
              onClick={() => onEditItem(item)}
              title={t('Edytuj pozycję')}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-stone-800 rounded transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteItem(item.id)}
              title={t('Usuń z kolekcji')}
              className="p-1 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  // Grid view (3D Card Binder Tile)
  return (
    <div className="group relative bg-stone-900 rounded-xl border border-stone-800 hover:border-amber-500/50 transition-all duration-300 overflow-hidden flex flex-col shadow-md hover:shadow-xl hover:shadow-amber-900/10">
      
      {/* Foil Effect Banner if card is Foil */}
      {showFoilBadge && quantityFoil > 0 && (
        <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
          <Sparkles className="w-3 h-3 fill-stone-950" />
          <span>Foil ({quantityFoil})</span>
        </div>
      )}

      {/* For Sale Banner / Badge */}
      {item.isForSale && (
        <div className="absolute top-2 left-2 z-10 bg-emerald-950/95 text-emerald-300 border border-emerald-500/50 text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 backdrop-blur-md">
          <CircleDollarSign className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
          <span>{t('Sprzedam')}</span>
          {item.salePrice ? (
            <span className="text-[11px] text-emerald-200 tabular-nums">({formatCurrency(item.salePrice, settings.currency)})</span>
          ) : null}
        </div>
      )}

      {/* Binder badge */}
      {showBinderBadge && binder && !item.isForSale && (
        <div className="absolute top-2 left-2 z-10 bg-stone-950/80 backdrop-blur-md text-stone-300 text-[11px] px-2 py-0.5 rounded-full border border-stone-800 flex items-center gap-1 font-medium">
          <Folder className="w-2.5 h-2.5 text-amber-400" />
          <span className="truncate max-w-[100px]">{binderName(binder)}</span>
        </div>
      )}

      {/* Card Image Area */}
      <div 
        onClick={() => onViewCardDetails(item)}
        className="relative aspect-[488/680] w-full overflow-hidden bg-stone-950 cursor-pointer group-hover:brightness-105 transition-all"
      >
        <img
          src={imageUri}
          alt={card.name}
          referrerPolicy="no-referrer"
          onError={(e) => handleCardImageError(e, imageUri)}
          className="w-full h-full object-contain transition-transform duration-500"
          loading="lazy"
        />

        {/* Hover overlay with detail icon */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <div className="px-3 py-1.5 rounded-full bg-stone-900/90 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 shadow-lg">
            <Eye className="w-3.5 h-3.5" />
            <span>{t('Szczegóły Scryfall')}</span>
          </div>
        </div>

        {/* EDHREC Rank Banner in bottom-left corner (visually styled like the Foil banner) */}
        {edhrecRank != null && (
          <div 
            title={t('Ranking EDHREC: #{rank} (popularność w formacie Commander)', { rank: edhrecRank.toLocaleString(locale()) })}
            className="absolute bottom-[8%] left-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-r-lg shadow-sm flex items-center gap-1 select-none border-y border-r border-white/20"
          >
            <Trophy className="w-3 h-3 fill-stone-950 stroke-[1.5] shrink-0" />
            <span>EDH #{edhrecRank.toLocaleString(locale())}</span>
          </div>
        )}

        {/* Total Price Tag overlay on bottom right of image */}
        {showPriceTag && (
          <div className="absolute bottom-[8%] right-2 bg-stone-950/90 backdrop-blur-md px-2 py-1 rounded-lg border border-stone-800 shadow-md">
            <p className="text-[11px] font-bold text-stone-400 leading-none">{t('Wartość')}</p>
            <p className="text-xs font-bold tabular-nums text-emerald-400 leading-tight">
              {formatCurrency(itemTotalValue, settings.currency)}
            </p>
            {totalQuantity > 1 && (
              <div className="mt-0.5 pt-0.5 border-t border-stone-800 text-[11px] tabular-nums text-stone-400 leading-tight">
                {quantity > 0 && (
                  <p>{formatCurrency(priceNormal, settings.currency)} {t('/ szt.')}</p>
                )}
                {quantityFoil > 0 && (
                  <p className="flex items-center gap-0.5 text-amber-300/90">
                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    {formatCurrency(priceFoil, settings.currency)} {t('/ szt.')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Info Details */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
        <div>
          <div className="flex items-start justify-between gap-1">
            <h3 
              onClick={() => onViewCardDetails(item)}
              className="font-bold text-sm text-stone-100 hover:text-amber-300 transition-colors line-clamp-1 cursor-pointer"
            >
              {card.name}
            </h3>
            <ManaSymbol cost={card.mana_cost} size="sm" />
          </div>

          <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
            {card.type_line}
          </p>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">
              {card.set.toUpperCase()}
            </span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${getRarityColor(card.rarity)}`}>
              {getRarityLabel(card.rarity)}
            </span>
            <span className="text-[11px] text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded border border-stone-800">
              {condition} • {language}
            </span>
          </div>
        </div>

        {/* Quantity Controls & Quick Actions */}
        <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-lg border border-stone-800">
            <button
              onClick={() => onUpdateQuantity(item.id, -1, 0)}
              disabled={quantity <= 0 && quantityFoil <= 0}
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center text-xs disabled:opacity-30 cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>

            <div className="text-center px-1 tabular-nums text-xs">
              <span className="font-bold text-amber-300">{totalQuantity}</span>
              <span className="text-[11px] text-stone-400 ml-0.5">{t('szt')}</span>
            </div>

            <button
              onClick={() => onUpdateQuantity(item.id, 1, 0)}
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center text-xs cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {onToggleForSale && (item.isForSale || !isDigitalOnly(item.card)) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleForSale(item);
                }}
                title={
                  item.isForSale
                    ? t('Karta oznaczona na sprzedaż (w kategorii Sprzedam). Kliknij, aby wycofać ze sprzedaży.')
                    : t('Wystaw na sprzedaż (oznacz kartę i przenieś do kategorii Sprzedam)')
                }
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  item.isForSale
                    ? 'text-emerald-300 bg-emerald-500/25 border border-emerald-500/50 hover:bg-emerald-500/35 shadow-sm shadow-emerald-950/50'
                    : 'text-stone-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
            <button
              onClick={() => onEditItem(item)}
              title={t('Edytuj pozycję')}
              className="p-1.5 text-stone-400 hover:text-amber-300 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteItem(item.id)}
              title={t('Usuń z kolekcji')}
              className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
