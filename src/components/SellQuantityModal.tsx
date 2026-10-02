import React, { useState, useEffect } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, handleCardImageError } from '../utils/formatters';
import { CircleDollarSign, X, Plus, Minus, Sparkles, Tag, Layers } from 'lucide-react';

interface SellQuantityModalProps {
  isOpen: boolean;
  item: CollectionItem | null;
  settings: AppSettings;
  onClose: () => void;
  onConfirm: (
    item: CollectionItem,
    quantityToSell: number,
    isFoil: boolean,
    customPrice?: number | null
  ) => Promise<void> | void;
}

export const SellQuantityModal: React.FC<SellQuantityModalProps> = ({
  isOpen,
  item,
  settings,
  onClose,
  onConfirm,
}) => {
  const [selectedFinish, setSelectedFinish] = useState<'normal' | 'foil'>('normal');
  const [quantityToSell, setQuantityToSell] = useState<number>(1);
  const [customPriceInput, setCustomPriceInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && item) {
      const hasNormal = (item.quantity || 0) > 0;
      const initialFinish = hasNormal ? 'normal' : 'foil';
      setSelectedFinish(initialFinish);
      setQuantityToSell(1);
      setCustomPriceInput(
        item.salePrice !== undefined && item.salePrice !== null ? item.salePrice.toString() : ''
      );
      setIsSubmitting(false);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const normalQty = item.quantity || 0;
  const foilQty = item.quantityFoil || 0;
  const maxAvailable = selectedFinish === 'foil' ? foilQty : (normalQty > 0 ? normalQty : foilQty);
  const isFoil = selectedFinish === 'foil';
  const marketPrice = getCardPrice(item.card, isFoil, settings);
  const imageUri = getCardImageUri(item.card, 'normal');
  const rarityColor = getRarityColor(item.card.rarity);

  const handleFinishChange = (finish: 'normal' | 'foil') => {
    setSelectedFinish(finish);
    setQuantityToSell(1);
  };

  const handleIncrement = () => {
    if (quantityToSell < maxAvailable) {
      setQuantityToSell((prev) => prev + 1);
    }
  };

  const handleDecrement = () => {
    if (quantityToSell > 1) {
      setQuantityToSell((prev) => prev - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantityToSell <= 0 || quantityToSell > maxAvailable) return;

    let parsedPrice: number | null | undefined = undefined;
    if (customPriceInput.trim()) {
      const p = parseFloat(customPriceInput.replace(',', '.'));
      if (!isNaN(p) && p > 0) {
        parsedPrice = p;
      }
    }

    setIsSubmitting(true);
    try {
      await onConfirm(item, quantityToSell, isFoil, parsedPrice);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CircleDollarSign className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Wystaw na sprzedaż</h3>
              <p className="text-xs text-stone-400">Wybierz ile sztuk chcesz wystawić</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Card Info Banner */}
          <div className="flex items-center gap-3.5 bg-stone-950/80 p-3 rounded-2xl border border-stone-800">
            <div className="w-14 aspect-[2.5/3.5] rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-stone-800 shadow">
              <img
                src={imageUri}
                alt={item.card.name}
                referrerPolicy="no-referrer"
                onError={(e) => handleCardImageError(e, imageUri)}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="font-extrabold text-sm text-stone-100 truncate">
                {item.card.name}
              </h4>
              <div className="flex items-center gap-2 text-[11px] text-stone-400 flex-wrap">
                <span className="uppercase font-mono text-[10px]">{item.card.set} • #{item.card.collector_number}</span>
                <span>•</span>
                <span className={`font-semibold capitalize text-[10px] ${rarityColor}`}>{getRarityLabel(item.card.rarity)}</span>
                <span>•</span>
                <span className="font-mono text-stone-300 font-bold">{item.condition} / {item.language}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-400">
                <span>Cena rynkowa:</span>
                <strong className="text-emerald-300 font-mono font-black">{formatCurrency(marketPrice, settings.currency)}</strong>
              </div>
            </div>
          </div>

          {/* Finish selector (if both normal and foil available) */}
          {normalQty > 0 && foilQty > 0 && (
            <div>
              <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                Wersja karty
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFinishChange('normal')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedFinish === 'normal'
                      ? 'bg-stone-800 text-stone-100 border-emerald-500 shadow-sm'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Zwykła ({normalQty} szt.)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFinishChange('foil')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedFinish === 'foil'
                      ? 'bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Foil ({foilQty} szt.)</span>
                </button>
              </div>
            </div>
          )}

          {/* Quantity Stepper */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Ilość wystawianych sztuk
              </label>
              <span className="text-xs text-stone-400 font-mono">
                W kolekcji: <strong className="text-stone-200">{maxAvailable} szt.</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-stone-950 border border-stone-800 rounded-2xl p-1 shadow-inner">
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={quantityToSell <= 1}
                  className="w-10 h-10 rounded-xl bg-stone-900 hover:bg-stone-850 disabled:opacity-30 text-stone-300 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <input
                  type="number"
                  min={1}
                  max={maxAvailable}
                  value={quantityToSell}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) {
                      setQuantityToSell(Math.min(maxAvailable, Math.max(1, v)));
                    }
                  }}
                  className="w-16 bg-transparent text-center font-mono font-black text-lg text-emerald-300 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={quantityToSell >= maxAvailable}
                  className="w-10 h-10 rounded-xl bg-stone-900 hover:bg-stone-850 disabled:opacity-30 text-stone-300 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick all button */}
              <button
                type="button"
                onClick={() => setQuantityToSell(maxAvailable)}
                className="px-3.5 py-2.5 bg-stone-950 hover:bg-stone-850 text-stone-300 hover:text-emerald-300 border border-stone-800 rounded-2xl text-xs font-bold transition-all cursor-pointer"
              >
                Wszystkie ({maxAvailable})
              </button>
            </div>
          </div>

          {/* Optional Custom Sale Price */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-400" />
                <span>Własna cena za sztukę (opcjonalnie)</span>
              </label>
              <span className="text-[11px] font-mono text-stone-500">{settings.currency}</span>
            </div>
            <input
              type="text"
              value={customPriceInput}
              onChange={(e) => setCustomPriceInput(e.target.value)}
              placeholder={`np. ${formatCurrency(marketPrice, settings.currency)} (domyślnie rynkowa)`}
              className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none transition-colors font-mono"
            />
            <p className="text-[10px] text-stone-500 mt-1">
              Pozostaw puste, aby cena była automatycznie pobierana z rynkowych notowań Cardmarket/TCGPlayer.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isSubmitting || quantityToSell <= 0 || quantityToSell > maxAvailable}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-2 cursor-pointer"
            >
              <CircleDollarSign className="w-4 h-4 stroke-[2.2]" />
              <span>{isSubmitting ? 'Zapisywanie...' : `Wystaw ${quantityToSell} szt. na sprzedaż`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
