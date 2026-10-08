import React from 'react';
import { X, Layers, Sparkles } from 'lucide-react';
import { ManaSymbol } from '../ManaSymbol';
import { CardModalHeaderProps } from './types';
import { useT } from '../../i18n';

export const CardModalHeader: React.FC<CardModalHeaderProps> = ({
  cardName,
  manaCost,
  isPromo,
  activeTab,
  printsCount,
  isLoadingPrints,
  onSelectTab,
  onClose,
}) => {
  const t = useT();
  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-800 bg-stone-950/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-3 min-w-0 flex-1 basis-full sm:basis-auto order-1">
        <h2 className="text-xl sm:text-2xl font-bold text-amber-100 tracking-tight flex items-center gap-2">
          <span>{cardName}</span>
          {isPromo && (
            <span className="text-[11px] tabular-nums px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {t('Promo')}
            </span>
          )}
        </h2>
        <ManaSymbol cost={manaCost} size="md" />
      </div>

      <div className="flex items-center gap-2 order-2 ml-auto">
        {/* Combos Switcher Pill */}
        <button
          onClick={() => onSelectTab(activeTab === 'combos' ? 'details' : 'combos')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeTab === 'combos'
              ? 'bg-amber-500 text-stone-950 border-amber-500 shadow-md'
              : 'bg-stone-900 hover:bg-stone-800 text-amber-300 border-amber-500/30'
          }`}
          title={t('Przeglądaj kombinacje Commander Spellbook dla tej karty')}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('Combo Spellbook')}</span>
        </button>

        {/* Prints Switcher Pill */}
        <button
          onClick={() => onSelectTab(activeTab === 'prints' ? 'details' : 'prints')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeTab === 'prints'
              ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
              : 'bg-stone-900 hover:bg-stone-800 text-amber-400 border-amber-500/30'
          }`}
          title={t('Przełącz widok wydań karty')}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t('Wersje')} ({isLoadingPrints ? '...' : printsCount})</span>
        </button>

        <button
          onClick={onClose}
          className="w-10 h-10 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-100 border border-stone-800 transition-colors cursor-pointer"
          aria-label={t('Zamknij okno')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

