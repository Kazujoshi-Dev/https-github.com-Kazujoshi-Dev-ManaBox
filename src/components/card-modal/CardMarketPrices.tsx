import React from 'react';
import { Coins, Sparkles, Check, ExternalLink, FolderHeart, Gamepad2 } from 'lucide-react';
import { ScryfallCard } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { CardMarketPricesProps } from './types';
import { isDigitalOnly } from '../../utils/mtgFormats';
import { useT } from '../../i18n';

export const CardMarketPrices: React.FC<CardMarketPricesProps> = ({
  activeCard,
  isFoil,
  plnPriceNorm,
  plnPriceFoil,
  onToggleFoil,
  onAddToWishlist,
  isOnWishlist = false,
}) => {
  const t = useT();
  return (
    <>
      {/* Price Table from Scryfall (Interactive Foil / Standard selector) */}
      <div className="w-full bg-stone-950/80 p-3.5 rounded-xl border border-stone-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-stone-400 flex items-center gap-1.5 tabular-nums">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('Aktualne Ceny Rynkowe (Scryfall)')}</span>
          </p>
          <span className="text-[11px] text-amber-400/80 tabular-nums">
            {t('Kliknij, aby wybrać')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* PLN Polska (Standard) Cell */}
          <button
            type="button"
            onClick={() => onToggleFoil(false, true)}
            title={t('Kliknij, aby wybrać wersję Standard (Non-Foil) i przestawić cenę')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
              !isFoil
                ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-amber-500/30'
            }`}
          >
            <div className="flex items-center justify-between gap-1 w-full">
              <p className={`text-[11px] font-bold ${!isFoil ? 'text-amber-400' : 'text-stone-400'}`}>
                {t('PLN Polska (Standard)')}
              </p>
              {!isFoil && (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  {t('Wybrana')}
                </span>
              )}
            </div>
            <p className="tabular-nums font-bold text-emerald-400 text-sm mt-1">
              {formatCurrency(plnPriceNorm, 'PLN')}
            </p>
            <span className="text-[11px] text-stone-500 group-hover:text-amber-300/90 mt-1 transition-colors">
              {!isFoil ? t('✓ Aktywna wersja zwykła') : t('Kliknij: wybierz Standard')}
            </span>
          </button>

          {/* PLN Foil Cell */}
          <button
            type="button"
            onClick={() => onToggleFoil(true, true)}
            title={t('Kliknij, aby wybrać wersję Foil (Błyszcząca) i przestawić cenę')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
              isFoil
                ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-500/50 shadow-lg'
                : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-amber-500/50'
            }`}
          >
            <div className="flex items-center justify-between gap-1 w-full">
              <p className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>{t('PLN Foil')}</span>
              </p>
              {isFoil && (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/30 px-1 py-0.2 rounded flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  {t('Wybrana')}
                </span>
              )}
            </div>
            <p className="tabular-nums font-bold text-amber-300 text-sm mt-1">
              {formatCurrency(plnPriceFoil, 'PLN')}
            </p>
            <span className="text-[11px] text-stone-500 group-hover:text-amber-300/90 mt-1 transition-colors">
              {isFoil ? t('✓ Aktywna wersja błyszcząca') : t('Kliknij: wybierz Foil')}
            </span>
          </button>

          {/* EUR Standard */}
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-800 text-left">
            <p className="text-[11px] text-stone-400">{t('EUR Standard')}</p>
            <p className="tabular-nums font-bold text-amber-300 text-sm mt-0.5">
              {formatCurrency(activeCard.prices?.eur, 'EUR')}
            </p>
          </div>

          {/* USD Standard */}
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-800 text-left">
            <p className="text-[11px] text-stone-400">{t('USD Standard')}</p>
            <p className="tabular-nums font-bold text-stone-300 text-sm mt-0.5">
              {formatCurrency(activeCard.prices?.usd, 'USD')}
            </p>
          </div>
        </div>

        {activeCard.scryfall_uri && (
          <a
            href={activeCard.scryfall_uri}
            target="_blank"
            rel="noreferrer"
            className="w-full mt-2 py-2 px-3 bg-stone-900 hover:bg-stone-800 text-stone-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-stone-800 transition-colors"
          >
            <span>{t('Zobacz ten print na Scryfall.com')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {isOnWishlist ? (
        <p className="w-full py-2 px-3 bg-rose-950/30 text-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-rose-800/40">
          <FolderHeart className="w-4 h-4 text-rose-400" />
          <span>{t('Na liście życzeń: zmiany wersji i foil zapisują się automatycznie')}</span>
        </p>
      ) : onAddToWishlist && isDigitalOnly(activeCard) ? (
        <p className="w-full py-2 px-3 bg-stone-900 text-stone-400 rounded-xl text-xs flex items-center justify-center gap-2 border border-stone-800">
          <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{t('Karta tylko z MTG Arena: nie można jej dodać do listy życzeń ani na sprzedaż')}</span>
        </p>
      ) : onAddToWishlist && (
        <button
          type="button"
          onClick={() => onAddToWishlist(activeCard, isFoil)}
          className="w-full py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-rose-800/50 transition-colors cursor-pointer"
        >
          <FolderHeart className="w-4 h-4 text-rose-400" />
          <span>{t('Dodaj do Listy Życzeń')}</span>
        </button>
      )}
    </>
  );
};
