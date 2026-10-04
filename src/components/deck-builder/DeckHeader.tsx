import React from 'react';
import { ArrowLeft, Crown, Layers, Globe, Plus, FileText, Sparkles, Share2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { DeckHeaderProps } from './types';

export const DeckHeader: React.FC<DeckHeaderProps> = ({
  name,
  format,
  description,
  cardSource,
  totalCardsCount,
  totalDeckValue,
  currency,
  onBack,
  onToggleCardSource,
  onOpenAddModal,
  onOpenImportExport,
  onOpenCombos,
  onOpenShare,
  isPublic = false,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      {/* Deck Title, Format & Card Source */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition-colors cursor-pointer"
          title="Wróć do listy kolekcji"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
              {name}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 tabular-nums">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>{format || 'EDH Commander'}</span>
            </span>

            {/* Card Source Badge & Switcher */}
            <button
              type="button"
              onClick={onToggleCardSource}
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 tabular-nums border transition-all cursor-pointer ${
                cardSource === 'collection'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
              }`}
              title="Kliknij, aby przełączyć źródło wyszukiwania kart"
            >
              {cardSource === 'collection' ? (
                <>
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Źródło: Tylko kolekcja</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Źródło: Wszystkie karty MTG</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {description || 'Talia w formacie EDH Commander (1 Dowódca + 99 kart w talii)'}
          </p>
        </div>
      </div>

      {/* Metrics & Add Card Action */}
      <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
        {/* Card Count Indicator */}
        <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
          <span className="text-xs text-stone-400">Liczba kart:</span>
          <span
            className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded ${
              totalCardsCount === 100
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : totalCardsCount > 100
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {totalCardsCount} / 100
          </span>
        </div>

        {/* Total Estimated Deck Value */}
        <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
          <span className="text-xs text-stone-400">Wartość rynkowa:</span>
          <span className="text-sm font-bold text-amber-300 tabular-nums">
            {formatCurrency(totalDeckValue, currency)}
          </span>
        </div>

        {/* Commander Spellbook Combos Button */}
        {onOpenCombos && (
          <button
            type="button"
            onClick={onOpenCombos}
            className="px-3.5 py-2 bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border border-amber-500/40 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-950/30 group"
            title="Sprawdź kombinacje i nieskończone pętle talii w bazie Commander Spellbook"
          >
            <Sparkles className="w-4 h-4 text-amber-300 group-hover:text-amber-300 transition-colors" />
            <span>Combo (Spellbook)</span>
          </button>
        )}

        {/* Publiczny link */}
        {onOpenShare && (
          <button
            type="button"
            onClick={onOpenShare}
            className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all cursor-pointer ${
              isPublic
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                : 'bg-stone-850 hover:bg-stone-800 text-stone-200 border-stone-700'
            }`}
            title="Udostępnij talię publicznym linkiem"
          >
            <Share2 className="w-4 h-4" />
            <span>{isPublic ? 'Udostępniona' : 'Udostępnij'}</span>
          </button>
        )}

        {/* Import / Export TXT Button */}
        {onOpenImportExport && (
          <button
            type="button"
            onClick={onOpenImportExport}
            className="px-3 py-2 bg-stone-850 hover:bg-stone-800 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Importuj lub eksportuj talię jako plik .txt (np. format '1x Talisman of Impulse (tdc) 332')"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Plik .txt</span>
          </button>
        )}

        {/* Add Card to Deck Button */}
        <button
          onClick={onOpenAddModal}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Dodaj kartę do talii</span>
        </button>
      </div>
    </div>
  );
};
