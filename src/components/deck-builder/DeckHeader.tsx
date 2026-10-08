import React from 'react';
import { ArrowLeft, Crown, Layers, Globe, Plus, FileText, Sparkles, Share2, Gamepad2, Swords } from 'lucide-react';
import { getDeckFormat } from '../../utils/mtgFormats';
import { WildcardCost } from './WildcardCost';
import { formatCurrency } from '../../utils/formatters';
import { DeckHeaderProps } from './types';
import { useT } from '../../i18n';

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
  onExportArena,
  wildcardCost,
}) => {
  const t = useT();
  const fmt = getDeckFormat(format);
  const isArena = fmt.platform === 'arena';
  const sizeOk = fmt.exactSize ? totalCardsCount === fmt.deckSize : totalCardsCount >= fmt.deckSize;
  const sizeOver = fmt.exactSize && totalCardsCount > fmt.deckSize;
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      {/* Deck Title, Format & Card Source */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition-colors cursor-pointer"
          title={t('Wróć do listy kolekcji')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
              {name}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 tabular-nums">
              {isArena ? <Gamepad2 className="w-3.5 h-3.5 text-amber-400" /> : fmt.commander ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Swords className="w-3.5 h-3.5 text-amber-400" />}
              <span>{fmt.label}</span>
            </span>

            {/* Card Source Badge & Switcher (talie MTG Arena zawsze korzystają z pełnej bazy kart) */}
            {!isArena && (
            <button
              type="button"
              onClick={onToggleCardSource}
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 tabular-nums border transition-all cursor-pointer ${
                cardSource === 'collection'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
              }`}
              title={t('Kliknij, aby przełączyć źródło wyszukiwania kart')}
            >
              {cardSource === 'collection' ? (
                <>
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('Źródło: Tylko kolekcja')}</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('Źródło: Wszystkie karty MTG')}</span>
                </>
              )}
            </button>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {description || t('Talia w formacie {format}: {description}', { format: fmt.label, description: t(fmt.description) })}
          </p>
        </div>
      </div>

      {/* Metrics & Add Card Action */}
      <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
        {/* Card Count Indicator */}
        <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
          <span className="text-xs text-stone-400">{t('Liczba kart:')}</span>
          <span
            className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded ${
              sizeOk
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : sizeOver
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
            title={fmt.exactSize ? t('Talia musi mieć dokładnie {deckSize} kart', { deckSize: fmt.deckSize }) : t('Talia musi mieć co najmniej {deckSize} kart', { deckSize: fmt.deckSize })}
          >
            {totalCardsCount} / {fmt.exactSize ? '' : 'min. '}{fmt.deckSize}
          </span>
        </div>

        {/* Talie MTGA: koszt w wildcardach zamiast ceny; papierowe: wartość rynkowa */}
        {isArena && wildcardCost ? (
          <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
            <span className="text-xs text-stone-400">{t('Wildcardy:')}</span>
            <WildcardCost cost={wildcardCost} />
          </div>
        ) : (
          <div className="bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 flex items-center gap-2">
            <span className="text-xs text-stone-400">{t('Wartość rynkowa:')}</span>
            <span className="text-sm font-bold text-amber-300 tabular-nums">
              {formatCurrency(totalDeckValue, currency)}
            </span>
          </div>
        )}

        {/* Commander Spellbook Combos Button */}
        {onOpenCombos && (
          <button
            type="button"
            onClick={onOpenCombos}
            className="px-3.5 py-2 bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border border-amber-500/40 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-950/30 group"
            title={t('Sprawdź kombinacje i nieskończone pętle talii w bazie Commander Spellbook')}
          >
            <Sparkles className="w-4 h-4 text-amber-300 group-hover:text-amber-300 transition-colors" />
            <span>{t('Combo (Spellbook)')}</span>
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
            title={t('Udostępnij talię publicznym linkiem')}
          >
            <Share2 className="w-4 h-4" />
            <span>{isPublic ? t('Udostępniona') : t('Udostępnij')}</span>
          </button>
        )}

        {/* Eksport do MTG Arena (tylko formaty MTGA) */}
        {isArena && onExportArena && (
          <button
            type="button"
            onClick={onExportArena}
            className="px-3 py-2 bg-stone-850 hover:bg-stone-800 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title={t('Skopiuj listę talii w formacie importu MTG Arena')}
          >
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            <span>{t('Eksport do MTGA')}</span>
          </button>
        )}

        {/* Import / Export TXT Button */}
        {onOpenImportExport && (
          <button
            type="button"
            onClick={onOpenImportExport}
            className="px-3 py-2 bg-stone-850 hover:bg-stone-800 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title={t('Importuj lub eksportuj talię jako plik .txt (np. format \'1x Talisman of Impulse (tdc) 332\')')}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>{t('Plik .txt')}</span>
          </button>
        )}

        {/* Add Card to Deck Button */}
        <button
          onClick={onOpenAddModal}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{t('Dodaj kartę do talii')}</span>
        </button>
      </div>
    </div>
  );
};
